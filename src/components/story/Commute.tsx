"use client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Persona } from "@/contracts";
import { REPLAY_CONFIG } from "@/components/map/config";
import FreeTripMapClient from "@/components/map/FreeTripMapClient";
import { scoreLabel } from "@/lib/model/score";
import { peerRank } from "@/lib/peers";
import { stopCoords } from "@/lib/routes";
import { brakeFocus, segmentSamples, summarizeSegment } from "@/lib/segmentTelemetry";
import type { Drive } from "./drive";
import { PeerBar, StaggerItem, StaggerList } from "./motion";
import SegmentPopup from "./SegmentPopup";
import StorySection from "./StorySection";
import { useFullyInView } from "./useFullyInView";
import { useReplay } from "./useReplay";

// Automated test browsers and machines without a GPU get a static note instead of a map that cannot draw.
// Probed once: every probe opens a WebGL context, and browsers drop the oldest ones (the map's own) past about 16.
const noop = () => () => {};
let drawable: boolean | undefined;
function canDrawMap() {
  if (drawable !== undefined) return drawable;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // hand the probe's context straight back
    drawable = !!gl && !navigator.webdriver;
  } catch {
    drawable = false;
  }
  return drawable;
}
const useCanDrawMap = () => useSyncExternalStore(noop, canDrawMap, () => true);

const NO_SURFACES: never[] = []; // a stable empty list: a fresh [] each render would reset the route layer every frame

type DriveParts = Pick<Drive, "trip" | "a" | "segments">;

/**
 * The map and everything that moves with the replay. Kept in its own component so the car's
 * 30 fps updates re-render only this, not the stats and peer bar around it.
 */
function ReplayMap({ drive, stops }: { drive: DriveParts; stops: [number, number][] }) {
  const { trip, a, segments } = drive;
  const samples = trip.samples;
  const topMissed = useMemo(() => [...a.missed].sort((x, y) => y.lostKwh - x.lostKwh).slice(0, 10), [a.missed]);
  const mapBox = useRef<HTMLDivElement>(null);
  const canDraw = useCanDrawMap();
  const reduced = useReducedMotion();
  const seen = useFullyInView(mapBox, REPLAY_CONFIG.fullyInView);
  const replay = useReplay(samples.length, REPLAY_CONFIG.samplesPerSecond, seen && canDraw && !reduced);
  const [selected, setSelected] = useState<number | null>(null);

  // The car sits between two samples; interpolate so it glides instead of hopping once a second
  const at = (i: number): [number, number] => {
    const from = samples[Math.min(Math.floor(i), samples.length - 1)];
    const to = samples[Math.min(Math.floor(i) + 1, samples.length - 1)];
    const f = i - Math.floor(i);
    return [from.lon + (to.lon - from.lon) * f, from.lat + (to.lat - from.lat) * f];
  };
  const car = at(replay.index);
  const ahead = at(Math.min(replay.index + REPLAY_CONFIG.lookAheadSamples, samples.length - 1));
  const focus = replay.playing ? brakeFocus(samples, replay.index, REPLAY_CONFIG.brakeWindowSamples) : 0;

  const summary = useMemo(
    () => (selected === null ? null : summarizeSegment(segmentSamples(samples, selected), a.missed, trip.physics.regenEfficiency)),
    [selected, samples, a.missed, trip.physics.regenEfficiency],
  );
  const { setPaused } = replay;
  const select = useCallback(
    (k: number) => {
      setSelected(k);
      setPaused(true);
    },
    [setPaused],
  );
  const close = useCallback(() => {
    setSelected(null);
    setPaused(false);
  }, [setPaused]);

  return (
    <div className="story__map" ref={mapBox}>
      {canDraw ? (
        <FreeTripMapClient
          theme="dark"
          segments={segments}
          surfaces={NO_SURFACES}
          colorBy="regen"
          stops={stops}
          missed={topMissed}
          car={car}
          ahead={ahead}
          follow={replay.active}
          focus={focus}
          onSelectMissed={noopSelect}
          onSelectSegment={select}
        />
      ) : (
        <div className="story__map-fallback">The interactive map needs WebGL. The route and numbers below are the same.</div>
      )}
      <AnimatePresence>{summary && <SegmentPopup key={selected} summary={summary} grade={segments[selected!].grade} onClose={close} />}</AnimatePresence>
      {canDraw && !reduced && (
        <button className="story__replay" onClick={() => setPaused(!replay.paused)} aria-label={replay.paused ? "Play replay" : "Pause replay"}>
          {replay.paused ? "▶" : "❚❚"}
        </button>
      )}
      <div className="story__legend">
        <span><i style={{ background: "var(--map-good)" }} />captured</span>
        <span><i style={{ background: "var(--map-mid)" }} />partial</span>
        <span><i style={{ background: "var(--map-bad)" }} />missed</span>
      </div>
    </div>
  );
}
const noopSelect = () => {};

/** Slide 2. A simulated replay of the person's route on the keyless map, with their regen score against the others. */
export default function Commute({ persona, drive, hybrid }: { persona: Persona; drive: Drive; hybrid: boolean }) {
  const { route, style, a, physics } = drive;
  const rank = useMemo(() => peerRank(persona.id), [persona.id]);
  const stops = useMemo(() => stopCoords(route), [route]);
  const miles = (route.points[route.points.length - 1].s / 1609.34).toFixed(1);

  return (
    <StorySection
      id="commute"
      kicker="Your commute"
      title={`${route.name}, driven ${style}`}
      lede={
        hybrid
          ? `A simulated replay of this route with a ${physics.replay.label}'s weight, drag and regen limits. Regen figures are modeled, not measured from the car.`
          : `Your ${physics.ownLabel} is gasoline and recovers no braking energy, so this replay models a ${physics.replay.label} on the same route, for comparison.`
      }
      lite
    >
      <ReplayMap drive={drive} stops={stops} />
      <StaggerList className="stats" inView>
        <StaggerItem className="stat">
          <b>{Math.round(a.score)}</b>
          <span>regen score · {scoreLabel(a.score)}</span>
        </StaggerItem>
        <StaggerItem className="stat">
          <b>{miles} mi</b>
          <span>route · {a.missed.length} missed braking moments, worst 10 marked</span>
        </StaggerItem>
        <StaggerItem className="stat">
          <b>{Math.round(a.keptShare * 100)}%</b>
          <span>of braking energy kept, not burned as brake heat</span>
        </StaggerItem>
      </StaggerList>
      <div className="peer">
        <PeerBar others={rank.others} you={rank.score} />
        <p>
          Better than <strong>{rank.betterThanPct}%</strong> of the other {rank.n} simulated drivers (score {rank.score} of 100).
        </p>
      </div>
    </StorySection>
  );
}
