"use client";

import { motion, useMotionTemplate, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

/**
 * One slide of the vertical story. As you scroll past it, its content blurs, dims and shrinks a little while the next
 * slide rises into view. The two effects live on separate wrappers so they never fight over the same properties.
 * `lite` drops the blur (opacity and scale only) for slides that hold a WebGL map, where a CSS filter is expensive.
 */
export default function StorySection({
  id,
  kicker,
  title,
  lede,
  lite = false,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  lede?: ReactNode;
  lite?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  // Progress is 0 while the slide is being read and 1 once it has left the top. It is gated by two measures so the slide the
  // reader is on never blurs: the bottom-edge one (0 until the slide's bottom is still below the screen) and the top-edge
  // one (0 until the slide's top has scrolled past the top of the screen). Whichever is smaller wins.
  const { scrollYProgress: bottomProgress } = useScroll({ target: ref, offset: ["end end", "end start"] });
  const { scrollYProgress: topProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scrollYProgress = useTransform([bottomProgress, topProgress], ([b, t]: number[]) => Math.min(b, t));
  const blurPx = useTransform(scrollYProgress, [0, 0.9], [0, 10]);
  const filter = useMotionTemplate`blur(${blurPx}px)`;
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.12]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const exitStyle = reduced ? { opacity } : lite ? { opacity, scale } : { filter, opacity, scale };

  return (
    <section id={id} ref={ref} className="story__section" aria-labelledby={`${id}-title`}>
      <motion.div className="story__exit" style={exitStyle}>
        <motion.div
          className="story__enter"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 56, filter: "blur(6px)" }}
          whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="story__kicker">{kicker}</p>
          <h2 id={`${id}-title`} className="story__title">
            {title}
          </h2>
          {lede && <p className="story__lede">{lede}</p>}
          {children}
        </motion.div>
      </motion.div>
    </section>
  );
}
