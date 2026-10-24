// Checks generated files against the shared contract in types/trip.ts and basic invariants.
// Usage: node validate.mjs   (exit code 1 on any failure)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const DRIVER = ["smooth", "aggressive", "mixed"], COND = ["dry", "wet", "snow", "mud"], CAUSE = ["late braking", "low grip", "full battery", "cold battery"];
let bad = 0, checked = 0;
const fail = (f, m) => { bad++; console.error(`FAIL ${f}: ${m}`); };
const num = (x) => typeof x === "number" && Number.isFinite(x);

function checkTrip(file) {
  const t = J(file); checked++;
  const h = t.header, s = t.summary;
  if (typeof h.tripId !== "string" || !DRIVER.includes(h.driver) || !COND.includes(h.condition) || typeof h.regenEnabled !== "boolean" || !num(h.distanceM) || typeof h.vehicle !== "string") fail(file, "bad header");
  if (!num(s.score) || s.score < 0 || s.score > 100) fail(file, "score range");
  for (const k of ["energyRecoveredKwh", "energyCeilingKwh", "heatLossKwh", "gallonsSaved", "dollarsSaved", "co2Kg"]) if (!num(s[k])) fail(file, `summary.${k}`);
  for (const e of s.missedEvents) if (!num(e.t) || !CAUSE.includes(e.cause)) fail(file, "missedEvents");
  if (!t.samples.length) fail(file, "no samples");
  let prev = -1;
  for (const x of t.samples) {
    for (const k of ["t", "lat", "lon", "speed", "elevation", "grade", "brake", "regenKw", "frictionKw"]) if (!num(x[k])) fail(file, `sample.${k} at t=${x.t}`);
    if (x.t <= prev) fail(file, "t not increasing"); prev = x.t;
    if (x.brake < 0 || x.brake > 1) fail(file, "brake range");
    if (x.soc !== undefined && (x.soc < 0 || x.soc > 1)) fail(file, "soc range");
    if (x.missed !== null && !CAUSE.includes(x.missed)) fail(file, `missed ${x.missed}`);
    if (x.regenKw < 0 || x.frictionKw < -1e-6) fail(file, "negative power");
    if (!h.regenEnabled && x.regenKw !== 0) fail(file, "regen while disabled");
  }
}
const idx = J("samples/index.json");
[...idx.userSamples, ...idx.compare].forEach((e) => checkTrip(e.file));
// Users: references resolve and numbers are sane
const vehicles = new Set(J("reference/vehicles.json").vehicles.map((v) => v.id));
const index = J("users/users_index.json");
for (const u of index.summaries) {
  const user = J(`users/${u.userId}.json`), trips = J(`trips/${u.userId}_trips.json`).trips;
  if (!vehicles.has(user.vehicle.vehicleId)) fail(u.userId, "unknown vehicle");
  for (const t of trips) {
    if (!(t.inputs.distanceKm > 0) || t.result.gallons < 0 || t.result.gridKwh < 0) fail(t.tripId, "bad trip numbers");
    if (t.result.regenScore != null && (t.result.regenScore < 0 || t.result.regenScore > 100.01)) fail(t.tripId, "regenScore range");
    const sumMissed = Object.values(t.result.missedKwhByCause).reduce((a, b) => a + b, 0);
    if (Math.abs(t.result.energyCeilingKwh - t.result.regenRecoveredKwh - sumMissed) > 0.01) fail(t.tripId, "missed causes do not add up to ceiling - recovered");
  }
  checked++;
}
if (J("ground_truth/best_car.json").labels.length !== index.summaries.length) fail("ground_truth", "label count");
console.log(`${checked} files/users checked, ${bad} problems`);
process.exit(bad ? 1 : 0);
