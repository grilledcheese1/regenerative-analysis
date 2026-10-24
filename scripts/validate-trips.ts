// Validates every generated trip and prints a score table, flagging odd results.
// Run: node scripts/validate-trips.ts        (exits 1 when a trip is invalid)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Trip } from "../src/lib/trip/types";
import { ROOT } from "./lib/cache.ts";

const dir = path.join(ROOT, "data", "trips");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".coach.json") && f !== "sample.json");
const trips = new Map<string, Trip>();
let errors = 0;
const fail = (id: string, msg: string) => {
  errors++;
  console.error(`INVALID ${id}: ${msg}`);
};
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

for (const f of files) {
  const id = f.replace(/\.json$/, "");
  let t: Trip;
  try {
    t = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Trip;
  } catch (e) {
    fail(id, `unreadable JSON (${(e as Error).message})`);
    continue;
  }
  const h = t.header, s = t.summary;
  if (!h || !t.samples || !s) { fail(id, "missing header, samples or summary"); continue; }
  for (const k of ["tripId", "driver", "vehicle", "condition", "regenEnabled", "distanceM"] as const) if (h[k] === undefined) fail(id, `header.${k} missing`);
  if (h.tripId !== id) fail(id, `header.tripId "${h.tripId}" does not match the file name`);
  if (t.samples.length === 0) { fail(id, "no samples"); continue; }
  for (const k of ["score", "energyRecoveredKwh", "energyCeilingKwh", "heatLossKwh", "gallonsSaved", "dollarsSaved", "co2Kg"] as const) {
    if (!finite(s[k])) fail(id, `summary.${k} is not a finite number`);
  }
  if (!Array.isArray(s.missedEvents)) fail(id, "summary.missedEvents missing");
  t.samples.forEach((x, i) => {
    for (const [k, v] of Object.entries(x)) if (typeof v === "number" && !Number.isFinite(v)) fail(id, `sample ${i}.${k} is not finite`);
    if (i > 0 && !(x.t > t.samples[i - 1].t)) fail(id, `t does not increase at sample ${i}`);
    if (x.speed < 0) fail(id, `negative speed at sample ${i}`);
    if (x.regenKw + x.frictionKw < -1e-9) fail(id, `regenKw + frictionKw is negative at sample ${i}`);
    if (Math.abs(x.lat) > 90 || Math.abs(x.lon) > 180) fail(id, `lat/lon out of range at sample ${i}`);
    if (x.brake < 0 || x.brake > 1) fail(id, `brake outside 0..1 at sample ${i}`);
  });
  if (!h.regenEnabled && (s.score !== 0 || s.energyRecoveredKwh !== 0)) fail(id, "baseline trip should have score 0 and no energy recovered");
  trips.set(id, t);
}

// Score table (regen trips only) and oddity checks.
const routes = [...new Set([...trips.keys()].map((k) => k.split("-")[0]))];
const drivers = ["smooth", "mixed", "aggressive"] as const;
const conditions = ["dry", "wet", "snow", "mud"] as const;
const score = (r: string, d: string, c: string) => trips.get(`${r}-${d}-${c}`)?.summary.score;
const warnings: string[] = [];
for (const r of routes) {
  console.log(`\n${r}  (score)`);
  console.log("  " + "driver".padEnd(11) + conditions.map((c) => c.padStart(7)).join(""));
  for (const d of drivers) console.log("  " + d.padEnd(11) + conditions.map((c) => String(score(r, d, c)?.toFixed(1) ?? "-").padStart(7)).join(""));
  for (const c of conditions) {
    const [s, m, a] = [score(r, "smooth", c), score(r, "mixed", c), score(r, "aggressive", c)];
    if (s !== undefined && a !== undefined && a >= s) warnings.push(`${r}/${c}: aggressive (${a}) scores at least as high as smooth (${s})`);
    if (s !== undefined && m !== undefined && m > s) warnings.push(`${r}/${c}: mixed (${m}) scores higher than smooth (${s})`);
  }
  for (const d of drivers) {
    const dry = score(r, d, "dry");
    for (const c of ["wet", "snow", "mud"] as const) {
      const v = score(r, d, c);
      if (dry !== undefined && v !== undefined && v > dry) warnings.push(`${r}/${d}: ${c} (${v}) scores higher than dry (${dry})`);
    }
  }
}
console.log(`\n${trips.size} trips checked, ${errors} errors, ${warnings.length} warnings`);
for (const w of warnings) console.warn(`WARNING ${w}`);
if (trips.size !== 72) console.warn(`WARNING expected 72 trips, found ${trips.size}`);
process.exit(errors > 0 ? 1 : 0);
