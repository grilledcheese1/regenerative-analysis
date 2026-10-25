import {
  MODEL_VERSION,
  SCHEMA_VERSION,
  type CandidateTerms,
  type CatalogVehicle,
  type Cents,
  type Comparison,
  type CreditProfile,
  type LoanApplication,
  type LoanDecision,
  type EvidenceFact,
  type OptionResult,
  type Persona,
  type SourceKind,
} from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { monthlyFuel } from "@/domain/finance/fuel";
import { leasePayment, monthsBetween, projectLeaseMileage } from "@/domain/finance/lease";
import { amortize } from "@/domain/finance/loan";
import { CREDIT_POLICY, LEASE_MF_TIER_ADJ } from "@/domain/credit/config";
import { LEASE_TERMS, leaseOffers, leaseTermResult, pickTerm } from "@/domain/finance/lease-terms";
import { reliabilityFor } from "@/domain/reliability";
import { underwrite } from "@/domain/credit/underwrite";
import { niceDate, usd } from "@/domain/format";
import { rankOptions } from "./rank";
import { recommend } from "./recommend";

export interface CompareInputs {
  persona: Persona;
  budget: BudgetSnapshot;
  catalog: CatalogVehicle[];
  asOf: string;
  overrides?: {
    gasCentsPerGallon?: number;
    monthlyMiles?: number;
    cityShare?: number; // 0..1, e.g. from imported drives
    usageSource?: SourceKind; // where monthlyMiles came from when overridden
  };
  /** When present, every borrowing option is underwritten and priced for this borrower. */
  credit?: CreditProfile;
}

interface Draft {
  optionId: string;
  label: string;
  kind: OptionResult["kind"];
  catalogId?: string;
  upfrontCashCents: Cents;
  monthlyPaymentCents: Cents; // average over the horizon
  paymentsTotalCents: Cents;
  monthlyRunningCents: Cents;
  saleReceiptCents: Cents;
  startingEquityCents: Cents;
  endingDebtCents: Cents;
  endingValueCents: Cents;
  missingInputs: string[];
  tradeoff: string;
  credit?: LoanDecision;
  avgMonthlyCostCents?: Cents; // leases: over the picked term; others are derived from the horizon
  lease?: OptionResult["lease"];
  warranty?: string;
  switchMath?: Omit<NonNullable<OptionResult["switchMath"]>, "savingsPerMonthCents">;
}

const WARRANTY_NOTE = "Repairs after 3 years or 36,000 miles aren't covered by Toyota's basic warranty.";

export function compareOptions({ persona, budget, catalog, asOf, overrides = {}, credit }: CompareInputs): Comparison {
  const { contract, vehicle, usage, scenario, costs } = persona;
  const H = scenario.horizonMonths;
  const gas = overrides.gasCentsPerGallon ?? scenario.gasCentsPerGallon;
  const miles = overrides.monthlyMiles ?? usage.monthlyMiles;
  const cityShare = overrides.cityShare ?? usage.cityShare;
  const byId = (id: string) => {
    const v = catalog.find((c) => c.catalogId === id);
    if (!v) throw new Error(`Unknown catalog vehicle ${id}`);
    return v;
  };
  const current = byId(vehicle.catalogId);

  const running = (v: CatalogVehicle, insurance: Cents, maintenance: Cents) =>
    monthlyFuel(v, miles, cityShare, gas).costCents + insurance + maintenance;
  const currentRunning = running(current, costs.insuranceMonthlyCents, costs.maintenanceMonthlyCents);
  const currentPayment = contract.type === "owned" ? 0 : contract.paymentCents;
  const uw = (app: LoanApplication): LoanDecision | undefined => (credit ? underwrite(app, credit) : undefined);
  const aprOf = (d: LoanDecision | undefined, fallbackBps: number) => d?.aprBps ?? fallbackBps;

  const evidence: EvidenceFact[] = [
    {
      id: "vehicle_budget",
      label: "Monthly vehicle budget",
      display: usd(budget.vehicleBudgetCents),
      source: "derived",
      formula: "recurring income − other spending − savings goal − buffer",
    },
    {
      id: "recurring_income",
      label: "Recurring income (confirm)",
      display: `${usd(budget.recurringIncomeCents)}/mo from ${budget.incomeDeposits} deposits`,
      source: "derived",
    },
    {
      id: "available_upfront_cash",
      label: "Cash available for the decision",
      display: usd(budget.availableUpfrontCashCents),
      source: "derived",
      formula: "liquid cash − protected reserve − committed cash",
    },
    { id: "monthly_miles", label: "Monthly miles", display: `${miles.toLocaleString()} mi`, source: overrides.usageSource ?? usage.source },
    {
      id: "city_share",
      label: "City driving share",
      display: `${Math.round(cityShare * 100)}% city`,
      source: overrides.cityShare !== undefined ? "modeled" : usage.source,
    },
    { id: "gas_price", label: "Gas price", display: `${usd(gas, 2)}/gal`, source: "user_reported" },
    {
      id: "current_mpg",
      label: `${current.modelYear} ${current.model} rating`,
      display: `${current.cityMpg} city / ${current.highwayMpg} hwy mpg (fueleconomy.gov #${current.fuelEconomyId})`,
      source: "observed",
    },
  ];

  const drafts: Draft[] = [];
  const notConsidered: Comparison["notConsidered"] = [];
  let preparation: Comparison["preparation"] = null;
  const currentValue = vehicle.estimatedValueCents.known ? vehicle.estimatedValueCents.value : null;

  const candidateDraft = (
    c: CandidateTerms,
    base: { upfront: Cents; startingEquity: Cents; saleReceipt: Cents; principalCredit: Cents; label: string; missing: string[]; equityApplied?: Cents },
  ): Draft => {
    const switching = base.label === "switch";
    const v = byId(c.catalogId);
    const monthlyRunning = running(v, c.insuranceMonthlyCents, c.maintenanceMonthlyCents);
    const name = `${v.modelYear} ${v.model}`;
    if (c.acquisition === "lease") {
      // Every term on offer, priced for this borrower's credit tier; the cheapest feasible one represents the car.
      // A lease is underwritten on its own payment: once to find the tier, again for the picked term.
      const offers = leaseOffers(c);
      const leaseApp = (o: (typeof offers)[number], paymentCents: Cents): LoanApplication => ({
        purpose: "lease",
        vehicleCondition: "new",
        amountCents: c.priceCents - o.residualCents,
        termMonths: o.termMonths,
        collateralValueCents: c.priceCents,
        replacesPaymentCents: currentPayment,
        paymentCents,
      });
      const base36 = offers.find((o) => o.termMonths === 36) ?? offers[0];
      const tierPass = uw(leaseApp(base36, leasePayment(c.priceCents, base36.residualCents, base36.termMonths, base36.moneyFactor)));
      const terms = offers.map((offer) =>
        leaseTermResult({
          capCostCents: c.priceCents,
          offer,
          mfAdjust: tierPass ? LEASE_MF_TIER_ADJ[tierPass.tier] : 0,
          monthlyRunningCents: monthlyRunning,
          monthlyMiles: miles,
          dispositionFeeCents: LEASE_TERMS.dispositionFeeCents,
          equityAppliedCents: base.equityApplied ?? 0,
          extraUpfrontCents: base.upfront,
          budgetCents: budget.vehicleBudgetCents,
          availableUpfrontCents: budget.availableUpfrontCashCents,
        }),
      );
      const chosen = pickTerm(terms);
      const pay = chosen.paymentCents;
      const decision = uw(leaseApp(offers.find((o) => o.termMonths === chosen.termMonths)!, pay));
      return {
        optionId: `${base.label}_lease_${c.catalogId}`,
        label: `${switching ? "Switch now: lease" : base.label === "return" ? "Return and lease" : "Lease"} ${name}`,
        kind: switching ? "switch_now" : "lease_new",
        catalogId: c.catalogId,
        upfrontCashCents: base.upfront + Math.max(0, chosen.dueAtSigningCents - (base.equityApplied ?? 0)),
        monthlyPaymentCents: pay,
        paymentsTotalCents: pay * Math.min(H, chosen.termMonths),
        monthlyRunningCents: monthlyRunning,
        saleReceiptCents: base.saleReceipt + Math.max(0, (base.equityApplied ?? 0) - chosen.dueAtSigningCents),
        startingEquityCents: base.startingEquity,
        endingDebtCents: 0,
        endingValueCents: c.endValueCents,
        missingInputs: [...base.missing, "lease_taxes_and_fees"],
        tradeoff: "No equity at the end, but no resale risk and a predictable payment.",
        avgMonthlyCostCents: chosen.avgMonthlyCostCents,
        lease: { chosenTermMonths: chosen.termMonths, terms },
        ...(chosen.pastWarranty && { warranty: WARRANTY_NOTE }),
        ...(decision && { credit: decision }),
      };
    }
    if (c.acquisition === "cash") {
      return {
        optionId: `${base.label}_cash_${c.catalogId}`,
        label: `${switching ? "Switch now: buy" : base.label === "sell" ? "Sell and buy" : "Buy"} ${name} with cash`,
        kind: switching ? "switch_now" : base.label === "sell" ? "sell_replace" : "purchase_new",
        catalogId: c.catalogId,
        upfrontCashCents: base.upfront + c.priceCents - base.saleReceipt,
        monthlyPaymentCents: 0,
        paymentsTotalCents: 0,
        monthlyRunningCents: monthlyRunning,
        saleReceiptCents: 0, // already netted against the price in upfront cash
        startingEquityCents: base.startingEquity,
        endingDebtCents: 0,
        endingValueCents: c.endValueCents,
        missingInputs: base.missing,
        tradeoff: "No new debt, but it ties up a large amount of cash.",
      };
    }
    const principal = c.priceCents - c.dueAtSigningCents - base.principalCredit;
    const decision = uw({ purpose: "finance", vehicleCondition: "new", amountCents: principal, termMonths: scenario.financeTermMonths, collateralValueCents: c.priceCents, replacesPaymentCents: currentPayment });
    const loan = amortize(principal, aprOf(decision, scenario.financeAprBps), scenario.financeTermMonths, H);
    return {
      optionId: `${base.label}_finance_${c.catalogId}`,
      label: `${switching ? "Switch now: finance" : base.label === "sell" ? "Sell and finance" : base.label === "return" ? "Return and finance" : "Finance"} ${name}`,
      kind: switching ? "switch_now" : base.label === "sell" ? "sell_replace" : "purchase_new",
      catalogId: c.catalogId,
      upfrontCashCents: base.upfront + c.dueAtSigningCents,
      monthlyPaymentCents: loan.paymentCents,
      paymentsTotalCents: loan.paidCents,
      monthlyRunningCents: monthlyRunning,
      saleReceiptCents: 0,
      startingEquityCents: base.startingEquity,
      endingDebtCents: loan.balanceCents,
      endingValueCents: c.endValueCents,
      missingInputs: base.missing,
      tradeoff: `Builds equity, but leaves ${usd(loan.balanceCents)} owed at the horizon.`,
      ...(decision && { credit: decision }),
    };
  };

  if (contract.type === "lease" && contract.earlyPayoffCents !== undefined && contract.tradeInValueCents !== undefined) {
    // Mid-lease: continue to maturity, or trade the car in today and put any equity toward the next car.
    const monthsLeft = Math.max(1, monthsBetween(asOf, contract.maturityDate));
    const mileage = projectLeaseMileage(vehicle.odometerMiles, miles * monthsLeft, contract.totalAllowedMiles, contract.excessCentsPerMile);
    const disposition = contract.dispositionFeeCents.known ? contract.dispositionFeeCents.value : 0;
    const continueAvg = Math.round(((contract.paymentCents + currentRunning) * monthsLeft + disposition + mileage.overageCents) / monthsLeft);
    const payoff = contract.earlyPayoffCents;
    const tradeIn = contract.tradeInValueCents;
    const equity = tradeIn - payoff;
    evidence.push(
      { id: "lease_end_date", label: "Lease ends", display: niceDate(contract.maturityDate), source: "synthetic" },
      { id: "early_payoff", label: "Early payoff to end the lease today", display: usd(payoff), source: "synthetic" },
      { id: "trade_in_value", label: "Trade-in value today", display: usd(tradeIn), source: "synthetic" },
      { id: "trade_in_equity", label: "Trade-in equity", display: usd(equity), source: "derived", formula: "trade-in value − early payoff" },
      {
        id: "continue_lease_avg",
        label: "Continuing the lease, per month",
        display: `${usd(continueAvg)}/mo`,
        source: "derived",
        formula: "(payments + running costs) × months left + turn-in fee + mileage charge, ÷ months left",
      },
      {
        id: "projected_mileage",
        label: "Projected miles at lease end",
        display: `${mileage.projectedEndMiles.toLocaleString()} of ${contract.totalAllowedMiles.toLocaleString()} allowed`,
        source: "derived",
        formula: "odometer + monthly miles × months left",
      },
    );
    drafts.push({
      optionId: "continue_lease",
      label: `Continue the lease to ${niceDate(contract.maturityDate)}`,
      kind: "keep",
      catalogId: current.catalogId,
      upfrontCashCents: 0,
      monthlyPaymentCents: contract.paymentCents,
      paymentsTotalCents: contract.paymentCents * Math.min(H, monthsLeft),
      monthlyRunningCents: currentRunning,
      saleReceiptCents: 0,
      startingEquityCents: 0,
      endingDebtCents: 0,
      endingValueCents: 0,
      missingInputs: [],
      tradeoff: `No paperwork now, but the current rate stays until ${niceDate(contract.maturityDate)}.`,
      avgMonthlyCostCents: continueAvg,
    });
    for (const c of scenario.candidates) {
      const d = candidateDraft(c, {
        upfront: Math.max(0, -equity), // negative equity is paid in cash, never rolled into the new deal
        startingEquity: 0,
        saleReceipt: c.acquisition === "cash" ? Math.max(0, equity) : 0,
        principalCredit: c.acquisition === "finance" ? Math.max(0, equity) : 0,
        equityApplied: c.acquisition === "lease" ? Math.max(0, equity) : 0,
        label: "switch",
        missing: ["payoff_statement", "confirmed_trade_in_offer"],
      });
      const chosen = d.lease ? d.lease.terms.find((t) => t.termMonths === d.lease!.chosenTermMonths)! : null;
      const applied = Math.max(0, equity);
      d.switchMath = {
        earlyPayoffCents: payoff,
        tradeInValueCents: tradeIn,
        equityCents: equity,
        dueAtSigningAfterEquityCents: chosen ? Math.max(0, chosen.dueAtSigningCents - applied) : c.dueAtSigningCents,
        cashBackCents: chosen ? Math.max(0, applied - chosen.dueAtSigningCents) : 0,
        continueAvgMonthlyCents: continueAvg,
      };
      d.tradeoff =
        equity >= 0
          ? `Trading in today frees ${usd(equity)} of equity toward the next car.`
          : `The car is worth ${usd(-equity)} less than the early payoff; that gap is paid in cash.`;
      drafts.push(d);
    }
    notConsidered.push({ label: "Buy out the lease today", reason: "An early buyout needs a payoff statement and isn't compared here" });
  } else if (contract.type === "lease") {
    const monthsLeft = monthsBetween(asOf, contract.maturityDate);
    const mileage = projectLeaseMileage(vehicle.odometerMiles, miles * monthsLeft, contract.totalAllowedMiles, contract.excessCentsPerMile);
    preparation = {
      months: monthsLeft,
      cashCents: (contract.paymentCents + currentRunning) * monthsLeft,
      note: "Remaining lease payments and running costs until maturity, common to every option.",
    };
    evidence.push(
      { id: "lease_end_date", label: "Lease ends", display: niceDate(contract.maturityDate), source: persona.id.startsWith("u_") ? "user_reported" : "synthetic" },
      {
        id: "projected_mileage",
        label: "Projected miles at lease end",
        display: `${mileage.projectedEndMiles.toLocaleString()} of ${contract.totalAllowedMiles.toLocaleString()} allowed`,
        source: "derived",
        formula: "odometer + monthly miles × months left",
      },
      {
        id: "mileage_overage",
        label: "Possible mileage charge if returned",
        display: `${usd(mileage.overageCents)} (${mileage.excessMiles.toLocaleString()} mi × ${contract.excessCentsPerMile}¢)`,
        source: "derived",
      },
    );

    const disposition = contract.dispositionFeeCents.known ? contract.dispositionFeeCents.value : 0;
    const returnMissing = contract.dispositionFeeCents.known ? [] : ["disposition_fee"];
    const returnBase = {
      upfront: mileage.overageCents + disposition,
      startingEquity: 0,
      saleReceipt: 0,
      principalCredit: 0,
      label: "return",
      missing: returnMissing,
    };

    // Buyout: the quote if we have one, otherwise the contract purchase option, flagged incomplete.
    const quote = contract.buyoutQuote.known ? contract.buyoutQuote.value : null;
    const price = quote?.amountCents ?? (contract.purchaseOptionCents.known ? contract.purchaseOptionCents.value : null);
    if (price === null) {
      notConsidered.push({ label: "Buy out the lease", reason: "No purchase option or buyout quote on file" });
    } else {
      const decision = uw({ purpose: "buyout", vehicleCondition: "used", amountCents: price, termMonths: scenario.financeTermMonths, collateralValueCents: currentValue, replacesPaymentCents: currentPayment });
      const loan = amortize(price, aprOf(decision, scenario.financeAprBps), scenario.financeTermMonths, H);
      evidence.push({
        id: "purchase_option",
        label: quote ? "Buyout quote" : "Contract purchase option (before taxes and fees)",
        display: usd(price),
        source: quote ? quote.source : "synthetic",
      });
      drafts.push({
        optionId: "buyout_finance",
        label: `Buy out the ${current.modelYear} ${current.model}`,
        kind: "buyout",
        catalogId: current.catalogId,
        upfrontCashCents: 0,
        monthlyPaymentCents: loan.paymentCents,
        paymentsTotalCents: loan.paidCents,
        monthlyRunningCents: currentRunning,
        saleReceiptCents: 0,
        startingEquityCents: 0,
        endingDebtCents: loan.balanceCents,
        endingValueCents: scenario.currentVehicleEndValueCents,
        missingInputs: quote?.includesTaxesAndFees ? [] : ["confirmed_buyout_taxes_and_fees"],
        tradeoff: "Keeps a car you know, and no mileage charge applies, but you take on resale risk.",
        ...(decision && { credit: decision }),
      });
    }
    for (const c of scenario.candidates) drafts.push(candidateDraft(c, returnBase));
    notConsidered.push({
      label: "Return without replacing",
      reason: "Needs a transport alternative and its costs; it is not free transportation",
    });
  } else if (contract.type === "owned") {
    if (currentValue === null) {
      notConsidered.push({ label: "Sell and replace", reason: "Current vehicle value unknown" });
    }
    const startingEquity = currentValue ?? 0;
    evidence.push({
      id: "current_value",
      label: "Current vehicle value",
      display: currentValue === null ? "Unknown" : usd(currentValue),
      source: vehicle.valuationSource,
    });
    drafts.push({
      optionId: "keep",
      label: `Keep the ${current.modelYear} ${current.model}`,
      kind: "keep",
      catalogId: current.catalogId,
      upfrontCashCents: 0,
      monthlyPaymentCents: 0,
      paymentsTotalCents: 0,
      monthlyRunningCents: currentRunning,
      saleReceiptCents: 0,
      startingEquityCents: startingEquity,
      endingDebtCents: 0,
      endingValueCents: scenario.currentVehicleEndValueCents,
      missingInputs: [],
      tradeoff: "Lowest commitment; running costs and repairs may rise as the car ages.",
    });
    if (currentValue !== null) {
      for (const c of scenario.candidates) {
        drafts.push(
          candidateDraft(c, {
            upfront: 0,
            startingEquity,
            saleReceipt: currentValue,
            principalCredit: c.acquisition === "finance" ? currentValue : 0,
            label: "sell",
            missing: ["confirmed_sale_price"],
          }),
        );
      }
    }
  } else {
    const startingEquity = (currentValue ?? 0) - contract.payoffCents;
    const keepLoan = amortize(contract.payoffCents, contract.aprBps, contract.remainingMonths, H);
    evidence.push(
      { id: "payoff", label: "Loan payoff (estimate)", display: usd(contract.payoffCents), source: "synthetic" },
      {
        id: "current_equity",
        label: "Equity in current vehicle",
        display: currentValue === null ? "Unknown" : usd(startingEquity),
        source: "derived",
        formula: "estimated value − payoff",
      },
    );
    drafts.push({
      optionId: "keep",
      label: `Keep the ${current.modelYear} ${current.model}`,
      kind: "keep",
      catalogId: current.catalogId,
      upfrontCashCents: 0,
      monthlyPaymentCents: keepLoan.paymentCents,
      paymentsTotalCents: keepLoan.paidCents,
      monthlyRunningCents: currentRunning,
      saleReceiptCents: 0,
      startingEquityCents: startingEquity,
      endingDebtCents: keepLoan.balanceCents,
      endingValueCents: scenario.currentVehicleEndValueCents,
      missingInputs: ["payoff_statement"],
      tradeoff: "No new paperwork, but the current payment stays.",
    });
    // With a credit profile every loan holder gets a refinance priced for them (remaining term, synthetic fee);
    // without one, the scenario's synthetic refinance terms apply.
    const refiDecision = uw({
      purpose: "refinance",
      vehicleCondition: "used",
      amountCents: contract.payoffCents,
      termMonths: contract.remainingMonths,
      collateralValueCents: currentValue,
      replacesPaymentCents: contract.paymentCents,
      currentAprBps: contract.aprBps,
      feeCents: CREDIT_POLICY.refinanceFeeCents,
    });
    const refiTerms = refiDecision
      ? { aprBps: refiDecision.aprBps, termMonths: contract.remainingMonths, feeCents: CREDIT_POLICY.refinanceFeeCents }
      : scenario.refinance;
    if (refiTerms) {
      const r = refiTerms;
      const loan = amortize(contract.payoffCents, r.aprBps, r.termMonths, H);
      drafts.push({
        optionId: "refinance",
        label: `Refinance over ${r.termMonths} months`,
        kind: "refinance",
        catalogId: current.catalogId,
        upfrontCashCents: r.feeCents,
        monthlyPaymentCents: loan.paymentCents,
        paymentsTotalCents: loan.paidCents,
        monthlyRunningCents: currentRunning,
        saleReceiptCents: 0,
        startingEquityCents: startingEquity,
        endingDebtCents: loan.balanceCents,
        endingValueCents: scenario.currentVehicleEndValueCents,
        missingInputs: ["payoff_statement", "lender_quote"],
        tradeoff:
          refiDecision?.worthIt === false
            ? "Doesn't beat your current rate by enough to cover the fees."
            : loan.balanceCents > keepLoan.balanceCents
              ? `Lower payment, but ${usd(loan.balanceCents - keepLoan.balanceCents)} more owed at the horizon.`
              : `Saves ${usd(keepLoan.balanceCents - loan.balanceCents)} owed at the horizon.`,
        ...(refiDecision && { credit: refiDecision }),
      });
    }
    if (currentValue !== null) {
      const shortfall = Math.max(0, -startingEquity);
      for (const c of scenario.candidates) {
        const d = candidateDraft(c, {
          upfront: shortfall,
          startingEquity,
          saleReceipt: 0,
          principalCredit: Math.max(0, startingEquity),
          label: "sell",
          missing: ["payoff_statement", "confirmed_sale_price"],
        });
        if (shortfall > 0) d.tradeoff = `The ${usd(shortfall)} loan shortfall must be paid in cash; rolling it into a new loan is not assumed.`;
        drafts.push(d);
      }
    }
  }

  const options: OptionResult[] = drafts.map((d) => {
    const totalMonthly = d.monthlyPaymentCents + d.monthlyRunningCents;
    const netCash = d.upfrontCashCents + d.paymentsTotalCents + d.monthlyRunningCents * H - d.saleReceiptCents;
    const endingEquity = d.endingValueCents - d.endingDebtCents;
    const exclusions: string[] = [];
    if (d.upfrontCashCents > budget.availableUpfrontCashCents) {
      exclusions.push(`Needs ${usd(d.upfrontCashCents)} upfront; ${usd(Math.max(0, budget.availableUpfrontCashCents))} available after the reserve`);
    }
    if (totalMonthly > budget.vehicleBudgetCents) {
      exclusions.push(`${usd(totalMonthly)}/mo exceeds the ${usd(budget.vehicleBudgetCents)} vehicle budget`);
    }
    if (d.credit?.status === "not_prequalified") exclusions.unshift(`Not pre-qualified: ${d.credit.reasons[0]?.text ?? "outside lending policy"}`);
    const tradeoff = d.credit?.status === "needs_review" ? `Needs review: ${d.credit.reasons[0]?.text ?? "borderline file"}. ${d.tradeoff}` : d.tradeoff;
    const economicCostCents = netCash + d.startingEquityCents - endingEquity;
    const newCar = d.kind === "purchase_new" || d.kind === "sell_replace";
    const warranty = d.warranty ?? (newCar && (H > LEASE_TERMS.warrantyMonths || miles * H > LEASE_TERMS.warrantyMiles) ? WARRANTY_NOTE : undefined);
    return {
      optionId: d.optionId,
      label: d.label,
      kind: d.kind,
      catalogId: d.catalogId,
      upfrontCashCents: d.upfrontCashCents,
      monthlyPaymentCents: d.monthlyPaymentCents,
      monthlyRunningCents: d.monthlyRunningCents,
      totalMonthlyCents: totalMonthly,
      monthlyRemainingCents: budget.vehicleBudgetCents - totalMonthly,
      netCashOutflowCents: netCash,
      startingEquityCents: d.startingEquityCents,
      endingDebtCents: d.endingDebtCents,
      endingValueCents: d.endingValueCents,
      endingEquityCents: endingEquity,
      economicCostCents,
      avgMonthlyCostCents: d.avgMonthlyCostCents ?? Math.round(economicCostCents / H),
      feasible: exclusions.length === 0,
      exclusions,
      missingInputs: d.missingInputs,
      tradeoff,
      ...(d.credit && { credit: d.credit }),
      ...(d.lease && { lease: d.lease }),
      ...(d.catalogId && { reliability: reliabilityFor(d.catalogId) }),
      ...(warranty && { warranty }),
      ...(d.switchMath && { switchMath: { ...d.switchMath, savingsPerMonthCents: d.switchMath.continueAvgMonthlyCents - (d.avgMonthlyCostCents ?? Math.round(economicCostCents / H)) } }),
    };
  });

  const financed = options.filter((o) => o.credit && o.kind !== "refinance");
  const prequalification: Comparison["prequalification"] = {
    finance: (rankOptions(financed, persona.profile.objective)[0] ?? financed[0])?.credit ?? null,
    refinance: options.find((o) => o.kind === "refinance")?.credit ?? null,
  };
  if (credit) {
    evidence.push(
      {
        id: "credit_score",
        label: "Credit score",
        display: credit.score.known ? String(credit.score.value) : "Not provided",
        source: credit.scoreSource,
      },
      {
        id: "estimated_gross_income",
        label: "Estimated gross income",
        display: `${usd(credit.grossMonthlyCents)}/mo`,
        source: "derived",
        formula: "recurring take-home income ÷ 0.78",
      },
    );
    const f = prequalification.finance;
    if (f) {
      evidence.push(
        { id: "pti", label: "Car payment ÷ income", display: f.ptiPct === null ? "No income found" : `${f.ptiPct}% (limit 20%)`, source: "derived" },
        { id: "dti", label: "All debt payments ÷ income", display: f.dtiPct === null ? "No income found" : `${f.dtiPct}% (limit 50%)`, source: "derived" },
      );
    }
  }

  const comparison: Omit<Comparison, "recommendation"> = {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    personaId: persona.id,
    actionDate: contract.type === "lease" && contract.earlyPayoffCents === undefined ? contract.maturityDate : scenario.actionDate,
    horizonMonths: H,
    preparation,
    options,
    notConsidered,
    sensitivity: sensitivity(options, persona.profile.objective, H),
    evidence,
    prequalification,
  };
  return { ...comparison, recommendation: recommend(comparison, persona, budget) };
}

/** Does the leader change if ending vehicle values come in 10% lower or higher? */
function sensitivity(options: OptionResult[], objective: Persona["profile"]["objective"], horizonMonths: number): Comparison["sensitivity"] {
  const leader = rankOptions(options, objective)[0]?.optionId;
  if (!leader) return [];
  return [-0.1, 0.1].map((f) => {
    const shifted = options.map((o) => {
      const dv = Math.round(o.endingValueCents * f);
      const economicCostCents = o.economicCostCents - dv;
      // Leases end with no car (value 0), so only the horizon-based average moves.
      const avgMonthlyCostCents = o.lease ? o.avgMonthlyCostCents : Math.round(economicCostCents / horizonMonths);
      return { ...o, endingValueCents: o.endingValueCents + dv, endingEquityCents: o.endingEquityCents + dv, economicCostCents, avgMonthlyCostCents };
    });
    const top = rankOptions(shifted, objective)[0];
    const flips = top?.optionId !== leader;
    return {
      label: `Ending values ${f < 0 ? "10% lower" : "10% higher"}`,
      flipsRanking: flips,
      detail: flips ? `${top?.label} would rank first instead` : "Same option ranks first",
    };
  });
}
