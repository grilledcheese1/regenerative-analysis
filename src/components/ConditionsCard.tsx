"use client";

import type { ConditionsResponse, SurfaceDetail } from "@/app/api/_lib/types";
import { SURFACES, type Condition } from "@/lib/model/config";

export type ConditionChoice = "auto" | "dry" | "wet" | "snow" | "mud";
export const CONDITION_CHOICES: ConditionChoice[] = ["auto", "dry", "wet", "snow", "mud"];

export const CONDITION_ICON: Record<string, string> = { dry: "☀", wet: "☂", snow: "❄", mud: "≋" };

const CONDITION_NAME: Record<string, string> = { dry: "Dry", wet: "Wet", snow: "Snow", mud: "Mud" };

// What each condition does to regen, in plain words
const EFFECT: Record<string, { limit: string; note: string }> = {
  dry: { limit: "Full", note: "Plenty of grip, so regen can handle almost every stop." },
  wet: { limit: "Hard stops capped", note: "Wet asphalt cuts grip, so hard stops hit the regen limit sooner." },
  snow: { limit: "Gentle only", note: "Packed snow and a cold battery limit regen to gentle slowing." },
  mud: { limit: "Low", note: "Low grip and high rolling loss: most of the energy never reaches the brakes." },
};

export const SURFACE_STYLE: Record<SurfaceDetail, { label: string; color: string; dash?: string }> = {
  asphalt: { label: "Asphalt", color: "var(--surf-asphalt)" },
  concrete: { label: "Concrete", color: "var(--surf-concrete)" },
  gravel: { label: "Gravel", color: "var(--surf-gravel)", dash: "10 6" },
  dirt: { label: "Dirt", color: "var(--surf-dirt)", dash: "2 7" },
  unknown: { label: "Not tagged", color: "var(--surf-unknown)", dash: "4 6" },
};

interface Props {
  detected: ConditionsResponse | null;
  locating: boolean;
  choice: ConditionChoice;
  setChoice: (c: ConditionChoice) => void;
  condition: Condition;
  surfaceMix: [SurfaceDetail, number][]; // [kind, share 0..1], largest first
}

export default function ConditionsCard({ detected, locating, choice, setChoice, condition, surfaceMix }: Props) {
  const effect = EFFECT[condition] ?? EFFECT.dry;
  const overridden = choice !== "auto";
  const reason = overridden
    ? effect.note
    : locating
      ? "Checking the weather where you are…"
      : detected
        ? `${detected.reason}${detected.source === "location" ? " near you" : ` in ${detected.place}`}.`
        : "Couldn't reach the weather service, so this assumes a dry road.";

  return (
    <div className="card conditions">
      <span className="label">Your road conditions</span>
      <div className="cond-head">
        <span className="cond-icon" aria-hidden="true">{CONDITION_ICON[condition]}</span>
        <span className="cond-name">{CONDITION_NAME[condition]}</span>
        {detected && !overridden && <span className="mono muted">{detected.weather.temperatureC}°C</span>}
      </div>
      <p className="cond-reason">{reason}</p>

      <div className="stat-row">
        <div className="stat">
          <div className="label" style={{ color: "var(--muted)" }}>Tire grip</div>
          <div className="v">μ {SURFACES[condition].mu}</div>
        </div>
        <div className="stat">
          <div className="label" style={{ color: "var(--muted)" }}>Regen limit</div>
          <div className="v">{effect.limit}</div>
        </div>
      </div>

      <div className="cond-override">
        <span className="muted">{overridden ? "Demo override, not your real weather" : "Detected automatically"}</span>
        <div className="segmented" role="group" aria-label="Road condition">
          {CONDITION_CHOICES.map((c) => (
            <button key={c} className={c === choice ? "on" : ""} onClick={() => setChoice(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <span className="label" style={{ marginTop: "1rem" }}>Surface along the route</span>
      <div className="surface-bar" role="img" aria-label="Share of the route on each surface">
        {surfaceMix.map(([kind, share]) => (
          <span key={kind} style={{ flex: share, background: SURFACE_STYLE[kind].color }} title={`${SURFACE_STYLE[kind].label} ${Math.round(share * 100)}%`} />
        ))}
      </div>
      <div className="surface-legend">
        {surfaceMix.map(([kind, share]) => (
          <span key={kind}>
            <svg width="24" height="8" aria-hidden="true">
              <line x1="2" y1="4" x2="22" y2="4" stroke={SURFACE_STYLE[kind].color} strokeWidth="4" strokeDasharray={SURFACE_STYLE[kind].dash} strokeLinecap="round" />
            </svg>
            {SURFACE_STYLE[kind].label} {Math.round(share * 100)}%
          </span>
        ))}
      </div>
      <span className="muted" style={{ fontSize: "0.7rem" }}>
        Weather from Open-Meteo, surfaces from OpenStreetMap. Grip values are estimates.
      </span>
    </div>
  );
}
