"use client";

import type { CatalogVehicle, Comparison, Persona } from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { usd } from "@/domain/format";
import { SourceChip } from "../next-move/Evidence";
import { StaggerItem, StaggerList } from "./motion";
import StorySection from "./StorySection";

function Row({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <StaggerItem className={`in-row${warn ? " in-row--warn" : ""}`}>
      <span className="in-row__label">{label}</span>
      <strong className="in-row__value">{value}</strong>
      {note && <span className="in-row__note">{note}</span>}
    </StaggerItem>
  );
}

/** Slide 1. Which rows appear depends on the kind of person: a lease, a loan or a paid-off car. */
export default function Stand({
  persona,
  vehicle,
  budget,
  comparison,
  incomeConfirmed,
  onIncomeConfirmed,
}: {
  persona: Persona;
  vehicle: CatalogVehicle;
  budget: BudgetSnapshot;
  comparison: Comparison;
  incomeConfirmed: boolean;
  onIncomeConfirmed: (b: boolean) => void;
}) {
  const c = persona.contract;
  const current = comparison.options.find((o) => o.kind === "keep" || o.kind === "buyout");
  const payment = c.type === "owned" ? 0 : c.paymentCents;
  const total = payment + (current?.monthlyRunningCents ?? 0);
  const ev = (id: string) => comparison.evidence.find((e) => e.id === id)?.display;
  const v = persona.vehicle.estimatedValueCents;

  return (
    <StorySection
      id="stand"
      kicker="Where you stand"
      title={`What is the smartest move for ${persona.profile.displayName} and the ${vehicle.modelYear} ${vehicle.model}?`}
      lede={persona.situation}
    >
      <StaggerList className="in-rows" delay={0.15}>
        {c.type === "lease" && (
          <>
            <Row label="Lease" value={`Ends ${c.maturityDate}`} note={`${usd(c.paymentCents)}/mo · ${c.totalAllowedMiles.toLocaleString()} miles allowed`} />
            <Row label="Projected miles" value={ev("projected_mileage") ?? "Unknown"} note={`Possible overage charge ${ev("mileage_overage") ?? "unknown"}`} warn={ev("mileage_overage") !== undefined && ev("mileage_overage") !== "$0"} />
          </>
        )}
        {c.type === "loan" && (
          <Row label="Loan" value={`${c.remainingMonths} payments left`} note={`${usd(c.paymentCents)}/mo at ${(c.aprBps / 100).toFixed(2)}% · payoff about ${usd(c.payoffCents)}`} />
        )}
        {c.type === "owned" && <Row label="Ownership" value="Paid off" note={v.known ? `Estimated value ${usd(v.value)} (${persona.vehicle.valuationSource})` : "Value unknown"} />}
        <Row label="Costs each month now" value={usd(total)} note="payment plus estimated fuel, insurance and maintenance" />
        <Row label="Vehicle budget" value={usd(budget.vehicleBudgetCents)} note="income minus other spending, savings goal and buffer, from banking data" warn={budget.vehicleBudgetCents < 0} />
        <Row label="Cash for a decision" value={usd(budget.availableUpfrontCashCents)} note="checking and savings above your protected reserve" warn={budget.availableUpfrontCashCents < 0} />
        <Row label="Driving" value={`${persona.usage.monthlyMiles.toLocaleString()} mi/mo`} note={`${Math.round(persona.usage.cityShare * 100)}% city · simulated, confirm in Details`} />
      </StaggerList>
      <label className="m-check">
        <input type="checkbox" checked={incomeConfirmed} onChange={(e) => onIncomeConfirmed(e.target.checked)} />
        <span>
          Income estimate from {budget.incomeDeposits} payroll deposits looks right <SourceChip source={incomeConfirmed ? "user_reported" : "derived"} />
        </span>
      </label>
      <p className="story__hint">Scroll to see your commute</p>
    </StorySection>
  );
}
