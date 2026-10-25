import type { Profile } from "@/contracts";
import { Choice, Money } from "../fields";
import s from "../onboarding.module.css";
import type { StepProps } from "./types";

const OBJECTIVES: [Profile["objective"], string, string][] = [
  ["preserve_cash_then_minimize_cost", "Keep cash, then lowest cost", "Avoid big upfront payments first"],
  ["minimize_cost", "Lowest total cost", "Cheapest over three years, equity included"],
  ["lowest_monthly", "Lowest monthly payment", "Smallest bill each month"],
];

export default function Goals({ a, set, errors }: StepProps) {
  const g = a.goals;
  const patch = (p: Partial<typeof g>) => set((x) => ({ ...x, goals: { ...x.goals, ...p } }));
  return (
    <>
      <p className={s.kicker}>Goals</p>
      <h1 className={s.title}>What matters most?</h1>
      <p className={s.lede}>The recommendation ranks options by this. You can change it later.</p>
      <div className={s.choices} role="group" aria-label="Goal">
        {OBJECTIVES.map(([k, t, d]) => (
          <Choice key={k} pressed={g.objective === k} onClick={() => patch({ objective: k })} title={t} sub={d} />
        ))}
      </div>
      <div className={s.grid}>
        <Money label="Save each month" name="savings" cents={g.monthlySavingsGoalCents} onCents={(c) => patch({ monthlySavingsGoalCents: c })} error={errors["goals.monthlySavingsGoalCents"]} hint="Kept out of the car budget" />
        <Money label="Monthly cushion" name="buffer" cents={g.monthlyBufferCents} onCents={(c) => patch({ monthlyBufferCents: c })} error={errors["goals.monthlyBufferCents"]} hint="For surprises" />
        <Money label="Cash to never touch" name="reserve" cents={g.protectedCashReserveCents} onCents={(c) => patch({ protectedCashReserveCents: c })} error={errors["goals.protectedCashReserveCents"]} hint="Emergency fund" />
      </div>
    </>
  );
}
