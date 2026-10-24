"use client";

import { useEffect, useState } from "react";
import type { Trip } from "@/lib/trip/types";
import type { MapTheme } from "./config";
import ReplayControls from "./ReplayControls";
import TripCharts from "./TripCharts";
import TripMapClient from "./TripMapClient";
import { useTripReplay } from "./useTripReplay";

export interface TripViewProps {
  trip: Trip | null | undefined;
}

/** Map + replay controls + charts sharing one replay index. Drop this into any page layout. */
export default function TripView({ trip }: TripViewProps) {
  const [theme, setTheme] = useState<MapTheme>("dark");
  const [follow, setFollow] = useState(false);
  const replay = useTripReplay(trip?.samples.length ?? 0);

  // Restore the saved theme once on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("regen-theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR
      if (saved === "dark" || saved === "bright") setTheme(saved);
    } catch {}
  }, []);

  // Apply the theme to the document so every CSS variable (including --regen-*) swaps.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("regen-theme", theme);
    } catch {}
  }, [theme]);

  return (
    <div className="trip-view">
      <div className="trip-view__bar">
        <button
          type="button"
          className="btn"
          onClick={() => setTheme(theme === "dark" ? "bright" : "dark")}
          aria-pressed={theme === "bright"}
        >
          {theme === "dark" ? "Bright mode" : "Dark mode"}
        </button>
      </div>
      <TripMapClient trip={trip} theme={theme} currentIndex={replay.currentIndex} follow={follow} />
      <ReplayControls trip={trip} replay={replay} follow={follow} onFollowChange={setFollow} />
      <TripCharts trip={trip} currentIndex={replay.currentIndex} onSeek={replay.setIndex} />
    </div>
  );
}
