"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TripRecord } from "@/contracts";
import { niceDate } from "@/domain/format";
import RouteSvg from "@/components/RouteSvg";
import FreeTripMapClient from "@/components/map/FreeTripMapClient";
import SegmentCard from "@/components/map/SegmentCard";
import { FREE_MAP_CONFIG } from "@/components/map/config";
import Timeline from "@/components/Timeline";
import { AxisCards, ComparePanel, SavingsCard, ScoreHero, Terminal } from "@/components/Panels";
import { env } from "@/lib/env";
import type { PersonaPhysics } from "@/fixtures/vehicle-physics";
import { SURFACES, type Condition, type DriverProfileName } from "@/lib/model/config";
import { analyzeTrip, estimateSavings, type MissedEvent } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";
import type { DemoRoute } from "@/lib/mock/route";
import { ROUTES, stopCoords } from "@/lib/routes";
import { buildSegments, CAUSE_LABEL } from "@/lib/segments";

const DRIVERS: DriverProfileName[] = ["smooth", "mixed", "aggressive"];
const CONDITIONS = Object.keys(SURFACES) as Condition[];
const END = Number.MAX_SAFE_INTEGER;
const NO_SURFACES: never[] = []; // a stable empty list: a fresh [] each render would reset the route layer

interface DrivesViewProps {
  initialRouteId: string;
  /** Owner's vehicle name; for a gasoline car the replay is framed as a hybrid comparison. */
  vehicleName: string;
  hybrid: boolean;
  /** The car whose weight, drag and regen limits drive the simulation. Omitted, a default Camry Hybrid. */
  physics?: PersonaPhysics;
  /** The person's own driving style; the toggle still lets them try the others. */
  defaultDriver?: DriverProfileName;
  /** The person's confirmed imported drives; each can be replayed like a cached route. */
  userTrips?: TripRecord[];
  /** Open this trip's replay (set when a drive is confirmed or "Replay & analyze" is pressed). */
  focus?: { tripId: string; nonce: number } | null;
}

const TRIP = "trip:";
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const tripLabel = (t: TripRecord) =>
  `Your drive · ${t.summary.startAt ? `${niceDate(t.summary.startAt)}, ${time(t.summary.startAt)}` : "no time recorded"} · ${(t.summary.distanceMeters / 1609.34).toFixed(1)} mi`;

/** Drives screen: a real route with a modeled Camry Hybrid replayed over it. */
export default function DrivesView({ initialRouteId, vehicleName, hybrid, physics, defaultDriver = "mixed", userTrips = [], focus = null }: DrivesViewProps) {
  const vehicle = physics?.replay;
  const [routeId, setRouteId] = useState(initialRouteId);
  // Imported drives are fetched the first time they're opened, then kept.
  const [userRoutes, setUserRoutes] = useState<Record<string, DemoRoute>>({});
  const [loadingTrip, setLoadingTrip] = useState<string | null>(null);
  const [tripError, setTripError] = useState<string | null>(null);
  const userTripId = routeId.startsWith(TRIP) ? routeId.slice(TRIP.length) : null;
  const userTrip = userTripId ? userTrips.find((t) => t.tripId === userTripId) : undefined;
  const route: DemoRoute & { id?: string } = (userTripId && userRoutes[userTripId]) || ROUTES.find((r) => r.id === routeId) || ROUTES[0];
  const top = useRef<HTMLElement>(null);
  const stops = useMemo(() => stopCoords(route), [route]);
  const [driver, setDriver] = useState<DriverProfileName>(defaultDriver);
  const [condition, setCondition] = useState<Condition>("dry");
  const [rawCursor, setCursor] = useState(END);
  const [playing, setPlaying] = useState(false);
  const [gasPrice, setGasPrice] = useState(env.defaultGasPrice);
  const [tripsPerDay, setTripsPerDay] = useState(env.defaultTripsPerDay);
  const [selected, setSelected] = useState<MissedEvent | null>(null);
  const [segment, setSegment] = useState<number | null>(null); // the partial or missed stretch whose regen card is open

  // Changing route, driving style or conditions re-scores instantly and jumps to the end of the replay.
  const rescore = (fn: () => void) => {
    fn();
    setCursor(END);
    setPlaying(false);
    setSelected(null);
    setSegment(null);
  };

  const selectRoute = async (id: string) => {
    if (!id.startsWith(TRIP)) return rescore(() => setRouteId(id));
    const tripId = id.slice(TRIP.length);
    setTripError(null);
    if (!userRoutes[tripId]) {
      setLoadingTrip(tripId);
      try {
        const res = await fetch(`/api/drives/${tripId}/route`);
        if (!res.ok) throw new Error();
        const { route: r } = (await res.json()) as { route: DemoRoute };
        setUserRoutes((m) => ({ ...m, [tripId]: r }));
      } catch {
        setTripError("Couldn't load that drive for replay. Try importing it again.");
        return;
      } finally {
        setLoadingTrip(null);
      }
    }
    rescore(() => setRouteId(id));
  };

  // Open a drive when asked (just confirmed, or "Replay & analyze"), and bring the replay into view.
  const selectRef = useRef(selectRoute);
  useEffect(() => {
    selectRef.current = selectRoute;
  });
  useEffect(() => {
    if (!focus) return;
    void selectRef.current(TRIP + focus.tripId).then(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focus]);

  const sims = useMemo(() => {
    const run = (d: DriverProfileName, regen = true) => simulateTrip(route, { driver: d, condition, regen, vehicle });
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
  }, [route, driver, condition, vehicle]);

  const { trip, a } = sims;
  const last = trip.samples.length - 1;
  const segments = useMemo(() => buildSegments(trip.samples, 6, trip.physics.regenEfficiency), [trip]);
  const cursor = Math.min(rawCursor, last);

  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No auto-animation: jump to the end of the replay instead.
      /* eslint-disable react-hooks/set-state-in-effect */
      setCursor(last);
      setPlaying(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
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
      <section className="section" ref={top}>
        <div className="section-head">
          <span className="label">Drives</span>
          <h2>{userTrip ? tripLabel(userTrip).replace("Your drive · ", "Your drive, ") : route.name}</h2>
          <span className="tag">{userTrip ? "Your route · modeled car" : "Real route · modeled car"}</span>
        </div>
        <p className="notice">
          {userTrip
            ? `Replaying ${hybrid ? `your ${vehicleName}` : `a ${vehicle?.label ?? "Camry Hybrid"}`} over the route you drove${vehicle ? `, modeled at ${Math.round(vehicle.massKg).toLocaleString()} kg with your usual load` : ""}. Speeds follow how fast you went on each stretch and it stops where you stopped; regen figures are modeled, not measured from the car.`
            : hybrid
            ? `Replaying your ${vehicleName} over a real Austin route${vehicle ? `, modeled at ${Math.round(vehicle.massKg).toLocaleString()} kg with your usual load, a drag coefficient of ${vehicle.dragCoefficient} and up to ${vehicle.maxRegenKw} kW of regen` : ""}. Regen figures are modeled from GPS-grade inputs, not measured from the car.`
            : `Your ${vehicleName} is gasoline and recovers no braking energy. This replay models a ${vehicle?.label ?? "Camry Hybrid"} on the same route for comparison${vehicle ? `, at ${Math.round(vehicle.massKg).toLocaleString()} kg with your usual load` : ""}.`}
        </p>
        <div className="toolbar">
          <select id="drive-route" name="drive-route" value={routeId} onChange={(e) => void selectRoute(e.target.value)} aria-label="Route">
            {userTrips.some((t) => t.quality.routeAvailable) && (
              <optgroup label="Your drives">
                {userTrips.filter((t) => t.quality.routeAvailable).map((t) => (
                  <option key={t.tripId} value={TRIP + t.tripId}>
                    {tripLabel(t)}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Austin demo routes">
              {ROUTES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {(r.points[r.points.length - 1].s / 1609.34).toFixed(1)} mi
                </option>
              ))}
            </optgroup>
          </select>
          <div className="segmented" role="group" aria-label="Simulated driving style">
            {DRIVERS.map((d) => (
              <button key={d} className={d === driver ? "on" : ""} onClick={() => rescore(() => setDriver(d))}>
                {d}
              </button>
            ))}
          </div>
          <select id="drive-condition" name="drive-condition" value={condition} onChange={(e) => rescore(() => setCondition(e.target.value as Condition))} aria-label="Road condition">
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c} · μ {SURFACES[c].mu}
              </option>
            ))}
          </select>
        </div>
        {(loadingTrip || tripError) && (
          <p className={tripError ? "excl" : "muted"} role="status">
            {tripError ?? "Loading your drive for replay…"}
          </p>
        )}
        <div className="grid-map">
          <div className="card map-wrap">
            <FreeTripMapClient
              theme="dark"
              segments={segments}
              surfaces={NO_SURFACES}
              colorBy="regen"
              stops={stops}
              missed={visibleMissed}
              car={[cur.lon, cur.lat]}
              ahead={[ahead.lon, ahead.lat]}
              follow={false}
              onSelectMissed={setSelected}
              onSelectSegment={(k) => {
                setSegment(k);
                setPlaying(false);
              }}
              fallback={
                <>
                  <RouteSvg segments={segments} stops={stops} missed={visibleMissed} car={[cur.lon, cur.lat]} onSelectMissed={setSelected} />
                  <p className="muted small">The interactive map needs WebGL, which this browser can&apos;t start. Showing a static route preview.</p>
                </>
              }
            />
            <SegmentCard selected={segment} samples={trip.samples} segments={segments} missed={a.missed} regenEfficiency={trip.physics.regenEfficiency} onClose={() => setSegment(null)} />
            <div className="legend">
              <span><i style={{ background: "var(--map-good)" }} />captured</span>
              <span><i style={{ background: "var(--map-mid)" }} />partial</span>
              <span><i style={{ background: "var(--map-bad)" }} />missed</span>
              <span><i style={{ background: "var(--map-idle)" }} />no braking</span>
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
              <input type="range" id="drive-replay" name="drive-replay" min={0} max={last} value={cursor} onChange={(e) => setCursor(+e.target.value)} aria-label="Replay position" />
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
          <span className="label">Modeled recovery</span>
          <h2>Where the braking energy went</h2>
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
          <ComparePanel
            cols={[
              { name: `Regen off (${driver})`, a: sims.conventional, gasPrice },
              { name: "Hybrid · smooth", a: sims.smooth, gasPrice },
              { name: "Hybrid · aggressive", a: sims.aggressive, gasPrice },
            ]}
          />
        </div>
        <p className="muted" style={{ fontSize: "0.75rem", marginTop: "1rem" }}>
          Modeled recovery comparison, not a measurement or an insurer safety score. &ldquo;Regen off&rdquo; is the same
          hybrid model with recovery disabled, not a full conventional car. Ownership costs use published MPG ratings
          instead, so this replay&apos;s savings are never added on top.{" "}
          {userTrip
            ? "Route, elevation, speeds and stops from your imported GPS file."
            : "Roads and speed limits from Mapbox Directions, elevation from Open-Meteo, signals and stop signs from OpenStreetMap."}
        </p>
      </section>
    </>
  );
}
