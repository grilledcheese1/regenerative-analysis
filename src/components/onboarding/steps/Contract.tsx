import type { OnboardingContract } from "@/contracts";
import { Choice, Field, Money, Num } from "../fields";
import s from "../onboarding.module.css";
import type { StepProps } from "./types";

const DEFAULTS: Record<OnboardingContract["type"], OnboardingContract> = {
  owned: { type: "owned" },
  loan: { type: "loan", payoffCents: 1400000, aprBps: 690, paymentCents: 45000, remainingMonths: 36 },
  lease: { type: "lease", maturityDate: "2027-06-30", paymentCents: 39900, totalAllowedMiles: 36000, excessCentsPerMile: 15, purchaseOptionCents: null, dispositionFeeCents: 35000 },
};

export default function Contract({ a, set, errors }: StepProps) {
  const c = a.contract;
  const patch = (p: Partial<OnboardingContract>) => set((x) => ({ ...x, contract: { ...x.contract, ...p } as OnboardingContract }));
  const e = (k: string) => errors[`contract.${k}`];
  return (
    <>
      <p className={s.kicker}>How you pay</p>
      <h1 className={s.title}>Is your car paid off, financed, or leased?</h1>
      <p className={s.lede}>Use your latest statement. Estimates are fine.</p>
      <div className={s.choices} role="group" aria-label="Contract type">
        <Choice pressed={c.type === "owned"} onClick={() => set((x) => ({ ...x, contract: DEFAULTS.owned }))} title="Paid off" sub="No car payment" />
        <Choice pressed={c.type === "loan"} onClick={() => set((x) => ({ ...x, contract: x.contract.type === "loan" ? x.contract : DEFAULTS.loan }))} title="Loan" sub="Monthly payments, you own it" />
        <Choice pressed={c.type === "lease"} onClick={() => set((x) => ({ ...x, contract: x.contract.type === "lease" ? x.contract : DEFAULTS.lease }))} title="Lease" sub="Monthly payments, it goes back" />
      </div>
      {c.type === "loan" && (
        <div className={s.grid}>
          <Money label="Payoff today" name="payoff" cents={c.payoffCents} onCents={(n) => patch({ payoffCents: n })} error={e("payoffCents")} />
          <Money label="Monthly payment" name="payment" cents={c.paymentCents} onCents={(n) => patch({ paymentCents: n })} error={e("paymentCents")} />
          <Num label="APR (%)" name="apr" step={0.01} value={c.aprBps / 100} onValue={(n) => patch({ aprBps: Math.round(n * 100) })} error={e("aprBps")} />
          <Num label="Payments left" name="months" value={c.remainingMonths} onValue={(n) => patch({ remainingMonths: n })} error={e("remainingMonths")} />
        </div>
      )}
      {c.type === "lease" && (
        <div className={s.grid}>
          <Field label="Lease ends on" error={e("maturityDate")}>
            <input name="maturity" type="date" value={c.maturityDate} onChange={(ev) => patch({ maturityDate: ev.target.value })} aria-invalid={Boolean(e("maturityDate"))} />
          </Field>
          <Money label="Monthly payment" name="payment" cents={c.paymentCents} onCents={(n) => patch({ paymentCents: n })} error={e("paymentCents")} />
          <Num label="Total miles allowed" name="allowed" value={c.totalAllowedMiles} onValue={(n) => patch({ totalAllowedMiles: n })} error={e("totalAllowedMiles")} />
          <Num label="Charge per extra mile (¢)" name="excess" value={c.excessCentsPerMile} onValue={(n) => patch({ excessCentsPerMile: n })} error={e("excessCentsPerMile")} />
          <Money label="Buyout price in the contract" name="purchase" cents={c.purchaseOptionCents ?? NaN} onCents={(n) => patch({ purchaseOptionCents: Number.isFinite(n) ? n : null })} hint="Leave blank if you don't know" error={e("purchaseOptionCents")} />
          <Money label="Turn-in (disposition) fee" name="disposition" cents={c.dispositionFeeCents ?? NaN} onCents={(n) => patch({ dispositionFeeCents: Number.isFinite(n) ? n : null })} hint="Leave blank if you don't know" error={e("dispositionFeeCents")} />
        </div>
      )}
    </>
  );
}
