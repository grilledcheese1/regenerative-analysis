"use client";

import { useMemo } from "react";
import type { MissedEvent } from "@/lib/model/score";
import { CAUSE_LABEL, GRADE_VAR, type Segment } from "@/lib/segments";
import { SURFACE_STYLE } from "./ConditionsCard";
import type { SurfaceDetail } from "@/app/api/_lib/types";

export interface SurfaceSegment {
  coords: [number, number][]; // [lon, lat]
  kind: SurfaceDetail;
}

interface RouteSvgProps {
  segments: Segment[];
  stops: [number, number][];
  missed: MissedEvent[];
  car: [number, number];
  onSelectMissed: (e: MissedEvent) => void;
  colorBy?: "regen" | "surface";
  surfaces?: SurfaceSegment[];
  weather?: string; // "wet" | "snow" | "mud" draw a light overlay; anything else draws none
}

const W = 800;
const H = 460;
const PAD = 40;

/** Offline stand-in for the Mapbox map: same route, colors and markers as flat SVG. */
export default function RouteSvg(props: RouteSvgProps) {
  const { segments, stops, missed, car, onSelectMissed, colorBy = "regen", surfaces = [], weather } = props;
  const project = useMemo(() => {
    const all = segments.flatMap((s) => s.coords);
    const lons = all.map((c) => c[0]);
    const lats = all.map((c) => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const scale = Math.min(
      (W - 2 * PAD) / ((maxLon - minLon) * kx),
      (H - 2 * PAD) / (maxLat - minLat),
    );
    const ox = (W - (maxLon - minLon) * kx * scale) / 2;
    const oy = (H - (maxLat - minLat) * scale) / 2;
    return ([lon, lat]: [number, number]): [number, number] => [
      ox + (lon - minLon) * kx * scale,
      H - oy - (lat - minLat) * scale,
    ];
  }, [segments]);

  const toPath = (coords: [number, number][]) =>
    coords.map((c, i) => `${i ? "L" : "M"}${project(c).map((n) => n.toFixed(1)).join(",")}`).join("");

  const [cx, cy] = project(car);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={colorBy === "surface" ? "Route styled by road surface" : "Route colored by regen efficiency"}>
      <defs>
        <pattern id="topo" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 20 Q10 12 20 20 T40 20" fill="none" stroke="var(--grid)" strokeWidth="0.6" />
        </pattern>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <pattern id="wx-wet" width="36" height="36" patternUnits="userSpaceOnUse">
          <line x1="8" y1="2" x2="4" y2="14" stroke="var(--wx-rain)" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="26" y1="18" x2="22" y2="30" stroke="var(--wx-rain)" strokeWidth="1.4" strokeLinecap="round" />
        </pattern>
        <pattern id="wx-snow" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="10" r="2" fill="var(--wx-snow)" />
          <circle cx="28" cy="26" r="1.6" fill="var(--wx-snow)" />
          <circle cx="20" cy="4" r="1.2" fill="var(--wx-snow)" />
        </pattern>
        <pattern id="wx-mud" width="90" height="70" patternUnits="userSpaceOnUse">
          <ellipse cx="25" cy="20" rx="16" ry="5" fill="var(--surf-dirt)" />
          <ellipse cx="68" cy="52" rx="12" ry="4" fill="var(--surf-dirt)" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#topo)" />
      {weather && ["wet", "snow", "mud"].includes(weather) && (
        <rect width={W} height={H} fill={`url(#wx-${weather})`} opacity={weather === "mud" ? 0.2 : 0.45} pointerEvents="none">
          <title>{`Weather overlay: ${weather}`}</title>
        </rect>
      )}
      {colorBy === "surface" ? (
        surfaces.map((s, i) => (
          <path
            key={i}
            d={toPath(s.coords)}
            stroke={SURFACE_STYLE[s.kind].color}
            strokeWidth="5"
            strokeDasharray={SURFACE_STYLE[s.kind].dash}
            strokeLinecap={s.kind === "dirt" ? "round" : "butt"}
            fill="none"
          >
            <title>{SURFACE_STYLE[s.kind].label}</title>
          </path>
        ))
      ) : (
        <>
          <g filter="url(#glow)" opacity="0.55">
            {segments.map((s, i) => (
              <path key={i} d={toPath(s.coords)} stroke={`var(${GRADE_VAR[s.grade]})`} strokeWidth="9" fill="none" />
            ))}
          </g>
          {segments.map((s, i) => (
            <path
              key={i}
              d={toPath(s.coords)}
              stroke={`var(${GRADE_VAR[s.grade]})`}
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </>
      )}
      {stops.map((c, i) => {
        const [x, y] = project(c);
        return <rect key={i} x={x - 4} y={y - 4} width="8" height="8" fill="var(--text-2)" transform={`rotate(45 ${x} ${y})`} />;
      })}
      {missed.map((e, i) => {
        const [x, y] = project([e.lon, e.lat]);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="7"
            fill="none"
            stroke="var(--seg-bad)"
            strokeWidth="2"
            style={{ cursor: "pointer" }}
            onClick={() => onSelectMissed(e)}
          >
            <title>{`${CAUSE_LABEL[e.cause]} · ${(e.lostKwh * 1000).toFixed(0)} Wh lost`}</title>
          </circle>
        );
      })}
      <circle cx={cx} cy={cy} r="10" fill="var(--accent)" opacity="0.25" />
      <circle cx={cx} cy={cy} r="5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
    </svg>
  );
}
