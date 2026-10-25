"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_MS = 33; // state updates at about 30 fps; the map interpolates between samples

/**
 * A float cursor over `length` samples that advances while `active` and not paused, then loops.
 * The cursor stays where it is when inactive, so the car does not jump when the viewer scrolls away.
 */
export function useReplay(length: number, samplesPerSecond: number, active: boolean) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pos = useRef(0);
  const running = active && !paused && length > 1;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let shown = last;
    const tick = (now: number) => {
      pos.current = (pos.current + ((now - last) / 1000) * samplesPerSecond) % (length - 1);
      last = now;
      if (now - shown >= FRAME_MS) {
        shown = now;
        setIndex(pos.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, length, samplesPerSecond]);

  // `active` is whether the viewer is on the map; the camera keeps following the car while paused
  return { index, playing: running, active: active && length > 1, paused, setPaused };
}
