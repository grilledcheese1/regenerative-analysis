"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import RouteMap from "@/components/RouteMap";
import TripMapClient from "@/components/map/TripMapClient";
import Timeline from "@/components/Timeline";
import { AxisCards, CoachTip, ComparePanel, SavingsCard, ScoreHero, Terminal } from "@/components/Panels";
import { env } from "@/lib/env";
import { buildDemoRoute } from "@/lib/mock/route";
import { SURFACES, type Condition, type DriverProfileName } from "@/lib/model/config";
import { analyzeTrip, estimateSavings, type MissedEvent } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";
import { toContractTrip } from "@/lib/trip/adapt";
import { buildSegments, CAUSE_LABEL } from "@/lib/segments";

type Theme = "dark" | "bright";

const DRIVERS: DriverProfileName[] = ["smooth", "mixed", "aggressive"];
const CONDITIONS = Object.keys(SURFACES) as Condition[];
const END = Number.MAX_SAFE_INTEGER;
const route = buildDemoRoute();
const stops = route.stopsM.map((s) => {
  const p = route.points[Math.min(route.points.length - 1, Math.round(s / route.stepM))];
  return [p.lon, p.lat] as [number, number];
});

// Theme lives in localStorage; read it as an external store so SSR renders dark without a mismatch.
const themeListeners = new Set<() => void>();
function readTheme(): Theme {
  try {
    return localStorage.getItem("theme") === "bright" ? "bright" : "dark";
  } catch {
    return "dark";
  }
}
function writeTheme(t: Theme) {
  try {
    localStorage.setItem("theme", t);
  } catch {}
  themeListeners.forEach((l) => l());
}
function subscribeTheme(l: () => void) {
  themeListeners.add(l);
  return () => themeListeners.delete(l);
}

export default function Dashboard() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);
  const [driver, setDriver] = useState<DriverProfileName>("mixed");
  const [condition, setCondition] = useState<Condition>("dry");
  const [rawCursor, setCursor] = useState(END);
  const [playing, setPlaying] = useState(false);
  const [gasPrice, setGasPrice] = useState(env.defaultGasPrice);
  const [tripsPerDay, setTripsPerDay] = useState(env.defaultTripsPerDay);
  const [selected, setSelected] = useState<MissedEvent | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Changing driver or conditions re-scores instantly and jumps to the end of the replay.
  const rescore = (fn: () => void) => {
    fn();
    setCursor(END);
    setPlaying(false);
    setSelected(null);
  };

  const sims = useMemo(() => {
    const run = (d: DriverProfileName, regen = true) => simulateTrip(route, { driver: d, condition, regen });
    const trip = run(driver);
    const smooth = run("smooth");
    const aggressive = run("aggressive");
    const conventional = run(driver, false);
    return {
      trip,
      a: analyzeTrip(trip),
      smooth: analyzeTrip(smooth),
      aggressive: analyzeTrip(aggressive),
      conventional: analyzeTrip(conventional),
    };
  }, [driver, condition]);

  const { trip, a } = sims;
  const last = trip.samples.length - 1;
  const segments = useMemo(() => buildSegments(trip.samples), [trip]);
  const contractTrip = useMemo(() => toContractTrip(trip, a, gasPrice), [trip, a, gasPrice]);
  const cursor = Math.min(rawCursor, last);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor((c) => {
        if (c >= last) {
          setPlaying(false);
          return last;
        }
        return Math.min(last, c + 3);
      });
    }, 40);
    return () => clearInterval(id);
  }, [playing, last]);

  const cur = trip.samples[cursor];
  const savings = estimateSavings(a, gasPrice, tripsPerDay);
  const gapDollars = (sims.aggressive.fuelGallons - sims.smooth.fuelGallons) * gasPrice * tripsPerDay * 365;

  const visibleMissed = a.missed.filter((e) => e.t <= cursor);

  return (
    <>
      <header className="header">
        <div className="wordmark">
          <span className={`dot${playing ? " live" : ""}`} />
          Regen<em>Coach</em>
        </div>
        <span className="tag">Simulated data</span>
        <div className="controls">
          <div className="segmented" role="group" aria-label="Driver profile">
            {DRIVERS.map((d) => (
              <button key={d} className={d === driver ? "on" : ""} onClick={() => rescore(() => setDriver(d))}>
                {d}
              </button>
            ))}
          </div>
          <select value={condition} onChange={(e) => rescore(() => setCondition(e.target.value as Condition))} aria-label="Road condition">
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c} · μ {SURFACES[c].mu}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => writeTheme(theme === "dark" ? "bright" : "dark")}>
            {theme === "dark" ? "☀ Bright" : "☾ Dark"}
          </button>
        </div>
      </header>

      <main>
        <section className="section">
          <div className="section-head">
            <span className="label">01 · Map</span>
            <h2>{route.name}</h2>
            <span className="tag">{trip.vehicle}</span>
          </div>
          <div className="grid-map">
            <div className="card map-wrap">
              {env.mapboxToken ? (
                <TripMapClient trip={contractTrip} theme={theme} currentIndex={cursor} />
              ) : (
                <RouteMap
                  theme={theme}
                  segments={segments}
                  stops={stops}
                  missed={visibleMissed}
                  car={[cur.lon, cur.lat]}
                  onSelectMissed={setSelected}
                />
              )}
              <div className="legend">
                <span><i style={{ background: "var(--seg-good)" }} />captured</span>
                <span><i style={{ background: "var(--seg-mid)" }} />partial</span>
                <span><i style={{ background: "var(--seg-bad)" }} />missed</span>
                <span><i style={{ background: "var(--muted)" }} />no braking</span>
              </div>
              {selected && (
                <div className="legend" style={{ top: "auto", bottom: 64, flexDirection: "column", gap: 2 }}>
                  <strong style={{ color: "var(--seg-bad)" }}>{CAUSE_LABEL[selected.cause]}</strong>
                  <span className="mono">t = {selected.t}s · {(selected.lostKwh * 1000).toFixed(0)} Wh to brake heat</span>
                  <button className="btn" style={{ marginTop: 4, padding: "2px 8px" }} onClick={() => setSelected(null)}>close</button>
                </div>
              )}
              <div className="replay">
                <button
                  className="btn primary"
                  onClick={() => {
                    if (cursor >= last) setCursor(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? "❚❚ Pause" : "▶ Replay"}
                </button>
                <input type="range" min={0} max={last} value={cursor} onChange={(e) => setCursor(+e.target.value)} aria-label="Replay position" />
                <span className="mono muted readout" style={{ fontSize: "0.8rem", textAlign: "right" }}>
                  {(cur.speedMs * 2.237).toFixed(0)} mph · {cur.regenKw.toFixed(1)} kW · SOC {((cur.soc ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <ScoreHero a={a} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="label">02 · Analysis</span>
            <h2>Where the energy went</h2>
          </div>
          <AxisCards axes={a.axes} />
          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <Timeline samples={trip.samples} cursor={cursor} />
            <Terminal trip={trip} a={a} cursor={cursor} />
          </div>
          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <SavingsCard
              savings={savings}
              gapDollars={gapDollars}
              gasPrice={gasPrice}
              tripsPerDay={tripsPerDay}
              setGasPrice={setGasPrice}
              setTripsPerDay={setTripsPerDay}
            />
            <CoachTip key={trip.id} a={a} driver={driver} condition={condition} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="label">03 · Compare</span>
            <h2>Same road, three cars</h2>
            <span className="tag">{condition}</span>
          </div>
          <ComparePanel
            cols={[
              { name: `Conventional (${driver})`, a: sims.conventional, gasPrice },
              { name: "Hybrid · smooth", a: sims.smooth, gasPrice },
              { name: "Hybrid · aggressive", a: sims.aggressive, gasPrice },
            ]}
          />
          <p className="muted" style={{ fontSize: "0.75rem", marginTop: "1rem" }}>
            All physics constants, surface friction values and fuel conversions are approximate teaching numbers, not
            official Toyota specs. Route and elevation are synthetic placeholders.
          </p>
        </section>
      </main>
    </>
  );
}
