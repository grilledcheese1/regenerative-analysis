"use client";

import { useEffect, useState, type RefObject } from "react";

interface Options {
  enter: number; // visible fraction that counts as "seen in full"
  leave: number; // below this fraction it counts as scrolled away
  dwellMs: number; // how long it must stay in view before it counts
}

/**
 * True once the element has been in view along its whole height for `dwellMs`, false again once it is
 * mostly scrolled away. An element taller than the window can never be 100% visible, so the bar is scaled down.
 */
export function useFullyInView(ref: RefObject<HTMLElement | null>, { enter, leave, dwellMs }: Options) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        const maxRatio = Math.min(1, window.innerHeight / Math.max(1, entry.boundingClientRect.height));
        const bar = Math.min(enter, maxRatio * enter);
        if (entry.intersectionRatio >= bar) {
          if (timer === undefined) timer = setTimeout(() => setSeen(true), dwellMs);
        } else {
          clear();
          if (entry.intersectionRatio < leave) setSeen(false);
        }
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    );
    io.observe(el);
    return () => {
      clear();
      io.disconnect();
    };
  }, [ref, enter, leave, dwellMs]);

  return seen;
}
