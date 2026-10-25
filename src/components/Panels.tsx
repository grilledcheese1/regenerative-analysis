"use client";

import { useState } from "react";
import type { Condition, DriverProfileName } from "@/lib/model/config";
import type { Axis, Savings, TripAnalysis } from "@/lib/model/score";
import type { SimTrip } from "@/lib/model/simulate";
import { CAUSE_LABEL } from "@/lib/segments";

const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

function scoreColor(v: number) {
  return v >= 75 ? "var(--seg-good)" : v >= 50 ? "var(--seg-mid)" : "var(--seg-bad)";
}

export function ScoreHero({ a }: { a: TripAnalysis }) {
  return (
    <div className="card score-hero">
      <span className="label">Trip score</span>
      <div className="score-number" style={{ color: scoreColor(a.score) }}>
        {a.score}
        <small>/100</small>
      </div>
      <div className="score-label">{a.label}</div>
      <div className="stat-row">
        <Stat label="Recovered" value={`${a.regenKwh.toFixed(3)} kWh`} />
        <Stat label="Available" value={`${a.availableKwh.toFixed(3)} kWh`} />
        <Stat label="Brake heat" value={`${a.frictionKwh.toFixed(3)} kWh`} />
        <Stat label="Missed events" value={String(a.missedCount)} />
        <Stat label="Regen share" value={`${(a.regenShare * 100).toFixed(0)}%`} />
        <Stat label="Duration" value={fmtT(a.durationS)} />
      </div>
      <span className="muted" style={{ fontSize: "0.75rem" }}>
        Score = 100 · (1 − E_brake_heat ÷ (m·g·Δh_descent + Σ ½·m·v²_stop)). Regen and coasting both count as
        kept; only friction brake heat is lost.
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

export function AxisCards({ axes }: { axes: Axis[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="axes">
      {axes.map((x) => (
        <button key={x.key} className="card axis" onClick={() => setOpen(open === x.key ? null : x.key)}>
          <span className="label">{x.label}</span>
          <div className="bar">
            <span style={{ width: `${x.value}%`, background: scoreColor(x.value) }} />
          </div>
          <div className="val">{x.value}</div>
          {open === x.key ? (
            <div className="evidence">
              <div>ƒ {x.formula}</div>
              <div>→ {x.evidence}</div>
            </div>
          ) : (
            <div className="evidence muted">Show the work ↓</div>
          )}
        </button>
      ))}
    </div>
  );
}

export function Terminal({ trip, a, cursor }: { trip: SimTrip; a: TripAnalysis; cursor: number }) {
  const lines: { t: number; text: string; cls?: string }[] = [
    { t: 0, text: `$ regen-coach analyze --trip ${trip.id}` },
    { t: 0, text: `  vehicle ${trip.vehicle} · ${(trip.distanceM / 1000).toFixed(1)} km · ${trip.samples.length} samples` },
  ];
  let braking = false;
  for (const s of trip.samples) {
    const isBraking = s.regenKw + s.frictionKw > 3;
    if (isBraking && !braking) {
      lines.push({
        t: s.t,
        text: `[${fmtT(s.t)}] BRAKE  ${(s.speedMs * 2.237).toFixed(0).padStart(2)} mph  grade ${s.gradePct.toFixed(1)}%  regen ${s.regenKw.toFixed(1)} kW`,
        cls: "good",
      });
    }
    braking = isBraking;
  }
  for (const e of a.missed) {
    lines.push({
      t: e.t,
      text: `[${fmtT(e.t)}] MISSED ${CAUSE_LABEL[e.cause].toLowerCase()}  −${(e.lostKwh * 1000).toFixed(0)} Wh to brake heat`,
      cls: e.cause === "late-braking" ? "bad" : "mid",
    });
  }
  lines.sort((x, y) => x.t - y.t);
  const visible = lines.filter((l) => l.t <= cursor);
  if (cursor >= trip.samples.length - 1) {
    visible.push({ t: cursor, text: `── done · score ${a.score}/100 · ${a.regenKwh.toFixed(3)} kWh recovered · ${a.missedCount} missed`, cls: "good" });
  }

  return (
    <div className="card">
      <span className="label">Trip log</span>
      <div className="terminal" ref={(el) => el?.scrollTo({ top: el.scrollHeight })}>
        {visible.map((l, i) => (
          <div key={i} className={l.cls}>{l.text}</div>
        ))}
        <span className="muted">▍</span>
      </div>
    </div>
  );
}

interface SavingsProps {
  savings: Savings;
  gapDollars: number;
  gasPrice: number;
  tripsPerDay: number;
  setGasPrice: (n: number) => void;
  setTripsPerDay: (n: number) => void;
}

export function SavingsCard({ savings: s, gapDollars, gasPrice, tripsPerDay, setGasPrice, setTripsPerDay }: SavingsProps) {
  return (
    <div className="card">
      <span className="label">What regen is worth · estimates</span>
      <div className="big-money">${s.annualDollars.toFixed(0)}<span className="muted" style={{ fontSize: "1rem" }}> / year</span></div>
      <div className="muted mono" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        {s.annualGallons.toFixed(1)} gal · {s.annualCo2Kg.toFixed(0)} kg CO₂ avoided per year
      </div>
      <div className="slider">
        <span>Gas price</span>
        <input type="range" min={2} max={5} step={0.05} value={gasPrice} onChange={(e) => setGasPrice(+e.target.value)} />
        <span className="mono">${gasPrice.toFixed(2)}</span>
      </div>
      <div className="slider">
        <span>Trips / day</span>
        <input type="range" min={1} max={8} step={1} value={tripsPerDay} onChange={(e) => setTripsPerDay(+e.target.value)} />
        <span className="mono">{tripsPerDay}</span>
      </div>
      <div className="stat-row" style={{ marginTop: "0.75rem" }}>
        <Stat label="This trip" value={`$${s.dollars.toFixed(3)}`} />
        <Stat label="Fuel saved" value={`${(s.gallons * 128).toFixed(1)} fl oz`} />
        <Stat label="Left on table" value={`$${s.leftOnTableDollars.toFixed(3)}`} />
        <Stat label="Smooth vs aggr. / yr" value={`$${gapDollars.toFixed(0)}`} />
      </div>
    </div>
  );
}

export function CoachTip({ a, driver, condition }: { a: TripAnalysis; driver: DriverProfileName; condition: Condition }) {
  const [state, setState] = useState<{ tip: string; source: "claude" | "rules" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const summary = {
    driver,
    condition,
    score: a.score,
    regenKwh: +a.regenKwh.toFixed(3),
    ceilingKwh: +a.ceilingKwh.toFixed(3),
    frictionKwh: +a.frictionKwh.toFixed(3),
    axes: Object.fromEntries(a.axes.map((x) => [x.label, x.value])),
    missedByCause: a.missed.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.cause]: (acc[e.cause] ?? 0) + 1 }), {}),
  };

  async function ask() {
    setLoading(true);
    try {
      const res = await fetch("/api/coach", { method: "POST", body: JSON.stringify(summary) });
      const json = await res.json();
      if (!res.ok || !json.tip) {
        setUnavailable(
          json.error?.code === "provider_not_configured"
            ? "Coaching tip unavailable (no AI key configured)"
            : "Coaching tip unavailable (AI provider error)",
        );
        throw new Error(json.error?.message);
      }
      setUnavailable(null);
      setState({ tip: json.tip, source: "claude" });
    } catch {
      setState({ tip: ruleTip(a, condition), source: "rules" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <span className="label">Coach</span>
      <p style={{ minHeight: "3rem", lineHeight: 1.5 }}>
        {state ? state.tip : <span className="muted">Ask for a tip based on this trip&apos;s evidence.</span>}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button className="btn primary" onClick={ask} disabled={loading}>
          {loading ? "Thinking…" : state ? "Ask again" : "Get coaching tip"}
        </button>
        {state && (
          <span className="credit">
            {state.source === "claude" ? "Written by Claude from the evidence" : `Rule-based fallback · ${unavailable ?? "AI unavailable"}`}
          </span>
        )}
      </div>
    </div>
  );
}

function ruleTip(a: TripAnalysis, condition: Condition): string {
  const worst = [...a.axes].sort((x, y) => x.value - y.value)[0];
  if (a.missed.some((e) => e.cause === "low-grip"))
    return `Grip limited regen ${a.missed.filter((e) => e.cause === "low-grip").length} times on ${condition} roads. Start braking earlier and softer so the motor, not the pads, does the slowing.`;
  if (worst.key === "smooth") return "Several stops used hard braking beyond what regen can absorb. Lift off sooner and ease into the brake pedal.";
  if (worst.key === "speed") return "Running above the limit means more energy to shed at every stop. Holding the limit lets regen capture a larger share.";
  if (worst.key === "descent") return "On downhills, ease off early and let regen hold your speed instead of riding the friction brakes.";
  return "Your stop capture is lowest. Anticipate signals: lift off earlier so regen handles the whole slowdown.";
}

interface CompareRow {
  label: string;
  values: number[];
  fmt: (n: number) => string;
  better: "high" | "low";
}

export function ComparePanel({ cols }: { cols: { name: string; a: TripAnalysis; gasPrice: number }[] }) {
  const rows: CompareRow[] = [
    { label: "Energy recovered (kWh)", values: cols.map((c) => c.a.regenKwh), fmt: (n) => n.toFixed(3), better: "high" },
    { label: "Lost as brake heat (kWh)", values: cols.map((c) => c.a.frictionKwh), fmt: (n) => n.toFixed(3), better: "low" },
    { label: "Fuel used (gal)", values: cols.map((c) => c.a.fuelGallons), fmt: (n) => n.toFixed(3), better: "low" },
    { label: "Fuel cost ($)", values: cols.map((c) => c.a.fuelGallons * c.gasPrice), fmt: (n) => n.toFixed(2), better: "low" },
    { label: "CO₂ emitted (kg)", values: cols.map((c) => c.a.fuelGallons * 8.9), fmt: (n) => n.toFixed(2), better: "low" },
    { label: "Braking handled by regen", values: cols.map((c) => c.a.regenShare * 100), fmt: (n) => `${n.toFixed(0)}%`, better: "high" },
    { label: "Efficiency score", values: cols.map((c) => c.a.score), fmt: (n) => n.toFixed(0), better: "high" },
  ];
  const [conv, smooth, aggr] = cols.map((c) => c.a);
  const lessPct = (s: number, ag: number) => (ag > 0 ? ((ag - s) / ag) * 100 : 0);
  const heatPct = lessPct(smooth.frictionKwh, aggr.frictionKwh);
  const fuelPct = lessPct(smooth.fuelGallons, aggr.fuelGallons);

  return (
    <div className="card">
      <div style={{ overflowX: "auto" }}>
        <table className="compare">
          <thead>
            <tr>
              <th>Metric</th>
              {cols.map((c) => <th key={c.name}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const best = r.better === "high" ? Math.max(...r.values) : Math.min(...r.values);
              return (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className={v === best ? "best" : undefined}>{r.fmt(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="pitch">
        Same road, same trip: regen recovers <strong>{smooth.regenKwh.toFixed(2)} kWh</strong> that the same car with regen off
        throws away as {conv.frictionKwh.toFixed(2)} kWh of brake heat, and smooth driving wastes{" "}
        <strong>{heatPct.toFixed(0)}% less</strong> energy as brake heat than aggressive driving while burning{" "}
        <strong>{fuelPct.toFixed(0)}% less fuel</strong>.
      </p>
    </div>
  );
}
