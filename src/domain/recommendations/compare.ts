import {
  MODEL_VERSION,
  SCHEMA_VERSION,
  type CandidateTerms,
  type CatalogVehicle,
  type Cents,
  type Comparison,
  type EvidenceFact,
  type OptionResult,
  type Persona,
} from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { monthlyFuel } from "@/domain/finance/fuel";
import { leasePayment, monthsBetween, projectLeaseMileage } from "@/domain/finance/lease";
import { amortize } from "@/domain/finance/loan";
import { usd } from "@/domain/format";
import { rankOptions } from "./rank";
import { recommend } from "./recommend";

export interface CompareInputs {
  persona: Persona;
  budget: BudgetSnapshot;
  catalog: CatalogVehicle[];
  asOf: string;
  overrides?: { gasCentsPerGallon?: number; monthlyMiles?: number };
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
}

export function compareOptions({ persona, budget, catalog, asOf, overrides = {} }: CompareInputs): Comparison {
  const { contract, vehicle, usage, scenario, costs } = persona;
  const H = scenario.horizonMonths;
  const gas = overrides.gasCentsPerGallon ?? scenario.gasCentsPerGallon;
  const miles = overrides.monthlyMiles ?? usage.monthlyMiles;
  const byId = (id: string) => {
    const v = catalog.find((c) => c.catalogId === id);
    if (!v) throw new Error(`Unknown catalog vehicle ${id}`);
    return v;
  };
  const current = byId(vehicle.catalogId);

  const running = (v: CatalogVehicle, insurance: Cents, maintenance: Cents) =>
    monthlyFuel(v, miles, usage.cityShare, gas).costCents + insurance + maintenance;
  const currentRunning = running(current, costs.insuranceMonthlyCents, costs.maintenanceMonthlyCents);

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
    { id: "monthly_miles", label: "Monthly miles", display: `${miles.toLocaleString()} mi`, source: usage.source },
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
    base: { upfront: Cents; startingEquity: Cents; saleReceipt: Cents; principalCredit: Cents; label: string; missing: string[] },
  ): Draft => {
    const v = byId(c.catalogId);
    const monthlyRunning = running(v, c.insuranceMonthlyCents, c.maintenanceMonthlyCents);
    const name = `${v.modelYear} ${v.model}`;
    if (c.acquisition === "lease") {
      const pay = leasePayment(c.priceCents, c.residualCents!, c.leaseTermMonths!, c.moneyFactor!);
      return {
        optionId: `${base.label}_lease_${c.catalogId}`,
        label: `${base.label === "return" ? "Return and lease" : "Lease"} ${name}`,
        kind: "lease_new",
        catalogId: c.catalogId,
        upfrontCashCents: base.upfront + c.dueAtSigningCents,
        monthlyPaymentCents: pay,
        paymentsTotalCents: pay * Math.min(H, c.leaseTermMonths!),
        monthlyRunningCents: monthlyRunning,
        saleReceiptCents: base.saleReceipt,
        startingEquityCents: base.startingEquity,
        endingDebtCents: 0,
        endingValueCents: c.endValueCents,
        missingInputs: [...base.missing, "lease_taxes_and_fees"],
        tradeoff: "No equity at the end, but no resale risk and a predictable payment.",
      };
    }
    if (c.acquisition === "cash") {
      return {
        optionId: `${base.label}_cash_${c.catalogId}`,
        label: `${base.label === "sell" ? "Sell and buy" : "Buy"} ${name} with cash`,
        kind: base.label === "sell" ? "sell_replace" : "purchase_new",
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
    const loan = amortize(principal, scenario.financeAprBps, scenario.financeTermMonths, H);
    return {
      optionId: `${base.label}_finance_${c.catalogId}`,
      label: `${base.label === "sell" ? "Sell and finance" : base.label === "return" ? "Return and finance" : "Finance"} ${name}`,
      kind: base.label === "sell" ? "sell_replace" : "purchase_new",
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
    };
  };

  if (contract.type === "lease") {
    const monthsLeft = monthsBetween(asOf, contract.maturityDate);
    const mileage = projectLeaseMileage(vehicle.odometerMiles, miles * monthsLeft, contract.totalAllowedMiles, contract.excessCentsPerMile);
    preparation = {
      months: monthsLeft,
      cashCents: (contract.paymentCents + currentRunning) * monthsLeft,
      note: "Remaining lease payments and running costs until maturity, common to every option.",
    };
    evidence.push(
      { id: "lease_end_date", label: "Lease maturity", display: contract.maturityDate, source: "synthetic" },
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
      const loan = amortize(price, scenario.financeAprBps, scenario.financeTermMonths, H);
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
    if (scenario.refinance) {
      const r = scenario.refinance;
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
        tradeoff: `Lower payment, but ${usd(loan.balanceCents - keepLoan.balanceCents)} more owed at the horizon.`,
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
      economicCostCents: netCash + d.startingEquityCents - endingEquity,
      feasible: exclusions.length === 0,
      exclusions,
      missingInputs: d.missingInputs,
      tradeoff: d.tradeoff,
    };
  });

  const comparison: Omit<Comparison, "recommendation"> = {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    personaId: persona.id,
    actionDate: contract.type === "lease" ? contract.maturityDate : scenario.actionDate,
    horizonMonths: H,
    preparation,
    options,
    notConsidered,
    sensitivity: sensitivity(options, persona.profile.objective),
    evidence,
  };
  return { ...comparison, recommendation: recommend(comparison, persona, budget) };
}

/** Does the leader change if ending vehicle values come in 10% lower or higher? */
function sensitivity(options: OptionResult[], objective: Persona["profile"]["objective"]): Comparison["sensitivity"] {
  const leader = rankOptions(options, objective)[0]?.optionId;
  if (!leader) return [];
  return [-0.1, 0.1].map((f) => {
    const shifted = options.map((o) => {
      const dv = Math.round(o.endingValueCents * f);
      return { ...o, endingValueCents: o.endingValueCents + dv, endingEquityCents: o.endingEquityCents + dv, economicCostCents: o.economicCostCents - dv };
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
