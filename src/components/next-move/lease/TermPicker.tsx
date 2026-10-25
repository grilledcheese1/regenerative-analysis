"use client";

import { useState } from "react";
import type { OptionResult } from "@/contracts";
import { usd } from "@/domain/format";

/**
 * Lease terms side by side. Choosing one shows its numbers on this card only: the ranking and the
 * recommendation always use the app's pick, marked "Best".
 */
export default function TermPicker({ lease, compact = false }: { lease: NonNullable<OptionResult["lease"]>; compact?: boolean }) {
  const [term, setTerm] = useState(lease.chosenTermMonths);
  const t = lease.terms.find((x) => x.termMonths === term) ?? lease.terms[0];
  if (lease.terms.length < 2) return null;
  return (
    <div className={`terms${compact ? " terms--compact" : ""}`}>
      <div className="terms__row" role="group" aria-label="Lease term">
        {lease.terms.map((x) => (
          <button key={x.termMonths} type="button" className="terms__btn" aria-pressed={x.termMonths === term} onClick={() => setTerm(x.termMonths)}>
            <span>{x.termMonths} mo</span>
            {x.termMonths === lease.chosenTermMonths && <em className="terms__best">Best</em>}
          </button>
        ))}
      </div>
      <dl className="terms__lines" data-testid="term-detail">
        <div><dt>Average per month</dt><dd>{usd(t.avgMonthlyCostCents)}</dd></div>
        <div><dt>Payment</dt><dd>{usd(t.paymentCents)}/mo</dd></div>
        <div><dt>Due at signing</dt><dd>{usd(t.dueAtSigningCents)}</dd></div>
        <div><dt>Rate</dt><dd>{t.aprEquivalentPct.toFixed(1)}% APR equivalent</dd></div>
        {t.mileageOverageCents > 0 && <div><dt>Expected mileage charge</dt><dd>{usd(t.mileageOverageCents)}</dd></div>}
      </dl>
      {term !== lease.chosenTermMonths && <p className="muted small">The recommendation uses the {lease.chosenTermMonths}-month term.</p>}
      {t.exclusion && <p className="excl">✕ {t.exclusion}</p>}
      {t.pastWarranty && <p className="muted small">Runs past the 3-year / 36,000-mile basic warranty.</p>}
      <p className="muted small">Synthetic lease terms, averaged over each term&rsquo;s own length including fees and expected mileage charges.</p>
    </div>
  );
}
