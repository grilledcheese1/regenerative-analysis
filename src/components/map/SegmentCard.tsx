"use client";

import { AnimatePresence } from "motion/react";
import { useMemo } from "react";
import SegmentPopup from "@/components/story/SegmentPopup";
import type { MissedEvent } from "@/lib/model/score";
import type { SimSample } from "@/lib/model/simulate";
import type { Segment } from "@/lib/segments";
import { segmentSamples, summarizeSegment } from "@/lib/segmentTelemetry";

/**
 * The regen telemetry card for one clicked stretch of route, the same card on every map (story, Drives, dashboard).
 * Render it inside the map's `position: relative` box. `selected` is the stretch's index in `segments`.
 */
export default function SegmentCard({
  selected,
  samples,
  segments,
  missed,
  regenEfficiency,
  onClose,
}: {
  selected: number | null;
  samples: SimSample[];
  segments: Segment[];
  missed: MissedEvent[];
  regenEfficiency?: number; // the simulated car's; omitted, the default car's
  onClose: () => void;
}) {
  const summary = useMemo(
    () => (selected === null ? null : summarizeSegment(segmentSamples(samples, selected), missed, regenEfficiency)),
    [selected, samples, missed, regenEfficiency],
  );
  return (
    <AnimatePresence>
      {summary && selected !== null && segments[selected] && (
        <SegmentPopup key={selected} summary={summary} grade={segments[selected].grade} onClose={onClose} />
      )}
    </AnimatePresence>
  );
}
