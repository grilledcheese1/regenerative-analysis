"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { useEffect, useState } from "react";

/** Thin accent line across the top that fills with page scroll. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { duration: 0.3, bounce: 0 });
  return <motion.div className="story__progress" style={{ scaleX: progress }} aria-hidden="true" />;
}

/** Right-hand dots (desktop) that show where you are in the story, plus a thin progress line across the top. */
export default function SectionRail({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0].id);

  // Looked up on every scroll rather than once, because the sections mount after the rail (they wait for banking data).
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      setActive(atEnd ? sections[sections.length - 1].id : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const resize = new ResizeObserver(onScroll); // sections appear after the banking data loads, which changes the page height
    resize.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resize.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  const activeIndex = sections.findIndex((s) => s.id === active);

  return (
    <>
      <ScrollProgress />
      <nav className="story__rail" aria-label="Sections">
        <ol>
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-label={s.label}
                aria-current={active === s.id ? "true" : undefined}
                className={`story__dot${i < activeIndex ? " is-passed" : ""}`}
              >
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
