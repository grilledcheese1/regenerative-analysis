"use client";

import type { Persona } from "@/contracts";
import FreeTripMapClient from "@/components/map/FreeTripMapClient";
import { scoreLabel } from "@/lib/model/score";
import { peerRank } from "@/lib/peers";
import { stopCoords } from "@/lib/routes";
import { useMemo } from "react";
import type { Drive } from "./drive";
import { PeerBar, StaggerItem, StaggerList } from "./motion";
import StorySection from "./StorySection";

/** Slide 2. A simulated replay of the person's route on the keyless map, with their regen score against the others. */
export default function Commute({ persona, drive, hybrid }: { persona: Persona; drive: Drive; hybrid: boolean }) {
  const { route, style, trip, a, segments } = drive;
  const rank = useMemo(() => peerRank(persona.id), [persona.id]);
  const stops = useMemo(() => stopCoords(route), [route]);
  const topMissed = useMemo(() => [...a.missed].sort((x, y) => y.lostKwh - x.lostKwh).slice(0, 10), [a.missed]);
  const end = trip.samples[trip.samples.length - 1];
  const miles = (route.points[route.points.length - 1].s / 1609.34).toFixed(1);

  return (
    <StorySection
      id="commute"
      kicker="Your commute"
      title={`${route.name}, driven ${style}`}
      lede={
        hybrid
          ? "A simulated replay of this route. Regen figures are modeled, not measured from the car."
          : "A simulated replay of this route in a hybrid, for comparison. Your car recovers no braking energy."
      }
      lite
    >
      <div className="story__map">
        <FreeTripMapClient
          theme="dark"
          segments={segments}
          surfaces={[]}
          colorBy="regen"
          stops={stops}
          missed={topMissed}
          car={[end.lon, end.lat]}
          ahead={[end.lon, end.lat]}
          follow={false}
          onSelectMissed={() => {}}
        />
        <div className="story__legend">
          <span><i style={{ background: "var(--seg-good)" }} />captured</span>
          <span><i style={{ background: "var(--seg-mid)" }} />partial</span>
          <span><i style={{ background: "var(--seg-bad)" }} />missed</span>
        </div>
      </div>
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
