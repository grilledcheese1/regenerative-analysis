import type { OptionResult } from "@/contracts";
import { usd } from "@/domain/format";

/** The trade-in math behind a mid-lease switch, line by line. */
export default function SwitchMath({ m }: { m: NonNullable<OptionResult["switchMath"]> }) {
  return (
    <div className="switch" data-testid="switch-math">
      <span className="label">Switching today</span>
      <dl className="budget-math mono">
        <div><span>Trade-in value</span><span>{usd(m.tradeInValueCents)}</span></div>
        <div><span>− Early payoff</span><span>{usd(m.earlyPayoffCents)}</span></div>
        <div className="total"><span>= Equity</span><span className={m.equityCents < 0 ? "neg" : undefined}>{usd(m.equityCents)}</span></div>
        <div><span>Due at signing after equity</span><span>{usd(m.dueAtSigningAfterEquityCents)}</span></div>
        {m.cashBackCents > 0 && <div><span>Cash back</span><span>{usd(m.cashBackCents)}</span></div>}
        <div><span>Continuing the lease</span><span>{usd(m.continueAvgMonthlyCents)}/mo</span></div>
        <div className="total"><span>Saves on average</span><span className={m.savingsPerMonthCents < 0 ? "neg" : undefined}>{usd(m.savingsPerMonthCents)}/mo</span></div>
      </dl>
      <p className="muted small">Payoff and trade-in values are synthetic estimates; a payoff statement and a written trade-in offer confirm them.</p>
    </div>
  );
}
