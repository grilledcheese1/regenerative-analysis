"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Comparison, OptionResult } from "@/contracts";
import { usd } from "@/domain/format";
import SwitchMath from "../next-move/lease/SwitchMath";
import TermPicker from "../next-move/lease/TermPicker";
import StorySection from "./StorySection";

const ILLUSTRATIVE = new Set<OptionResult["kind"]>(["lease_new", "purchase_new", "sell_replace", "refinance", "switch_now"]);
const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

function Slider({ label, id, min, max, step, value, onChange, display }: { label: string; id: string; min: number; max: number; step: number; value: number; onChange: (n: number) => void; display: string }) {
  return (
    <label className="m-slider">
      <span>{label}</span>
      <input type="range" id={id} name={id} min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <b>{display}</b>
    </label>
  );
}

function Detail({ o }: { o: OptionResult }) {
  return (
    <dl className="plan__lines">
      <div><dt>Upfront cash</dt><dd>{usd(o.upfrontCashCents)}</dd></div>
      <div><dt>Payment</dt><dd>{usd(o.monthlyPaymentCents)}/mo</dd></div>
      <div><dt>Fuel, insurance, maintenance</dt><dd>{usd(o.monthlyRunningCents)}/mo</dd></div>
      <div><dt>Budget left each month</dt><dd className={o.monthlyRemainingCents < 0 ? "neg" : undefined}>{usd(o.monthlyRemainingCents)}</dd></div>
      <div><dt>Equity at the end</dt><dd>{usd(o.endingEquityCents)}</dd></div>
      <div><dt>Economic cost</dt><dd>{usd(o.economicCostCents)}</dd></div>
    </dl>
  );
}

function Row({ o, rank, lead, maxCost }: { o: OptionResult; rank: number; lead: boolean; maxCost: number }) {
  const [open, setOpen] = useState(false);
  const bar = Math.max(4, Math.round((100 * o.avgMonthlyCostCents) / (maxCost || 1)));
  return (
    <motion.li layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING} className={`combo__row${lead ? " is-best" : ""}${o.feasible ? "" : " is-out"}`}>
      <button type="button" className="combo__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="combo__rank">{rank}</span>
        <span className="combo__main">
          <strong>
            {lead && <span className="combo__badge">Leading</span>}
            {o.label}
          </strong>
          <span className="combo__plan">{o.feasible ? o.tradeoff : o.exclusions[0] ?? "Not feasible with the information we have"}</span>
        </span>
        <span className="combo__nums">
          <b>{usd(o.avgMonthlyCostCents)}/mo</b>
          <small>average, all-in</small>
        </span>
        <span className="combo__bar" aria-hidden="true"><i style={{ width: `${o.feasible ? bar : 0}%` }} /></span>
      </button>
      {ILLUSTRATIVE.has(o.kind) && <p className="combo__tag">Illustrative terms. Not a quote or offer.</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} style={{ overflow: "hidden" }}>
            <Detail o={o} />
            {o.lease && <TermPicker lease={o.lease} compact />}
            {o.switchMath && <SwitchMath m={o.switchMath} />}
            {o.missingInputs.length > 0 && <p className="muted small">Needs: {o.missingInputs.map((m) => m.replaceAll("_", " ")).join(", ")}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/** Slide 3. The leading option stands out, two more sit beside it, and the rest are one tap away. */
export default function Options({
  comparison,
  gasCents,
  onGas,
  monthlyMiles,
  onMiles,
}: {
  comparison: Comparison;
  gasCents: number;
  onGas: (n: number) => void;
  monthlyMiles: number;
  onMiles: (n: number) => void;
}) {
  const [all, setAll] = useState(false);
  const leader = comparison.recommendation.selectedOptionId;
  // The app's order: the leader first, then by average monthly cost (feasible before excluded).
  const ranked = [...comparison.options].sort((a, b) => Number(b.optionId === leader) - Number(a.optionId === leader) || Number(b.feasible) - Number(a.feasible) || a.avgMonthlyCostCents - b.avgMonthlyCostCents);
  const shown = all ? ranked : ranked.slice(0, 3);
  const maxCost = Math.max(...ranked.filter((o) => o.feasible).map((o) => o.avgMonthlyCostCents), 1);

  return (
    <StorySection
      id="options"
      kicker="Your options"
      title="Every way to handle it, side by side"
      lede="Ranked by average monthly cost, all-in: leases over their own term, everything else over three years. Move the sliders and the ranking updates."
    >
      <div className="m-sliders">
        <Slider label="Gas price" id="story-gas" min={200} max={500} step={10} value={gasCents} onChange={onGas} display={`${usd(gasCents, 2)}/gal`} />
        <Slider label="Miles per month" id="story-miles" min={200} max={2000} step={25} value={monthlyMiles} onChange={onMiles} display={monthlyMiles.toLocaleString()} />
      </div>
      <ul className="combo">
        <AnimatePresence initial={false}>
          {shown.map((o, i) => (
            <Row key={o.optionId} o={o} rank={i + 1} lead={o.optionId === leader} maxCost={maxCost} />
          ))}
        </AnimatePresence>
      </ul>
      {ranked.length > 3 && (
        <button type="button" className="m-btn m-btn--ghost" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${ranked.length} options`}
        </button>
      )}
      {comparison.notConsidered.length > 0 && (
        <p className="muted small">Not compared: {comparison.notConsidered.map((n) => `${n.label} (${n.reason})`).join("; ")}</p>
      )}
    </StorySection>
  );
}
