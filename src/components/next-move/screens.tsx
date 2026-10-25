"use client";

import type { BankingSnapshot, CatalogVehicle, CompareRequest, Comparison, NextAction, Persona, Recommendation } from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { niceDate, usd } from "@/domain/format";
import { NEXT_ACTION_LABEL } from "@/domain/recommendations/recommend";
import { EvidenceList, SourceChip } from "./Evidence";
import { ROUTES } from "@/lib/routes";
import AiExplanation from "./explain/AiExplanation";
import type { HeroSlide } from "./HomeHero";
import HomeHeroClient from "./HomeHeroClient";
import DealerList from "./market/DealerList";
import MarketResearch from "./market/MarketResearch";
import PrequalCard from "./credit/PrequalCard";

const CATEGORY_LABEL: Record<string, string> = {
  vehicle_payment: "Car payment",
  vehicle_fuel: "Fuel",
  vehicle_insurance: "Insurance",
  vehicle_maintenance: "Maintenance",
};

function Kv({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="kv">
      <span className="muted">{k}</span>
      <strong className="mono">{v}</strong>
      {sub && <span className="muted kv-sub">{sub}</span>}
    </div>
  );
}

// ---------- Home ----------

export function HomeScreen({
  persona,
  vehicle,
  budget,
  comparison,
  onReview,
  onGo,
}: {
  persona: Persona;
  vehicle: CatalogVehicle;
  budget: BudgetSnapshot;
  comparison: Comparison;
  onReview: () => void;
  onGo: (tab: "drives" | "compare") => void;
}) {
  const c = persona.contract;
  const current = comparison.options.find((o) => o.kind === "keep" || o.kind === "buyout");
  const payment = c.type === "owned" ? 0 : c.paymentCents;
  const running = current?.monthlyRunningCents ?? 0;
  const total = payment + running;
  const r = comparison.recommendation;
  const route = ROUTES.find((x) => x.id === persona.usage.routeId) ?? ROUTES[0];
  const car = `${vehicle.modelYear} ${vehicle.model}`;
  const projected = comparison.evidence.find((e) => e.id === "projected_mileage")?.display;
  const overage = comparison.evidence.find((e) => e.id === "mileage_overage")?.display;
  const slides: HeroSlide[] = [
    c.type === "lease"
      ? { title: `Your lease ends on ${niceDate(c.maturityDate)}.`, body: `See the smartest next move for your ${car}, from your driving and your budget.`, cta: { label: "See your next move", onClick: onReview } }
      : c.type === "loan"
        ? { title: `${c.remainingMonths} payments left on your ${vehicle.model}.`, body: "See whether to keep it, refinance or replace it.", cta: { label: "See your next move", onClick: onReview } }
        : { title: `Your ${vehicle.model} is paid off.`, body: "See whether replacing it is worth it.", cta: { label: "See your next move", onClick: onReview } },
    c.type === "lease" && projected
      ? { title: `On pace for ${projected} miles.`, body: overage ? `Possible mileage charge ${overage}. Compare every option side by side.` : "Compare every option side by side.", cta: { label: "Compare options", onClick: () => onGo("compare") } }
      : { title: "Every option, side by side.", body: "Keep, buy out, lease or finance, with the same driving.", cta: { label: "Compare options", onClick: () => onGo("compare") } },
    { title: "Your commute, on real Austin roads.", body: "Import a recorded drive to replace the mileage estimate.", cta: { label: "Add your drives", onClick: () => onGo("drives") } },
  ];
  return (
    <section className="section">
      <HomeHeroClient route={route.points.map((p) => [p.lon, p.lat] as [number, number])} routeName={route.name} slides={slides} />
      <div className="section-head">
        <span className="label">Home</span>
        <h2>{persona.profile.displayName}&apos;s {vehicle.modelYear} {vehicle.model}</h2>
        <span className="tag">{c.type === "owned" ? "Owned outright" : c.type === "loan" ? "Financed" : "Leased"}</span>
      </div>
      <p className="lede">{persona.situation}</p>
      <div className="grid-2">
        <div className="card">
          <span className="label">This month</span>
          <div className="kv-grid">
            <Kv k={c.type === "lease" ? "Lease payment" : c.type === "loan" ? "Loan payment" : "Payment"} v={usd(payment)} />
            <Kv k="Fuel, insurance, maintenance" v={usd(running)} sub="estimated" />
            <Kv k="Total vehicle expense" v={usd(total)} />
            <Kv k="Vehicle budget" v={usd(budget.vehicleBudgetCents)} sub="from banking data" />
            <Kv k="Budget remaining" v={usd(budget.vehicleBudgetCents - total)} />
            <Kv k="Monthly miles" v={`${persona.usage.monthlyMiles.toLocaleString()} mi`} sub="confirm" />
          </div>
        </div>
        <div className="card next-preview">
          <span className="label">Upcoming decision</span>
          {c.type === "lease" ? (
            <p>
              Lease matures <strong>{niceDate(c.maturityDate)}</strong>. Projected{" "}
              {comparison.evidence.find((e) => e.id === "projected_mileage")?.display} miles; possible charge{" "}
              {comparison.evidence.find((e) => e.id === "mileage_overage")?.display}.
            </p>
          ) : c.type === "loan" ? (
            <p>
              {c.remainingMonths} payments left on a {(c.aprBps / 100).toFixed(2)}% loan. Payoff estimate {usd(c.payoffCents)}.
            </p>
          ) : (
            <p>No payment due. The question is whether replacing the car is worth it.</p>
          )}
          <div className={`status status-${r.status}`}>{r.headline}</div>
          <button className="btn primary" onClick={onReview}>
            Review next move →
          </button>
        </div>
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
  prequal,
}: {
  bank: BankingSnapshot;
  budget: BudgetSnapshot;
  extraSpendingCents: number;
  setExtraSpendingCents: (n: number) => void;
  incomeConfirmed: boolean;
  setIncomeConfirmed: (b: boolean) => void;
  prequal?: Comparison["prequalification"];
}) {
  const recent = [...bank.transactions].reverse().slice(0, 14);
  return (
    <section className="section">
      <div className="section-head">
        <span className="label">Cost</span>
        <h2>What the car can cost each month</h2>
        <span className="tag">{bank.mode === "sandbox" ? "Capital One Nessie sandbox" : "Simulated bank history"}</span>
      </div>
      <p className="lede">
        Based on your last {budget.window.months} complete months of banking ({niceDate(budget.window.start)} to {niceDate(budget.window.end)}).{" "}
        {bank.mode === "sandbox" ? "Read from the Capital One Nessie sandbox" : "Simulated records"}, not a real bank account or credit bureau.
      </p>
      {prequal && <PrequalCard prequal={prequal} />}
      <div className="grid-2" style={prequal ? { marginTop: "1rem" } : undefined}>
        <div className="card">
          <span className="label">Vehicle budget</span>
          <div className="budget-math mono">
            <div><span>Recurring income</span><span>{usd(budget.recurringIncomeCents)}</span></div>
            <div><span>− Other spending</span><span>{usd(budget.otherMonthlySpendingCents)}</span></div>
            <div><span>− Savings goal</span><span>{usd(budget.monthlySavingsGoalCents)}</span></div>
            <div><span>− Buffer</span><span>{usd(budget.monthlyBufferCents)}</span></div>
            <div className="total"><span>= Vehicle budget</span><span className={budget.vehicleBudgetCents < 0 ? "neg" : undefined}>{usd(budget.vehicleBudgetCents)}</span></div>
          </div>
          <label className="check">
            <input type="checkbox" id="income-confirmed" name="income-confirmed" checked={incomeConfirmed} onChange={(e) => setIncomeConfirmed(e.target.checked)} />
            Income estimate from {budget.incomeDeposits} payroll deposits looks right
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
          <span className="label" style={{ marginTop: "1rem", display: "block" }}>Cash for the decision</span>
          <div className="budget-math mono">
            <div><span>Checking + savings</span><span>{usd(budget.liquidCashCents)}</span></div>
            <div><span>− Protected reserve</span><span>{usd(budget.protectedCashReserveCents)}</span></div>
            <div className="total"><span>= Available upfront</span><span className={budget.availableUpfrontCashCents < 0 ? "neg" : undefined}>{usd(budget.availableUpfrontCashCents)}</span></div>
          </div>
        </div>
        <div className="card">
          <span className="label">Left out of the budget, and why</span>
          <ul className="plain">
            {budget.excluded.map((e) => (
              <li key={e.reason}>
                <span>{e.reason}</span>
                <span className="mono muted">{e.count} · {usd(e.cents)}</span>
              </li>
            ))}
          </ul>
          <span className="label" style={{ marginTop: "1rem", display: "block" }}>Observed vehicle spending</span>
          <ul className="plain">
            {Object.entries(budget.observedVehicleMonthlyCents).map(([k, v]) => (
              <li key={k}>
                <span>{CATEGORY_LABEL[k] ?? k}</span>
                <span className="mono">{usd(v ?? 0)}/mo</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Vehicle costs are compared per option, so they are kept out of &ldquo;other spending&rdquo;.</p>
        </div>
      </div>
      <div className="card" style={{ marginTop: "1rem" }}>
        <span className="label">Accounts and recent activity</span>
        <div className="accounts">
          {bank.accounts.map((a) => (
            <Kv key={a.accountId} k={`${a.nickname} (${a.type})`} v={usd(a.balanceCents)} />
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="compare txns">
            <tbody>
              {recent.map((t) => (
                <tr key={t.transactionId}>
                  <td className="mono muted">{t.effectiveAt}</td>
                  <td>{t.description}</td>
                  <td className="muted">{t.type} · {t.status}</td>
                  <td className="mono">{t.type === "deposit" ? "+" : "−"}{usd(t.amountCents, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Retrieved {new Date(bank.retrievedAt).toLocaleString()} · source {bank.mode}</p>
      </div>
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
      <div className="section-head">
        <span className="label">Compare</span>
        <h2>Same driving, every option</h2>
        <span className="tag">{comparison.horizonMonths} months from {niceDate(comparison.actionDate)}</span>
      </div>
      {comparison.preparation && (
        <p className="lede">
          Until then: {comparison.preparation.months} months, {usd(comparison.preparation.cashCents)}. {comparison.preparation.note}
        </p>
      )}
      <div className="toolbar">
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
      <div className="options">
        {comparison.options.map((o) => (
          <article key={o.optionId} className={`card option${o.optionId === leader ? " leader" : ""}${o.feasible ? "" : " excluded"}`}>
            <header>
              <h3>{o.label}</h3>
              {o.optionId === leader ? <span className="chip chip-lead">Leading</span> : !o.feasible && <span className="chip chip-out">Excluded</span>}
            </header>
            <div className="kv-grid">
              <Kv k="Upfront cash" v={usd(o.upfrontCashCents)} />
              <Kv k="Payment" v={`${usd(o.monthlyPaymentCents)}/mo`} />
              <Kv k="Total monthly" v={`${usd(o.totalMonthlyCents)}/mo`} sub="payment + fuel, insurance, maintenance" />
              <Kv k="Budget left" v={usd(o.monthlyRemainingCents)} />
              <Kv k="Cash out over horizon" v={usd(o.netCashOutflowCents)} />
              <Kv k="Debt at horizon" v={usd(o.endingDebtCents)} />
              <Kv k="Equity at horizon" v={usd(o.endingEquityCents)} sub={`value ${usd(o.endingValueCents)} − debt`} />
              <Kv k="Economic cost" v={usd(o.economicCostCents)} sub="cash out + starting − ending equity" />
            </div>
            {o.credit && (
              <p className="prequal-badge">
                {o.credit.status === "prequalified" ? "Pre-qualified" : o.credit.status === "needs_review" ? "Needs review" : "Not pre-qualified"} ·{" "}
                {(o.credit.aprBps / 100).toFixed(2)}% APR estimate
              </p>
            )}
            <p className="tradeoff">{o.tradeoff}</p>
            {o.exclusions.map((x) => (
              <p key={x} className="excl">✕ {x}</p>
            ))}
            {o.missingInputs.length > 0 && <p className="muted small">Needs: {o.missingInputs.map((m) => m.replaceAll("_", " ")).join(", ")}</p>}
            {o.catalogId && (o.kind === "lease_new" || o.kind === "purchase_new" || o.kind === "sell_replace") && (
              <MarketResearch catalogId={o.catalogId} label={o.label} />
            )}
          </article>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <div className="card">
          <span className="label">Sensitivity</span>
          <ul className="plain">
            {comparison.sensitivity.length === 0 && <li className="muted">No feasible option to test.</li>}
            {comparison.sensitivity.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <span className={s.flipsRanking ? "neg" : "muted"}>{s.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <span className="label">Not compared</span>
          <ul className="plain">
            {comparison.notConsidered.length === 0 && <li className="muted">Every relevant action is compared.</li>}
            {comparison.notConsidered.map((n) => (
              <li key={n.label}>
                <span>{n.label}</span>
                <span className="muted">{n.reason}</span>
              </li>
            ))}
          </ul>
        </div>
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

const STATUS_LABEL: Record<Recommendation["status"], string> = {
  recommended: "Recommended",
  needs_information: "Needs a quote to confirm",
  no_feasible_option: "Nothing fits yet",
};

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
      "Check the spending categories on the Cost screen",
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
      <div className="section-head">
        <span className="label" style={{ fontWeight: 700 }}>Next Step</span>
        <h2>{r.headline}</h2>
        <span className={`status status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
      </div>
      <div className="grid-2">
        <div className="card">
          <span className="label">Why</span>
          <ul className="why">
            {r.explanation.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {r.missingInputs.length > 0 && (
            <p className="muted small">Missing: {r.missingInputs.map((m) => m.replaceAll("_", " ")).join(", ")}</p>
          )}
          <div className="action">
            <span className="label">Next step · {NEXT_ACTION_LABEL[r.nextAction]}</span>
            <ol>
              {step.checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
            {step.href ? (
              <a className="btn primary" href={step.href} target="_blank" rel="noreferrer">
                {step.cta} ↗
              </a>
            ) : (
              <span className="btn primary as-label">{step.cta}</span>
            )}
            <p className="muted small">
              {step.href
                ? "Opens the official self-service page. This app does not request a quote or submit anything for you."
                : "A preparation checklist. Nothing is submitted on your behalf."}
            </p>
          </div>
          {/* Dealers can quote a purchase, a new lease or a lease buyout. */}
          {(r.nextAction === "compare_confirmed_offers" || r.nextAction === "request_buyout_quote") && <DealerList near="Austin, TX" />}
          <AiExplanation request={compareRequest} recommendation={r} evidence={comparison.evidence} onCite={onCite} />
        </div>
        <div className="card">
          <span className="label">Evidence</span>
          <EvidenceList facts={facts} highlight={highlight} />
          <p className="muted small" style={{ marginTop: "0.75rem" }}>
            <SourceChip source="synthetic" /> values are invented scenario inputs for the demo.
          </p>
        </div>
      </div>
      <div className="card roadmap" style={{ marginTop: "1rem" }}>
        <span className="label">Planned integration</span>
        <p>
          A future Toyota Insure Connect partnership could enrich these recommendations with authorized vehicle data.
          That requires a verified data interface and permitted uses; nothing in this demo imports Toyota records or
          returns an insurance offer.
        </p>
      </div>
    </section>
  );
}
