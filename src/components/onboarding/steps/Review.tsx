import { catalogVehicle } from "@/fixtures/catalog";
import { fmtUsd } from "../fields";
import s from "../onboarding.module.css";
import type { Connection } from "./Bank";
import type { StepProps } from "./types";

const OBJECTIVE = { preserve_cash_then_minimize_cost: "Keep cash, then lowest cost", minimize_cost: "Lowest total cost", lowest_monthly: "Lowest monthly payment" } as const;

export default function Review({ a, connection, goTo }: Pick<StepProps, "a"> & { connection: Connection; goTo: (step: string) => void }) {
  const v = catalogVehicle(a.car.catalogId);
  const c = a.contract;
  const section = (title: string, step: string, rows: [string, string][]) => (
    <section className={s.card}>
      <div className={s.reviewHead}>
        <strong>{title}</strong>
        <button type="button" className={s.linkBtn} onClick={() => goTo(step)} aria-label={`Edit ${title.toLowerCase()}`}>Edit</button>
      </div>
      <dl>
        {rows.map(([k, val]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  return (
    <>
      <p className={s.kicker}>Review</p>
      <h1 className={s.title}>Here&rsquo;s your profile</h1>
      <p className={s.lede}>Finish to see your options. You can change any of this later in Settings.</p>
      <div className={s.review}>
        {section("Car", "car", [["Car", `${v.modelYear} ${v.model}`], ["Odometer", `${a.car.odometerMiles.toLocaleString()} mi`], ["Worth", a.car.estimatedValueCents === null ? "Not sure" : fmtUsd(a.car.estimatedValueCents)]])}
        {section("How you pay", "contract", c.type === "owned" ? [["Contract", "Paid off"]] : c.type === "loan" ? [["Loan payment", `${fmtUsd(c.paymentCents)}/mo`], ["Payoff", fmtUsd(c.payoffCents)], ["Payments left", String(c.remainingMonths)]] : [["Lease payment", `${fmtUsd(c.paymentCents)}/mo`], ["Lease ends", c.maturityDate], ["Miles allowed", c.totalAllowedMiles.toLocaleString()]])}
        {section("Insurance", "insurance", [["Premium", `${fmtUsd(a.insurance.monthlyCents)}/mo`], ["Source", a.insurance.policy ? "Toyota Insurance (simulated)" : "Entered by you"]])}
        {section("Driving", "driving", [["Miles a month", a.driving.monthlyMiles.toLocaleString()], ["City share", `${Math.round(a.driving.cityShare * 100)}%`], ["Source", a.driving.source === "observed" ? "Imported drives" : "Your estimate"]])}
        {section("Goals", "goals", [["Goal", OBJECTIVE[a.goals.objective]], ["Save each month", fmtUsd(a.goals.monthlySavingsGoalCents)], ["Cash to never touch", fmtUsd(a.goals.protectedCashReserveCents)]])}
        {section("Bank", "bank", [["Connection", connection.banking.mode === "sandbox" ? `Nessie sandbox · ${connection.banking.nessieCustomerId}` : "Local copy"], ["Take-home pay", `${fmtUsd(a.money.takeHomeMonthlyCents)}/mo`], ["Car budget", `${fmtUsd(connection.budget.vehicleBudgetCents)}/mo`]])}
      </div>
    </>
  );
}
