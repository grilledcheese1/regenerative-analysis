// Builds the synthetic sample drives in public/samples/ from the cached Austin routes in
// src/data/routes.json. Deterministic: same input, same files. Run: node scripts/make-sample-drives.mjs
// The outputs are committed; this script is only for regenerating them.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "samples");
const routes = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "routes.json"), "utf8"));
const route = (id) => routes.find((r) => r.id === id);

const DESC = "Synthetic sample generated from a cached Austin route for the Next Move demo. Not a recorded drive.";
const SPEED_FACTOR = 0.85; // of the speed limit
const ACCEL = 1.5; // m/s², pulling away
const BRAKE = 2.0; // m/s², ordinary stop
const LATE_BRAKE = 4.5; // m/s², a late, hard stop
const STOP_S = 20;
const JITTER_M = 2;

// 2026-10-20 in America/Chicago is CDT (UTC−5), written as UTC.
const at = (hh, mm, day = 20) => Date.UTC(2026, 9, day, hh + 5, mm);

// Seeded LCG so the jitter is the same on every run.
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

/** Route points as { s, lat, lon, ele, limit }, optionally reversed and cut at maxS. */
function line(r, { reverse = false, maxS = Infinity } = {}) {
  const len = r.points.at(-1).s;
  let pts = r.points.map((p) => ({ s: p.s, lat: p.lat, lon: p.lon, ele: p.elevationM, limit: p.limitMs }));
  let stops = r.stopsM;
  if (reverse) {
    pts = pts.reverse().map((p) => ({ ...p, s: len - p.s }));
    stops = stops.map((s) => len - s).filter((s) => s > 0).sort((a, b) => a - b);
    stops.push(len);
  }
  pts = pts.filter((p) => p.s <= maxS);
  const end = pts.at(-1).s;
  stops = stops.filter((s) => s <= end);
  if (stops.at(-1) !== end) stops.push(end);
  return { pts, stops, end };
}

function interp(pts, s) {
  let i = 1;
  while (i < pts.length - 1 && pts[i].s < s) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const f = b.s === a.s ? 0 : Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s)));
  return { lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon), ele: a.ele + f * (b.ele - a.ele), limit: a.limit };
}

/** One sample per second: cruise near the limit, stop for STOP_S at every stop, brake at `brakeFor(stopIndex)`. */
function drive({ pts, stops, end }, startMs, { brakeFor = () => BRAKE, factor = SPEED_FACTOR } = {}) {
  const out = [];
  let s = 0;
  let v = 0;
  let t = 0;
  let next = 0;
  while (s < end && t < 4 * 3600) {
    const here = interp(pts, s);
    out.push({ ...here, t: startMs + t * 1000 });
    const stopAt = stops[next];
    const dist = stopAt - s;
    const brake = brakeFor(next);
    if (dist <= Math.max(1, v)) {
      // reach the stop line next second, then wait there
      s = stopAt;
      v = 0;
      next++;
      t++;
      out.push({ ...interp(pts, s), t: startMs + t * 1000 });
      if (s >= end) return out;
      for (let k = 0; k < STOP_S; k++) {
        t++;
        out.push({ ...interp(pts, s), t: startMs + t * 1000 });
      }
      t++;
      continue;
    }
    const target = here.limit * factor;
    const needed = (v * v) / (2 * dist); // deceleration that stops exactly at the line
    if (needed >= brake * 0.95) v = Math.max(0.5, v - needed);
    else v = v < target ? Math.min(target, v + ACCEL) : Math.max(target, v - BRAKE);
    s = Math.min(end, s + v);
    t++;
  }
  return out;
}

/** Slowly drifting position error within ±JITTER_M, like real GPS, so it doesn't zig-zag every second. */
function jitter(points, seed) {
  const rnd = lcg(seed);
  let ex = 0;
  let ey = 0;
  return points.map((p) => {
    ex = Math.max(-JITTER_M, Math.min(JITTER_M, 0.9 * ex + 0.3 * rnd()));
    ey = Math.max(-JITTER_M, Math.min(JITTER_M, 0.9 * ey + 0.3 * rnd()));
    const dLat = ey / 111_320;
    const dLon = ex / (111_320 * Math.cos((p.lat * Math.PI) / 180));
    return { ...p, lat: p.lat + dLat, lon: p.lon + dLon };
  });
}

const iso = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

function gpx(name, segments) {
  const pt = (p) =>
    `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><ele>${p.ele.toFixed(1)}</ele>${p.t !== undefined ? `<time>${iso(p.t)}</time>` : ""}</trkpt>`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Next Move sample generator" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata><name>${name}</name><desc>${DESC}</desc></metadata>`,
    `  <trk>`,
    `    <name>${name}</name>`,
    ...segments.flatMap((seg) => [`    <trkseg>`, ...seg.map(pt), `    </trkseg>`]),
    `  </trk>`,
    `</gpx>`,
    ``,
  ].join("\n");
}

const files = {};

// Maria: the city route there and back.
const city = route("downtown");
files["maria-commute-am.gpx"] = gpx("Maria morning commute (synthetic)", [jitter(drive(line(city), at(7, 45)), 1)]);
files["maria-commute-pm.gpx"] = gpx("Maria evening commute (synthetic)", [jitter(drive(line(city, { reverse: true }), at(16, 45)), 2)]);

// Devon: a short errand on the first 2.5 km of the mixed route.
files["devon-errand.gpx"] = gpx("Devon errand (synthetic)", [jitter(drive(line(route("mixed"), { maxS: 2500 }), at(10, 10)), 3)]);

// Kai: the fastest cached route, driven at the limit, with one late, hard stop after the long fast stretch.
files["kai-highway.gpx"] = gpx(
  "Kai faster roads (synthetic)",
  [jitter(drive(line(route("hills")), at(8, 20), { factor: 1, brakeFor: (i) => (i === 5 ? LATE_BRAKE : BRAKE) }), 4)],
);

// Sparse: every 15th route point and no timestamps at all.
const sparse = route("mixed").points.filter((_, i, a) => i % 15 === 0 || i === a.length - 1);
files["sparse-no-time.gpx"] = gpx(
  "Sparse track, no timestamps (synthetic)",
  [jitter(sparse.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.elevationM })), 5)],
);

// Gap and noise: a 90 s recording gap in the middle, and a burst of same-time points far apart.
{
  const full = jitter(drive(line(route("hills")), at(13, 0)), 6);
  const mid = Math.floor(full.length / 2);
  const before = full.slice(0, mid);
  const after = full.slice(mid + 90);
  const burstAt = Math.floor(before.length / 3);
  const burst = [0, 1, 2].map((k) => ({ ...before[burstAt], lat: before[burstAt].lat + (k + 1) * 0.0004 })); // ~45 m apart, same time
  const noisy = [...before.slice(0, burstAt + 1), ...burst, ...before.slice(burstAt + 1)];
  files["gap-and-noise.gpx"] = gpx("Gap and noisy timestamps (synthetic)", [[...noisy, ...after]]);
}

// Demo files to import by hand (docs/demo/drives/), so they come in as the user's own drives
// rather than built-in samples. Different days, routes and seeds from the samples above.
const demo = {
  "demo-drive-1-commute.gpx": gpx("Weekday commute: Mount Bonnell to Deep Eddy (synthetic)", [jitter(drive(line(route("hills")), at(8, 5, 22)), 11)]),
  "demo-drive-2-errand.gpx": gpx(
    "Evening errand: South Congress to UT Tower (synthetic)",
    [jitter(drive(line(route("mixed"), { reverse: true }), at(18, 20, 23), { factor: 0.9 }), 12)],
  ),
};

const write = (dir, set) => {
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(set)) {
    writeFileSync(path.join(dir, name), body);
    console.log(`${path.relative(ROOT, path.join(dir, name))}: ${(body.match(/<trkpt/g) ?? []).length} points, ${(body.length / 1024).toFixed(0)} KiB`);
  }
};
write(OUT, files);
write(path.join(ROOT, "docs", "demo", "drives"), demo);
