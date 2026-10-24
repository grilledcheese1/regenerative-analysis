"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Trip } from "@/lib/trip/types";
import { TRIP_CONFIG } from "./config";

export interface TripChartsProps {
  trip: Trip | null | undefined;
  currentIndex: number;
  /** Called with a sample index when the user clicks a chart. */
  onSeek?: (index: number) => void;
}

const MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };
const AXIS = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

export default function TripCharts({ trip, currentIndex, onSeek }: TripChartsProps) {
  const data = useMemo(
    () =>
      (trip?.samples ?? []).map((s) => ({
        t: s.t,
        elevation: s.elevation * TRIP_CONFIG.units.feet,
        speed: s.speed * TRIP_CONFIG.units.mph,
        regenKw: s.regenKw,
        frictionKw: s.frictionKw,
      })),
    [trip],
  );

  if (data.length === 0) {
    return (
      <div className="card" role="status">
        No trip data to chart.
      </div>
    );
  }

  const cursorT = data[Math.min(currentIndex, data.length - 1)].t;
  const handleClick = (state: { activeIndex?: unknown } | undefined) => {
    const raw = state?.activeIndex;
    if (raw === null || raw === undefined || raw === "") return; // click outside the plot area
    const i = Number(raw);
    if (onSeek && Number.isFinite(i)) onSeek(i);
  };
  const xAxis = (show: boolean) => (
    <XAxis
      dataKey="t"
      type="number"
      domain={["dataMin", "dataMax"]}
      hide={!show}
      unit="s"
      {...AXIS}
    />
  );
  const cursor = <ReferenceLine x={cursorT} stroke="var(--text)" strokeWidth={1.5} ifOverflow="visible" />;
  const common = { data, margin: MARGIN, syncId: "trip", onClick: handleClick } as const;
  const grid = <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" vertical={false} />;
  const tip = (
    <Tooltip
      contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10 }}
      labelFormatter={(t) => `${t}s`}
      formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v))}
    />
  );

  return (
    <div className="charts">
      <section className="chart card" aria-label="Elevation">
        <span className="label">Elevation (ft)</span>
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart {...common}>
            {grid}
            {xAxis(false)}
            <YAxis width={44} domain={["auto", "auto"]} tickFormatter={(v) => Math.round(v).toString()} {...AXIS} />
            {tip}
            <Area dataKey="elevation" name="Elevation" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.18} isAnimationActive={false} />
            {cursor}
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="chart card" aria-label="Speed">
        <span className="label">Speed (mph)</span>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart {...common}>
            {grid}
            {xAxis(false)}
            <YAxis width={44} domain={[0, "auto"]} tickFormatter={(v) => Math.round(v).toString()} {...AXIS} />
            {tip}
            <Line dataKey="speed" name="Speed" stroke="var(--text-2)" dot={false} strokeWidth={2} isAnimationActive={false} />
            {cursor}
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="chart card" aria-label="Regen versus friction braking power">
        <span className="label">Regen vs friction (kW)</span>
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart {...common}>
            {grid}
            {xAxis(true)}
            <YAxis width={44} domain={[0, "auto"]} tickFormatter={(v) => Math.round(v).toString()} {...AXIS} />
            {tip}
            <Area dataKey="regenKw" name="Regen" stackId="p" stroke="var(--regen-good)" fill="var(--regen-good)" fillOpacity={0.55} isAnimationActive={false} />
            <Area dataKey="frictionKw" name="Friction" stackId="p" stroke="var(--regen-bad)" fill="var(--regen-bad)" fillOpacity={0.55} isAnimationActive={false} />
            {cursor}
          </AreaChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
