// Generates data/trips/sample.json: a simulated hilly drive in west Austin.
// Waypoints are approximate and do not follow real roads exactly.
import { mkdirSync, writeFileSync } from "node:fs";

const N = 120;
const DT = 5; // seconds
const MASS = 1650;
const ETA = 0.65;
const PMAX = 30;

const waypoints = [
  [30.3215, -97.7745], [30.3178, -97.7702], [30.3131, -97.7688], [30.3079, -97.7731],
  [30.3022, -97.7769], [30.2968, -97.7742], [30.2921, -97.7695], [30.2874, -97.7668],
  [30.2831, -97.7704], [30.2788, -97.7751],
];

// keyframes: [sample index, target speed m/s]
const speedKeys = [
  [0, 0], [8, 12], [24, 16], [31, 0], [36, 0], [46, 14], [64, 18], [72, 0], [76, 0],
  [86, 15], [100, 17], [108, 0], [112, 0], [119, 7],
];
// braking windows forced to under-capture regen, with cause
const missedAt = { 29: "late braking", 30: "late braking", 70: "late braking", 71: "late braking", 106: "full battery", 107: "full battery", 52: "low grip" };

const lerp = (a, b, f) => a + (b - a) * f;
function speedAt(i) {
  for (let k = 0; k < speedKeys.length - 1; k++) {
    const [i0, v0] = speedKeys[k];
    const [i1, v1] = speedKeys[k + 1];
    if (i >= i0 && i <= i1) return lerp(v0, v1, (i - i0) / (i1 - i0));
  }
  return 0;
}

const mPerDegLat = 111320;
const mPerDegLon = 111320 * Math.cos((30.3 * Math.PI) / 180);
const segLen = waypoints.slice(1).map(([la, lo], k) => {
  const [pla, plo] = waypoints[k];
  return Math.hypot((la - pla) * mPerDegLat, (lo - plo) * mPerDegLon);
});
const pathLen = segLen.reduce((a, b) => a + b, 0);
function pointAt(d) {
  let rem = Math.min(d, pathLen - 1e-6);
  for (let k = 0; k < segLen.length; k++) {
    if (rem <= segLen[k]) {
      const f = rem / segLen[k];
      return [lerp(waypoints[k][0], waypoints[k + 1][0], f), lerp(waypoints[k][1], waypoints[k + 1][1], f)];
    }
    rem -= segLen[k];
  }
  return waypoints.at(-1);
}

// integrate speed to distance, then scale so the route is fully driven
const speeds = Array.from({ length: N }, (_, i) => speedAt(i));
const cum = [0];
for (let i = 1; i < N; i++) cum.push(cum[i - 1] + ((speeds[i] + speeds[i - 1]) / 2) * DT);
const scale = pathLen / cum.at(-1);

const elevAt = (d) => 185 + 38 * Math.sin(d / 520) + 22 * Math.sin(d / 190 + 1);
const samples = [];
let soc = 0.62;
for (let i = 0; i < N; i++) {
  const d = cum[i] * scale;
  const [lat, lon] = pointAt(d);
  const elevation = elevAt(d);
  const dPrev = i ? cum[i - 1] * scale : d;
  const dist = Math.max(d - dPrev, 0.01);
  const grade = i ? ((elevation - elevAt(dPrev)) / dist) * 100 : 0;
  const speed = speeds[i];
  const decel = i ? Math.max(0, (speeds[i - 1] - speed) / DT) : 0;
  const gradeDecel = Math.max(0, -grade / 100) * 9.81 * 0.25; // downhill: some extra retarding demand
  const demandKw = ((decel + gradeDecel) * MASS * speed) / 1000;
  const braking = decel > 0.25;
  const pb = braking ? demandKw : 0;
  const missed = braking ? (missedAt[i] ?? null) : null;
  let regen = Math.min(ETA * pb, PMAX);
  if (missed) regen *= 0.2;
  const friction = pb - regen;
  soc = Math.min(0.95, Math.max(0.3, soc + (regen * DT) / 3600 / 1.3 * 0.1 - 0.0009));
  samples.push({
    t: i * DT,
    lat: +lat.toFixed(6),
    lon: +lon.toFixed(6),
    speed: +speed.toFixed(2),
    elevation: +elevation.toFixed(1),
    grade: +grade.toFixed(2),
    brake: +Math.min(1, braking ? pb / 40 : 0).toFixed(2),
    regenKw: +regen.toFixed(2),
    frictionKw: +friction.toFixed(2),
    soc: +soc.toFixed(3),
    missed,
  });
}

const energy = samples.reduce((a, s) => a + (s.regenKw * DT) / 3600, 0);
const trip = {
  header: {
    tripId: "sample-001",
    driver: "mixed",
    vehicle: "Camry Hybrid (simulated)",
    condition: "dry",
    regenEnabled: true,
    distanceM: Math.round(pathLen),
  },
  samples,
  summary: { score: 61, energyRecoveredKwh: +energy.toFixed(3) },
};

mkdirSync("data/trips", { recursive: true });
writeFileSync("data/trips/sample.json", JSON.stringify(trip, null, 2) + "\n");
console.log(`wrote ${N} samples, ${Math.round(pathLen)} m, ${energy.toFixed(3)} kWh, ${samples.filter((s) => s.missed).length} missed`);
