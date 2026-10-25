"use client";

import type { BankingSnapshot, CatalogVehicle, CompareRequest, Comparison, NextAction, Persona } from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { usd } from "@/domain/format";
import { NEXT_ACTION_LABEL } from "@/domain/recommendations/recommend";
import { EvidenceList, SourceChip } from "./Evidence";
import AiExplanation from "./explain/AiExplanation";
import DealerList from "./market/DealerList";
import MarketResearch from "./market/MarketResearch";
import CarArt from "./ui/CarArt";
import Icon from "./ui/Icon";
import { Card, KpiTile, Ledger, Pill, SectionHead } from "./ui/parts";

const CATEGORY_LABEL: Record<string, string> = {
  vehicle_payment: "Car payment",
  vehicle_fuel: "Fuel",
  vehicle_insurance: "Insurance",
  vehicle_maintenance: "Maintenance",
};

const ACCOUNT_ICON = { Checking: "bank", Savings: "piggy", "Credit Card": "card" } as const;

// ---------- Home ----------

export function HomeScreen({
  persona,
  vehicle,
  budget,
  comparison,
  onReview,
}: {
  persona: Persona;
  vehicle: CatalogVehicle;
  budget: BudgetSnapshot;
  comparison: Comparison;
  onReview: () => void;
}) {
  const c = persona.contract;
  const current = comparison.options.find((o) => o.kind === "keep" || o.kind === "buyout");
  const payment = c.type === "owned" ? 0 : c.paymentCents;
  const running = current?.monthlyRunningCents ?? 0;
  const total = payment + running;
  const remaining = budget.vehicleBudgetCents - total;
  const r = comparison.recommendation;
  return (
    <section className="section nm-home">
      <div className="nm-hero">
        <CarArt catalogId={persona.vehicle.catalogId} className="nm-hero__car" />
        <SectionHead
          kicker="Home"
          title={`${persona.profile.displayName}’s ${vehicle.modelYear} ${vehicle.model}`}
          pill={<Pill>{c.type === "owned" ? "Owned outright" : c.type === "loan" ? "Financed" : "Leased"}</Pill>}
          lede={persona.situation}
        />
      </div>
      <div className="grid-2 nm-home__grid">
        <Card icon="calendar" title="This month">
          <div className="nm-tiles nm-tiles--2">
            <KpiTile icon="card" label={c.type === "lease" ? "Lease payment" : c.type === "loan" ? "Loan payment" : "Payment"} value={usd(payment)} />
            <KpiTile icon="fuel" label="Fuel, insurance, maintenance" value={usd(running)} sub="estimated" />
            <KpiTile icon="pie" label="Total vehicle expense" value={usd(total)} />
            <KpiTile icon="money" label="Vehicle budget" value={usd(budget.vehicleBudgetCents)} sub="from banking data" />
            <KpiTile icon="bars" label="Budget remaining" value={usd(remaining)} tone={remaining < 0 ? "bad" : "good"} />
            <KpiTile icon="gauge" label="Monthly miles" value={`${persona.usage.monthlyMiles.toLocaleString()} mi`} sub="confirm" />
          </div>
        </Card>
        <Card icon="target" title="Upcoming decision">
          <div className="nm-decision">
            <span className="nm-decision__icon">
              <Icon name="calendar" size={28} />
            </span>
            <div>
              {c.type === "lease" ? (
                <>
                  <strong className="nm-decision__title">Lease matures {c.maturityDate}.</strong>
                  <p>
                    Projected {comparison.evidence.find((e) => e.id === "projected_mileage")?.display} miles; possible charge{" "}
                    {comparison.evidence.find((e) => e.id === "mileage_overage")?.display}.
                  </p>
                </>
              ) : c.type === "loan" ? (
                <>
                  <strong className="nm-decision__title">{c.remainingMonths} payments left.</strong>
                  <p>
                    A {(c.aprBps / 100).toFixed(2)}% loan. Payoff estimate {usd(c.payoffCents)}.
                  </p>
                </>
              ) : (
                <>
                  <strong className="nm-decision__title">No payment due.</strong>
                  <p>The question is whether replacing the car is worth it.</p>
                </>
              )}
              <div className={`status status-${r.status}`}>
                {r.status === "recommended" && <Icon name="check" size={16} />}
                {r.headline}
              </div>
            </div>
          </div>
          <button className="btn primary nm-cta" onClick={onReview}>
            Review next move
            <Icon name="arrow" size={18} />
          </button>
        </Card>
      </div>
    </section>
  );
}

// ---------- Money ----------

export function MoneyScreen({
  bank,
  budget,
  extraSpendingCents,
  setExtraSpendingCents,
  incomeConfirmed,
  setIncomeConfirmed,
}: {
  bank: BankingSnapshot;
  budget: BudgetSnapshot;
  extraSpendingCents: number;
  setExtraSpendingCents: (n: number) => void;
  incomeConfirmed: boolean;
  setIncomeConfirmed: (b: boolean) => void;
}) {
  const recent = [...bank.transactions].reverse().slice(0, 14);
  return (
    <section className="section">
      <SectionHead
        kicker="Money"
        title="What the car can cost each month"
        pill={<Pill>{bank.mode === "sandbox" ? "Nessie sandbox" : "Nessie-format fixture"}</Pill>}
        lede={
          <>
            Demo banking: {bank.mode === "sandbox" ? "read live from the Capital One Nessie sandbox" : "synthetic records in Nessie's format"}, not a
            personal bank account or credit bureau. Window {budget.window.start} to {budget.window.end} (last {budget.window.months} complete months).
          </>
        }
      />
      <div className="grid-2">
        <Card icon="calendar" title="Vehicle budget">
          <Ledger
            rows={[
              { k: "Recurring income", v: usd(budget.recurringIncomeCents) },
              { k: "− Other spending", v: usd(budget.otherMonthlySpendingCents) },
              { k: "− Savings goal", v: usd(budget.monthlySavingsGoalCents) },
              { k: "− Buffer", v: usd(budget.monthlyBufferCents) },
            ]}
            total={{ k: "= Vehicle budget", v: usd(budget.vehicleBudgetCents), tone: budget.vehicleBudgetCents < 0 ? "bad" : undefined }}
          />
          <label className="check">
            <input type="checkbox" id="income-confirmed" name="income-confirmed" checked={incomeConfirmed} onChange={(e) => setIncomeConfirmed(e.target.checked)} />
            Income estimate from {budget.incomeDeposits} payroll deposits looks right.
          </label>
          <div className="slider">
            <span>New monthly expense</span>
            <input
              type="range"
              id="extra-spending"
              name="extra-spending"
              min={0}
              max={60000}
              step={5000}
              value={extraSpendingCents}
              onChange={(e) => setExtraSpendingCents(+e.target.value)}
              aria-label="New monthly expense"
            />
            <span className="mono">{usd(extraSpendingCents)}</span>
          </div>
          <h3 className="nm-card__title nm-card__title--sub">
            <Icon name="coins" size={22} />
            <span className="label">Cash for the decision</span>
          </h3>
          <Ledger
            rows={[
              { k: "Checking + savings", v: usd(budget.liquidCashCents) },
              { k: "− Protected reserve", v: usd(budget.protectedCashReserveCents) },
            ]}
            total={{ k: "= Available upfront", v: usd(budget.availableUpfrontCashCents), tone: budget.availableUpfrontCashCents < 0 ? "bad" : undefined }}
          />
        </Card>
        <div className="nm-stack">
          <Card icon="target" title="Left out of the budget, and why">
            <ul className="plain nm-rows">
              {budget.excluded.map((e) => (
                <li key={e.reason}>
                  <span>{e.reason}</span>
                  <span className="mono">{e.count} · {usd(e.cents)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card icon="car" title="Observed vehicle spending">
            <ul className="plain nm-rows">
              {Object.entries(budget.observedVehicleMonthlyCents).map(([k, v]) => (
                <li key={k}>
                  <span>{CATEGORY_LABEL[k] ?? k}</span>
                  <span className="mono">{usd(v ?? 0)}/mo</span>
                </li>
              ))}
            </ul>
            <p className="muted small">Vehicle costs are compared per option, so they are kept out of &ldquo;other spending&rdquo;.</p>
          </Card>
        </div>
      </div>
      <Card icon="doc" title="Accounts and recent activity" className="nm-accounts-card">
        <div className="nm-account-tiles">
          {bank.accounts.map((a) => (
            <KpiTile key={a.accountId} icon={ACCOUNT_ICON[a.type as keyof typeof ACCOUNT_ICON] ?? "bank"} label={`${a.nickname} (${a.type})`} value={usd(a.balanceCents)} />
          ))}
        </div>
        <div className="nm-table-wrap">
          <table className="compare txns">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Type · Status</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.transactionId}>
                  <td className="mono muted">{t.effectiveAt}</td>
                  <td>{t.description}</td>
                  <td className="muted">{t.type} · {t.status}</td>
                  <td className={`mono nm-amt${t.type === "deposit" ? " is-in" : ""}`}>{t.type === "deposit" ? "+" : "−"}{usd(t.amountCents, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Retrieved {new Date(bank.retrievedAt).toLocaleString()} · source {bank.mode}</p>
      </Card>
    </section>
  );
}

// ---------- Compare ----------

export function CompareScreen({
  comparison,
  gasCents,
  setGasCents,
  monthlyMiles,
  setMonthlyMiles,
}: {
  comparison: Comparison;
  gasCents: number;
  setGasCents: (n: number) => void;
  monthlyMiles: number;
  setMonthlyMiles: (n: number) => void;
}) {
  const leader = comparison.recommendation.selectedOptionId;
  return (
    <section className="section">
      <SectionHead
        kicker="Compare"
        title="Same driving, every option"
        pill={<Pill>{comparison.horizonMonths} months from {comparison.actionDate}</Pill>}
        lede={comparison.preparation ? `Until then: ${comparison.preparation.months} months, ${usd(comparison.preparation.cashCents)}. ${comparison.preparation.note}` : undefined}
      />
      <div className="toolbar nm-toolbar">
        <div className="slider">
          <span>Gas price</span>
          <input type="range" id="gas-price" name="gas-price" min={200} max={500} step={10} value={gasCents} onChange={(e) => setGasCents(+e.target.value)} aria-label="Gas price" />
          <span className="mono">{usd(gasCents, 2)}</span>
        </div>
        <div className="slider">
          <span>Monthly miles</span>
          <input type="range" id="monthly-miles" name="monthly-miles" min={200} max={2000} step={25} value={monthlyMiles} onChange={(e) => setMonthlyMiles(+e.target.value)} aria-label="Monthly miles" />
          <span className="mono">{monthlyMiles}</span>
        </div>
      </div>
      <div className="options nm-options">
        {comparison.options.map((o) => (
          <article key={o.optionId} className={`card nm-card option${o.optionId === leader ? " leader" : ""}${o.feasible ? "" : " excluded"}`}>
            <header>
              <h3>{o.label}</h3>
              {o.optionId === leader ? <span className="chip chip-lead">Leading</span> : !o.feasible && <span className="chip chip-out">Excluded</span>}
            </header>
            <div className="nm-tiles nm-tiles--2">
              <KpiTile iconSide="left" icon="dollar" label="Upfront cash" value={usd(o.upfrontCashCents)} />
              <KpiTile iconSide="left" icon="card" label="Payment" value={`${usd(o.monthlyPaymentCents)}/mo`} />
              <KpiTile iconSide="left" icon="clock" label="Total monthly" value={`${usd(o.totalMonthlyCents)}/mo`} sub="payment + fuel, insurance, maintenance" />
              <KpiTile iconSide="left" icon="bars" label="Budget left" value={usd(o.monthlyRemainingCents)} tone={o.monthlyRemainingCents < 0 ? "bad" : o.optionId === leader ? "good" : undefined} />
              <KpiTile iconSide="left" icon="coins" label="Cash out over horizon" value={usd(o.netCashOutflowCents)} />
              <KpiTile iconSide="left" icon="card" label="Debt at horizon" value={usd(o.endingDebtCents)} />
              <KpiTile iconSide="left" icon="house" label="Equity at horizon" value={usd(o.endingEquityCents)} sub={`value ${usd(o.endingValueCents)} − debt`} />
              <KpiTile iconSide="left" icon="bars" label="Economic cost" value={usd(o.economicCostCents)} sub="cash out + starting − ending equity" />
            </div>
            <div className="nm-tradeoff">
              <span className="nm-tile__icon"><Icon name="doc" size={20} /></span>
              <div>
                <p className="tradeoff">{o.tradeoff}</p>
                {o.exclusions.map((x) => (
                  <p key={x} className="excl">
                    <Icon name="alert" size={16} /> {x}
                  </p>
                ))}
                {o.missingInputs.length > 0 && <p className="muted small">Needs: {o.missingInputs.map((m) => m.replaceAll("_", " ")).join(", ")}</p>}
              </div>
            </div>
            {o.catalogId && (o.kind === "lease_new" || o.kind === "purchase_new" || o.kind === "sell_replace") && (
              <MarketResearch catalogId={o.catalogId} label={o.label} />
            )}
          </article>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <Card icon="bars" title="Sensitivity">
          <ul className="plain nm-rows">
            {comparison.sensitivity.length === 0 && <li className="muted">No feasible option to test.</li>}
            {comparison.sensitivity.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <span className={s.flipsRanking ? "neg" : "muted"}>{s.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card icon="info" title="Not compared">
          <ul className="plain nm-rows">
            {comparison.notConsidered.length === 0 && <li className="muted">Every relevant action is compared.</li>}
            {comparison.notConsidered.map((n) => (
              <li key={n.label}>
                <span>{n.label}</span>
                <span className="muted">{n.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="muted small" style={{ marginTop: "1rem" }}>
        Prices, rates, premiums and ending values are synthetic scenario inputs, not offers or approvals. Fuel uses
        fueleconomy.gov ratings for each exact variant.
      </p>
    </section>
  );
}

// ---------- Next Move ----------

interface ActionStep {
  cta: string;
  href?: string;
  checklist: string[];
}

export const ACTION_STEPS: Record<NextAction, ActionStep> = {
  request_buyout_quote: {
    cta: "Open Toyota Financial Services lease-end options",
    href: "https://www.toyotafinancial.com/us/en/end_of_lease_options/faqs.html",
    checklist: [
      "Ask for an out-the-door buyout quote including taxes and fees",
      "Note the quote's expiration date",
      "Bring the quote back to update this comparison",
    ],
  },
  request_payoff_quote: {
    cta: "Prepare a payoff statement request",
    checklist: ["Call or log in to your lender", "Request a 10-day payoff statement", "Enter the payoff amount and date here"],
  },
  review_budget: {
    cta: "Review the budget",
    checklist: [
      "Check the spending categories on the Money screen",
      "Consider the savings goal and reserve you chose",
      "Request a payoff statement before acting on a refinance or sale",
    ],
  },
  keep_current_plan: {
    cta: "Keep the current car",
    checklist: ["Schedule routine maintenance", "Revisit when the commute or budget changes"],
  },
  compare_confirmed_offers: {
    cta: "Collect confirmed offers",
    checklist: ["Get written quotes for the leading options", "Enter them to replace the synthetic terms"],
  },
  review_insurance_program: { cta: "Review insurance programs", checklist: ["Compare like-for-like coverage"] },
  obtain_missing_vehicle_information: { cta: "Add vehicle details", checklist: ["Enter trim, odometer and contract terms"] },
};

export function NextMoveScreen({
  comparison,
  compareRequest,
  highlight,
  onCite,
}: {
  comparison: Comparison;
  compareRequest: CompareRequest;
  highlight: string[];
  onCite: (ids: string[]) => void;
}) {
  const r = comparison.recommendation;
  const step = ACTION_STEPS[r.nextAction];
  const facts = comparison.evidence.filter((e) => r.evidenceIds.includes(e.id));
  return (
    <section className="section">
      <SectionHead kicker="Next move" title={r.headline} pill={<span className={`status status-${r.status}`}>{r.status.replaceAll("_", " ")}</span>} />
      <div className="grid-2">
        <Card icon="bulb" title="Why">
          <ul className="why">
            {r.explanation.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {r.missingInputs.length > 0 && (
            <p className="muted small">Missing: {r.missingInputs.map((m) => m.replaceAll("_", " ")).join(", ")}</p>
          )}
          <div className="action nm-nextstep">
            <h4 className="nm-card__title nm-card__title--sub">
              <Icon name="calendar" size={22} />
              <span className="label">Next step · {NEXT_ACTION_LABEL[r.nextAction]}</span>
            </h4>
            <ol>
              {step.checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
            {step.href ? (
              <a className="btn primary nm-cta" href={step.href} target="_blank" rel="noreferrer">
                {step.cta}
                <Icon name="arrow" size={18} />
              </a>
            ) : (
              <span className="btn primary as-label nm-cta">{step.cta}</span>
            )}
            <p className="muted small">
              {step.href
                ? "Opens the official self-service page. This app does not request a quote or submit anything for you."
                : "A preparation checklist. Nothing is submitted on your behalf."}
            </p>
          </div>
          {/* Dealers can quote a purchase, a new lease or a lease buyout. */}
          {(r.nextAction === "compare_confirmed_offers" || r.nextAction === "request_buyout_quote") && <DealerList near="Austin, TX" />}
        </Card>
        <Card icon="bars" title="Evidence">
          <EvidenceList facts={facts} highlight={highlight} />
          <p className="muted small" style={{ marginTop: "0.75rem" }}>
            <SourceChip source="synthetic" /> values are invented scenario inputs for the demo.
          </p>
        </Card>
      </div>
      <div className="nm-explain">
        <Icon name="info" size={20} />
        <AiExplanation request={compareRequest} recommendation={r} evidence={comparison.evidence} onCite={onCite} />
      </div>
      <Card icon="link" title="Planned integration" className="roadmap">
        <p>
          A future Toyota Insure Connect partnership could enrich these recommendations with authorized vehicle data.
          That requires a verified data interface and permitted uses; nothing in this demo imports Toyota records or
          returns an insurance offer.
        </p>
      </Card>
    </section>
  );
}
