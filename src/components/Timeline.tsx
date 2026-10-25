"use client";

import { useMemo, useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SimSample } from "@/lib/model/simulate";

interface TimelineProps {
  samples: SimSample[];
  cursor: number;
}

const axisTick = { fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" };
const tooltipStyle = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

/** Speed, elevation and regen power stacked on one time axis. */
export default function Timeline({ samples, cursor }: TimelineProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true, amount: 0.15 });
  const reducedMotion = useReducedMotion();
  const data = useMemo(
    () =>
      samples.map((s) => ({
        t: s.t,
        mph: +(s.speedMs * 2.237).toFixed(1),
        limit: +(s.limitMs * 2.237).toFixed(0),
        elev: +s.elevationM.toFixed(1),
        regen: +s.regenKw.toFixed(1),
        friction: +s.frictionKw.toFixed(1),
      })),
    [samples],
  );

  const charts = [
    { key: "speed", label: "Speed (mph)", height: 120 },
    { key: "elev", label: "Elevation (m)", height: 90 },
    { key: "power", label: "Braking power (kW): regen vs friction", height: 120 },
  ];

  const common = (
    <>
      <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
      <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tick={axisTick} stroke="var(--grid)" tickFormatter={(t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`} />
      <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => `t = ${t}s`} />
      <ReferenceLine x={cursor} stroke="var(--accent)" />
    </>
  );

  return (
    <motion.div
      ref={cardRef}
      className="card analytics-chart-card"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(5px)" }}
      whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.65, ease: "easeOut" }}
    >
      {charts.map((c) => (
        <div key={c.key} className="analytics-chart" style={{ marginBottom: 8 }}>
          <span className="label">{c.label}</span>
          {inView ? <ResponsiveContainer width="100%" height={c.height}>
            {c.key === "speed" ? (
              <LineChart data={data} syncId="trip" margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                {common}
                <YAxis tick={axisTick} stroke="var(--grid)" />
                <Line dataKey="limit" stroke="var(--muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                <Line dataKey="mph" stroke="var(--accent)" strokeWidth={1.8} dot={false} isAnimationActive={!reducedMotion} animationBegin={80} animationDuration={900} animationEasing="ease-out" />
              </LineChart>
            ) : c.key === "elev" ? (
              <AreaChart data={data} syncId="trip" margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                {common}
                <YAxis tick={axisTick} stroke="var(--grid)" domain={["dataMin - 5", "dataMax + 5"]} />
                <Area dataKey="elev" stroke="var(--text-2)" fill="var(--grid)" isAnimationActive={!reducedMotion} animationBegin={120} animationDuration={950} animationEasing="ease-out" />
              </AreaChart>
            ) : (
              <AreaChart data={data} syncId="trip" margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                {common}
                <YAxis tick={axisTick} stroke="var(--grid)" />
                <Area dataKey="regen" stackId="b" stroke="var(--seg-good)" fill="var(--seg-good)" fillOpacity={0.5} isAnimationActive={!reducedMotion} animationBegin={160} animationDuration={950} animationEasing="ease-out" />
                <Area dataKey="friction" stackId="b" stroke="var(--seg-bad)" fill="var(--seg-bad)" fillOpacity={0.5} isAnimationActive={!reducedMotion} animationBegin={260} animationDuration={950} animationEasing="ease-out" />
              </AreaChart>
            )}
          </ResponsiveContainer>
          : <div aria-hidden="true" style={{ height: c.height }} />}
        </div>
      ))}
    </motion.div>
  );
}
