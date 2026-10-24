"use client";

import { useCallback, useEffect, useState } from "react";
import { TRIP_CONFIG } from "./config";

export interface TripReplay {
  currentIndex: number;
  playing: boolean;
  setIndex: (i: number) => void;
  toggle: () => void;
}

/** Shared replay clock: one sample per `replay.stepMs` while playing. */
export function useTripReplay(sampleCount: number): TripReplay {
  const last = Math.max(sampleCount - 1, 0);
  const [state, setState] = useState({ index: 0, playing: false });
  const index = Math.min(state.index, last);

  useEffect(() => {
    if (!state.playing) return;
    let raf = 0;
    let prev = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += now - prev;
      prev = now;
      const steps = Math.floor(acc / TRIP_CONFIG.replay.stepMs);
      if (steps > 0) {
        acc -= steps * TRIP_CONFIG.replay.stepMs;
        setState((s) => {
          const next = Math.min(s.index + steps, last);
          return { index: next, playing: next < last };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.playing, last]);

  const setIndex = useCallback(
    (i: number) => setState((s) => ({ ...s, index: Math.min(Math.max(Math.round(i), 0), last) })),
    [last],
  );
  const toggle = useCallback(
    () =>
      setState((s) =>
        s.playing ? { ...s, playing: false } : { index: s.index >= last ? 0 : s.index, playing: last > 0 },
      ),
    [last],
  );

  return { currentIndex: index, playing: state.playing, setIndex, toggle };
}
