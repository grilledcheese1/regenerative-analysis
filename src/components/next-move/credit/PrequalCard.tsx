import type { Comparison, LoanDecision } from "@/contracts";
import { tierLabel } from "@/domain/credit/underwrite";
import { CREDIT_MODEL } from "@/domain/credit/model";
import { usd } from "@/domain/format";
import { SourceChip } from "../Evidence";

const STATUS: Record<LoanDecision["status"], string> = {
  prequalified: "Pre-qualified",
  needs_review: "Needs review",
  not_prequalified: "Not pre-qualified",
};
const pctBps = (bps: number) => (bps / 100).toFixed(1);

function Column({ title, d, refinance }: { title: string; d: LoanDecision; refinance?: boolean }) {
  return (
    <div className={`prequal__col prequal__col--${d.status}`}>
      <span className="label">{title}</span>
      <span className={`prequal__status prequal__status--${d.status}`}>{STATUS[d.status]}</span>
      {d.status !== "not_prequalified" && (
        <>
          <strong className="prequal__rate">
            {pctBps(d.aprBandBps[0])}–{pctBps(d.aprBandBps[1])}% APR
          </strong>
          <span className="muted small">
            {refinance ? `New payment about ${usd(d.paymentCents)}/mo` : `Up to ${usd(d.maxAmountCents)} at this rate`} · {tierLabel(d.tier)}
          </span>
        </>
      )}
      {refinance && d.worthIt !== undefined && d.status !== "not_prequalified" && (
        <span className={`prequal__worth${d.worthIt ? "" : " prequal__worth--no"}`}>{d.worthIt ? "Worth it: beats your current rate after fees" : "Doesn't beat your current rate after fees"}</span>
      )}
      <ul className="prequal__reasons">
        {d.reasons.map((r) => (
          <li key={r.code}>
            <span>{r.text}</span>
            <span className="prequal__ev">
              {r.evidence.display && <span className="mono">{r.evidence.display}</span>} <SourceChip source={r.evidence.source} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lender-style pre-qualification for financing the next car and refinancing the current loan. */
export default function PrequalCard({ prequal }: { prequal: Comparison["prequalification"] }) {
  if (!prequal.finance && !prequal.refinance) return null;
  return (
    <section className="card prequal" aria-label="Loan pre-qualification">
      <span className="label">Loan pre-qualification</span>
      <div className="prequal__cols">
        {prequal.finance && <Column title="Finance your next car" d={prequal.finance} />}
        {prequal.refinance && <Column title="Refinance your loan" d={prequal.refinance} refinance />}
      </div>
      <p className="muted small prequal__foot">
        Estimate, not an offer or a credit decision. Rates start from Experian Q3 2025 averages for each credit tier. Risk model: logistic regression on UCI
        German Credit (AUC {CREDIT_MODEL.metrics.auc}); sex, age, marital status and nationality are not used.
      </p>
    </section>
  );
}
