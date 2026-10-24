import type { TripSample } from "@/lib/trip/types";
import { TRIP_CONFIG } from "./config";

export type CaptureBand = "good" | "mid" | "bad" | "neutral";

/** Share of braking power recovered by regen, or null when the sample is not braking. */
export function captureRatio(s: TripSample): number | null {
  const total = s.regenKw + s.frictionKw;
  if (total <= 0) return null;
  return s.regenKw / total;
}

export function captureBand(s: TripSample): CaptureBand {
  const c = captureRatio(s);
  if (c === null) return "neutral";
  if (c >= TRIP_CONFIG.capture.good) return "good";
  if (c >= TRIP_CONFIG.capture.mid) return "mid";
  return "bad";
}

const VAR: Record<CaptureBand, string> = {
  good: "--regen-good",
  mid: "--regen-mid",
  bad: "--regen-bad",
  neutral: "--regen-neutral",
};

/** Resolves the theme's CSS variable to a concrete color (Mapbox cannot read var()). */
export function bandColor(band: CaptureBand, root: HTMLElement = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(VAR[band]).trim() || "#6f787d";
}
