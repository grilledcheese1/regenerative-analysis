"use client";

import { useMemo } from "react";
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
    <div className="card">
      {charts.map((c) => (
        <div key={c.key} style={{ marginBottom: 8 }}>
          <span className="label">{c.label}</span>
          <ResponsiveContainer width="100%" height={c.height}>
            {c.key === "speed" ? (
              <LineChart data={data} syncId="trip" margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                {common}
                <YAxis tick={axisTick} stroke="var(--grid)" />
                <Line dataKey="limit" stroke="var(--muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                <Line dataKey="mph" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            ) : c.key === "elev" ? (
              <AreaChart data={data} syncId="trip" margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                {common}
                <YAxis tick={axisTick} stroke="var(--grid)" domain={["dataMin - 5", "dataMax + 5"]} />
                <Area dataKey="elev" stroke="var(--text-2)" fill="var(--grid)" isAnimationActive={false} />
              </AreaChart>
            ) : (
              <AreaChart data={data} syncId="trip" margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                {common}
                <YAxis tick={axisTick} stroke="var(--grid)" />
                <Area dataKey="regen" stackId="b" stroke="var(--seg-good)" fill="var(--seg-good)" fillOpacity={0.5} isAnimationActive={false} />
                <Area dataKey="friction" stackId="b" stroke="var(--seg-bad)" fill="var(--seg-bad)" fillOpacity={0.5} isAnimationActive={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
