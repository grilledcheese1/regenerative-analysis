"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import type { SegmentSummary } from "@/lib/segmentTelemetry";
import { GRADE_VAR, type SegmentGrade } from "@/lib/segments";

const num = (n: number, d = 0) => n.toFixed(d);

/** Telemetry for one clicked stretch of route, whatever its grade. Slides up over the map; Escape or the close button dismisses it. */
export default function SegmentPopup({ summary, grade, onClose }: { summary: SegmentSummary; grade: SegmentGrade; onClose: () => void }) {
  const color = `var(${GRADE_VAR[grade]})`;
  const kicker =
    grade === "good" ? "Full regen" : grade === "mid" ? "Partial regen" : grade === "bad" ? "Missed regen" : "Coasting";
  const reduced = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="seg-popup"
      role="dialog"
      aria-label="Telemetry for this stretch"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className="seg-popup__head">
        <div>
          <span className="seg-popup__kicker" style={{ color }}>
            {kicker}
            {grade === "mid" || grade === "bad" ? ` · ${summary.cause ?? "friction braking"}` : ""}
          </span>
          <strong>
            {num(summary.tStart)}s to {num(summary.tEnd)}s
          </strong>
        </div>
        <button type="button" className="seg-popup__close" onClick={onClose} aria-label="Close telemetry">
          ×
        </button>
      </div>
      <dl className="seg-popup__grid">
        <div><dt>Speed</dt><dd>{num(summary.startMph)} → {num(summary.endMph)} mph</dd></div>
        <div><dt>Brake demand</dt><dd>{num(summary.peakBrake * 100)}% peak</dd></div>
        <div><dt>Regen power</dt><dd>{num(summary.regenKw, 1)} kW</dd></div>
        <div><dt>Friction brakes</dt><dd>{num(summary.frictionKw, 1)} kW</dd></div>
        <div><dt>Captured</dt><dd>{summary.capturePct}% of braking</dd></div>
        <div><dt>Grade</dt><dd>{num(summary.gradePct, 1)}% · {num(summary.elevationM)} m</dd></div>
        {summary.lostKwh > 0 && <div><dt>Energy lost</dt><dd>{num(summary.lostKwh, 3)} kWh</dd></div>}
      </dl>
      <div className="seg-popup__bar" role="img" aria-label={`${summary.capturePct}% of braking energy captured by regen`}>
        <span style={{ width: `${summary.capturePct}%`, background: color }} />
      </div>
      <p className="seg-popup__note">Simulated drive. Figures are estimates.</p>
    </motion.div>
  );
}
