"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { useEffect, useState } from "react";

/** Right-hand dots (desktop) that show where you are in the story, plus a thin progress line across the top. */
export default function SectionRail({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0].id);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { duration: 0.3, bounce: 0 });

  useEffect(() => {
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.intersectionRatio);
        const top = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] > 0) setActive(top[0]);
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [sections]);

  return (
    <>
      <motion.div className="story__progress" style={{ scaleX: progress }} aria-hidden="true" />
      <nav className="story__rail" aria-label="Sections">
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} aria-label={s.label} aria-current={active === s.id ? "true" : undefined} className="story__dot">
                {active === s.id && <motion.span layoutId="rail-active" className="story__dot-fill" transition={{ type: "spring", duration: 0.3, bounce: 0 }} />}
                <span className="story__dot-label">{s.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
