"use client";

import type { Trip } from "@/lib/trip/types";
import type { TripReplay } from "./useTripReplay";

export interface ReplayControlsProps {
  trip: Trip | null | undefined;
  replay: TripReplay;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
}

export default function ReplayControls({ trip, replay, follow, onFollowChange }: ReplayControlsProps) {
  const count = trip?.samples.length ?? 0;
  const disabled = count < 2;
  const t = trip?.samples[replay.currentIndex]?.t ?? 0;
  const total = trip?.samples[count - 1]?.t ?? 0;

  return (
    <div className="replay card">
      <button
        type="button"
        className="btn btn--icon"
        onClick={replay.toggle}
        disabled={disabled}
        aria-label={replay.playing ? "Pause replay" : "Play replay"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {replay.playing ? (
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          ) : (
            <path d="M9 5.5v13a.5.5 0 0 0 .76.43l10.4-6.5a.5.5 0 0 0 0-.86L9.76 5.07A.5.5 0 0 0 9 5.5z" />
          )}
        </svg>
      </button>
      <input
        type="range"
        className="replay__range"
        min={0}
        max={Math.max(count - 1, 0)}
        step={1}
        value={replay.currentIndex}
        disabled={disabled}
        onChange={(e) => replay.setIndex(Number(e.target.value))}
        aria-label="Trip position"
      />
      <span className="replay__time label" aria-live="off">
        {t}s / {total}s
      </span>
      <label className="replay__follow label">
        <input type="checkbox" checked={follow} onChange={(e) => onFollowChange(e.target.checked)} />
        Follow
      </label>
    </div>
  );
}
