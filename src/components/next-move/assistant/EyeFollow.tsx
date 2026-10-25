"use client";

import { useEffect, useRef } from "react";
import styles from "./AskNextMove.module.css";

const EYES = 2;
const BLINK_EVERY_MS = 3200;

/** A pair of eyes whose pupils follow the pointer anywhere on the page. Decorative; the button's text is its label. */
export default function EyeFollow() {
  const eyes = useRef<(HTMLSpanElement | null)[]>([]);
  const pupils = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        eyes.current.forEach((eye, i) => {
          const pupil = pupils.current[i];
          if (!eye || !pupil) return;
          const r = eye.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          const reach = (r.width - pupil.offsetWidth) / 2 - 2;
          const dist = Math.hypot(dx, dy) || 1;
          const k = Math.min(reach, dist) / dist;
          pupil.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <span className={styles.eyes} aria-hidden="true">
      {Array.from({ length: EYES }, (_, i) => (
        <span key={i} ref={(el) => void (eyes.current[i] = el)} className={styles.eye} style={{ animationDuration: `${BLINK_EVERY_MS}ms` }}>
          <span ref={(el) => void (pupils.current[i] = el)} className={styles.pupil} />
        </span>
      ))}
    </span>
  );
}
