"use client";

import { MotionConfig, motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

// Entrance recipe for infrequent moments (a page's first load): opacity, 12px lift and 4px blur over 300ms,
// chunks staggered 100ms apart. Reduced motion keeps only a short opacity fade.
const ENTER_S = 0.3;
const STAGGER_S = 0.1;

/** Honors the OS reduced-motion setting for every motion component below it (transform and layout animations are skipped). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

function useItemVariants(): Variants {
  const reduced = useReducedMotion();
  return reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: ENTER_S, ease: "easeOut" } },
      };
}

type ListTag = "div" | "ul" | "dl";
type ItemTag = "div" | "li";
const LISTS = { div: motion.div, ul: motion.ul, dl: motion.dl } as Record<ListTag, typeof motion.div>;
const ITEMS = { div: motion.div, li: motion.li } as Record<ItemTag, typeof motion.div>;

/** Parent of StaggerItem children: plays once on mount, never again when props change (for example a slider moves). */
export function StaggerList({ as = "div", className, children, delay = 0, inView = false }: { as?: ListTag; className?: string; children: ReactNode; delay?: number; inView?: boolean }) {
  const List = LISTS[as];
  return (
    <List
      className={className}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once: true, amount: 0.2 } } : { animate: "show" })}
      variants={{ hidden: {}, show: { transition: { staggerChildren: STAGGER_S, delayChildren: delay } } }}
    >
      {children}
    </List>
  );
}

export function StaggerItem({ as = "div", className, children }: { as?: ItemTag; className?: string; children: ReactNode }) {
  const Item = ITEMS[as];
  return (
    <Item className={className} variants={useItemVariants()}>
      {children}
    </Item>
  );
}

/** A single block that enters on its own (outside any StaggerList). */
export function Reveal({ className, children, delay = 0, labelledBy }: { className?: string; children: ReactNode; delay?: number; labelledBy?: string }) {
  const variants = useItemVariants();
  return (
    <motion.section
      className={className}
      aria-labelledby={labelledBy}
      initial="hidden"
      animate="show"
      variants={{ hidden: variants.hidden, show: { ...(variants.show as object), transition: { ...((variants.show as { transition?: object }).transition ?? {}), delay } } }}
    >
      {children}
    </motion.section>
  );
}

/** Where you rank: the large dot glides from the left edge to your position once, on load. */
export function PeerBar({ others, you }: { others: number[]; you: number }) {
  const reduced = useReducedMotion();
  return (
    <div className="peer__bar" aria-hidden="true">
      {others.map((p, i) => (
        <i key={i} style={{ left: `${p}%` }} />
      ))}
      <motion.b
        initial={reduced ? false : { left: "0%" }}
        animate={{ left: `${you}%` }}
        transition={{ type: "spring", duration: 0.8, bounce: 0, delay: 0.3 }}
      />
    </div>
  );
}
