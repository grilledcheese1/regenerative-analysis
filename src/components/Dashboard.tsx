"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ConditionsResponse, SurfaceDetail } from "@/app/api/_lib/types";
import ConditionsCard, { SURFACE_STYLE, type ConditionChoice } from "@/components/ConditionsCard";
import type { SurfaceSegment } from "@/components/RouteSvg";
import RouteSvg from "@/components/RouteSvg";
import FreeTripMapClient from "@/components/map/FreeTripMapClient";
import { FREE_MAP_CONFIG } from "@/components/map/config";
import SegmentCard from "@/components/map/SegmentCard";
import Timeline from "@/components/Timeline";
import { AxisCards, CoachTip, ComparePanel, SavingsCard, ScoreHero, Terminal } from "@/components/Panels";
import { env } from "@/lib/env";
import type { DemoRoute } from "@/lib/mock/route";
import realRoute from "../../data/cache/routes/hill.json";
import type { Condition, DriverProfileName } from "@/lib/model/config";
import { analyzeTrip, estimateSavings, type MissedEvent } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";
import { buildSegments, CAUSE_LABEL } from "@/lib/segments";

type Theme = "dark" | "bright";

const DRIVERS: DriverProfileName[] = ["smooth", "mixed", "aggressive"];
const END = Number.MAX_SAFE_INTEGER;
// Real route from Stream 2's pipeline (OSRM roads, Open-Meteo elevation, OpenStreetMap stops and surfaces).
type RealRoute = Omit<DemoRoute, "points"> & {
  routeId: string;
  points: (DemoRoute["points"][number] & { surfaceDetail?: SurfaceDetail })[];
};
const route = realRoute as RealRoute;
const stops = route.stopsM.map((s) => {
  const p = route.points[Math.min(route.points.length - 1, Math.round(s / route.stepM))];
  return [p.lon, p.lat] as [number, number];
});

// Group consecutive route points with the same road surface into map segments, and total the mix.
const surfaceSegments: SurfaceSegment[] = [];
for (const p of route.points) {
  const kind = p.surfaceDetail ?? "unknown";
  const last = surfaceSegments[surfaceSegments.length - 1];
  const c: [number, number] = [p.lon, p.lat];
  if (last?.kind === kind) last.coords.push(c);
  else surfaceSegments.push({ kind, coords: last ? [last.coords[last.coords.length - 1], c] : [c] });
}
const surfaceMix = Object.entries(
  route.points.reduce<Record<string, number>>((acc, p) => {
    const k = p.surfaceDetail ?? "unknown";
    acc[k] = (acc[k] ?? 0) + 1 / route.points.length;
    return acc;
  }, {}),
).sort((x, y) => y[1] - x[1]) as [SurfaceDetail, number][];

const LOCATE_TIMEOUT_MS = 6000;

// Theme is held in memory so every page load starts dark; read it as an external store so SSR matches.
const themeListeners = new Set<() => void>();
let currentTheme: Theme = "dark";
function readTheme(): Theme {
  return currentTheme;
}
function writeTheme(t: Theme) {
  currentTheme = t;
  themeListeners.forEach((l) => l());
}
function subscribeTheme(l: () => void) {
  themeListeners.add(l);
  return () => themeListeners.delete(l);
}

export default function Dashboard() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);
  const [driver, setDriver] = useState<DriverProfileName>("mixed");
  const [choice, setChoice] = useState<ConditionChoice>("auto");
  const [detected, setDetected] = useState<ConditionsResponse | null>(null);
  const [locating, setLocating] = useState(true);
  const [colorBy, setColorBy] = useState<"regen" | "surface">("regen");
  const [followCar, setFollowCar] = useState(true);
  const condition: Condition = choice === "auto" ? (detected?.condition ?? "dry") : choice;
  const [rawCursor, setCursor] = useState(END);
  const [playing, setPlaying] = useState(false);
  const [gasPrice, setGasPrice] = useState(env.defaultGasPrice);
  const [tripsPerDay, setTripsPerDay] = useState(env.defaultTripsPerDay);
  const [selected, setSelected] = useState<MissedEvent | null>(null);
  const [segment, setSegment] = useState<number | null>(null); // the partial or missed stretch whose regen card is open

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Detect the road condition from the weather where the user is. If they decline location
  // (or it times out), the API falls back to the route's own weather.
  useEffect(() => {
    let cancelled = false;
    const load = (q: string) =>
      fetch(`/api/conditions?route=${encodeURIComponent(route.routeId)}${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((c: ConditionsResponse | null) => {
          if (cancelled) return;
          setDetected(c);
          setLocating(false);
        });
    if (!("geolocation" in navigator)) {
      load("");
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(`&lat=${pos.coords.latitude.toFixed(2)}&lon=${pos.coords.longitude.toFixed(2)}`),
        () => load(""),
        { timeout: LOCATE_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
      );
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Changing driver or conditions re-scores instantly and jumps to the end of the replay.
  const rescore = (fn: () => void) => {
    fn();
    setCursor(END);
    setPlaying(false);
    setSelected(null);
    setSegment(null);
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
  const ahead = trip.samples[Math.min(last, cursor + FREE_MAP_CONFIG.camera.lookAheadSamples)];
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
          <button className="btn" onClick={() => writeTheme(theme === "dark" ? "bright" : "dark")}>
            {theme === "dark" ? "☀ Bright" : "☾ Dark"}
          </button>
        </div>
      </header>

      <main>
        <section className="section">
          <div className="section-head">
            <span className="label">Map</span>
            <h2>{route.name}</h2>
            <span className="tag">{trip.vehicle}</span>
          </div>
          <div className="grid-map">
            <div className="card map-wrap">
              <FreeTripMapClient
                theme={theme}
                segments={segments}
                surfaces={surfaceSegments}
                colorBy={colorBy}
                stops={stops}
                missed={visibleMissed}
                car={[cur.lon, cur.lat]}
                ahead={[ahead.lon, ahead.lat]}
                follow={playing && followCar}
                weather={condition}
                onSelectMissed={setSelected}
                onSelectSegment={(k) => {
                  setSegment(k);
                  setPlaying(false);
                }}
                fallback={<RouteSvg segments={segments} stops={stops} missed={visibleMissed} car={[cur.lon, cur.lat]} onSelectMissed={setSelected} />}
              />
              <SegmentCard selected={segment} samples={trip.samples} segments={segments} missed={a.missed} onClose={() => setSegment(null)} />
              <div className="legend">
                <div className="segmented mini" role="group" aria-label="Color the route by">
                  <button className={colorBy === "regen" ? "on" : ""} onClick={() => setColorBy("regen")}>regen</button>
                  <button className={colorBy === "surface" ? "on" : ""} onClick={() => setColorBy("surface")}>surface</button>
                </div>
                {colorBy === "regen" ? (
                  <>
                    <span><i style={{ background: "var(--map-good)" }} />captured</span>
                    <span><i style={{ background: "var(--map-mid)" }} />partial</span>
                    <span><i style={{ background: "var(--map-bad)" }} />missed</span>
                    <span><i style={{ background: "var(--map-idle)" }} />no braking</span>
                  </>
                ) : (
                  surfaceMix.map(([kind]) => (
                    <span key={kind}><i style={{ background: SURFACE_STYLE[kind].color }} />{SURFACE_STYLE[kind].label.toLowerCase()}</span>
                  ))
                )}
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
                <button className="btn" onClick={() => setFollowCar(!followCar)} aria-pressed={followCar}>
                  {followCar ? "Follow car: on" : "Follow car: off"}
                </button>
                <input type="range" min={0} max={last} value={cursor} onChange={(e) => setCursor(+e.target.value)} aria-label="Replay position" />
                <span className="mono muted readout" style={{ fontSize: "0.8rem", textAlign: "right" }}>
                  {(cur.speedMs * 2.237).toFixed(0)} mph · {cur.regenKw.toFixed(1)} kW · SOC {((cur.soc ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <ScoreHero a={a} />
          </div>
          <div id="conditions" style={{ marginTop: "1rem" }}>
            <ConditionsCard
              detected={detected}
              locating={locating}
              choice={choice}
              setChoice={(c) => rescore(() => setChoice(c))}
              condition={condition}
              surfaceMix={surfaceMix}
            />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="label">Analysis</span>
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
            <span className="label">Compare</span>
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
            official Toyota specs. Route, elevation, stops and surfaces come from OSRM, Open-Meteo and OpenStreetMap.
          </p>
        </section>
      </main>
    </>
  );
}
