// Self-check for the physics engine. Run: npm run check:physics   (node's built-in TS support, no deps)
import assert from "node:assert/strict";
import { CONFIG } from "../../config/regen.config.ts";
import type { Condition, Driver, Trip } from "../trip/types";
import { buildHillRoute } from "./fixtures/hillRoute.ts";
import { simulateTrip } from "./index.ts";
import { runSimulation } from "./simulate.ts";

const route = buildHillRoute();
const DRIVERS: Driver[] = ["smooth", "mixed", "aggressive"];
const CONDITIONS: Condition[] = ["dry", "wet", "mud", "snow"];

const trips = new Map<string, Trip>();
for (const d of DRIVERS) {
  for (const c of CONDITIONS) {
    trips.set(`${d}/${c}`, simulateTrip({ route, driver: d, condition: c, regenEnabled: true }));
  }
}
const score = (d: Driver, c: Condition) => trips.get(`${d}/${c}`)!.summary.score;

// Score table
console.log("\nScore by driver and condition (hill fixture)");
console.log(["driver".padEnd(12), ...CONDITIONS.map((c) => c.padStart(7))].join(" "));
for (const d of DRIVERS) {
  console.log([d.padEnd(12), ...CONDITIONS.map((c) => score(d, c).toFixed(1).padStart(7))].join(" "));
}
const sample = trips.get("mixed/dry")!;
console.log(
  `\nmixed/dry: ${sample.samples.length} s, ${sample.header.distanceM} m, ` +
    `${sample.summary.energyRecoveredKwh.toFixed(3)} kWh of ${(sample.summary.energyCeilingKwh ?? 0).toFixed(3)} kWh ceiling, ` +
    `${sample.summary.missedEvents?.length ?? 0} missed events`,
);

// Driver separation (dry)
assert.ok(score("smooth", "dry") - score("mixed", "dry") >= 10, "smooth should beat mixed by 10+");
assert.ok(score("mixed", "dry") - score("aggressive", "dry") >= 10, "mixed should beat aggressive by 10+");
// Worse conditions lower the aggressive score
assert.ok(score("aggressive", "dry") - score("aggressive", "wet") >= 5, "wet should cost aggressive 5+ points");

for (const [name, trip] of trips) {
  const { samples } = trip;
  assert.ok(samples.length > 0, `${name}: has samples`);
  // invariants
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    assert.ok(s.speed >= 0, `${name}: speed >= 0 at ${i}`);
    assert.ok(s.regenKw <= CONFIG.regen.maxPowerKw + 1e-9, `${name}: regen within P_max at ${i}`);
    assert.ok(s.regenKw >= 0 && s.frictionKw >= -1e-9, `${name}: non-negative power at ${i}`);
    if (i > 0) assert.ok(s.t > samples[i - 1].t, `${name}: t increasing at ${i}`);
  }
  // summary matches the samples
  const dt = CONFIG.controller.dtS;
  const regenKwh = (CONFIG.regen.efficiency * samples.reduce((a, s) => a + s.regenKw, 0) * dt) / 3600;
  const heatKwh = (samples.reduce((a, s) => a + s.frictionKw, 0) * dt) / 3600;
  assert.ok(Math.abs(trip.summary.energyRecoveredKwh - regenKwh) < 1e-9, `${name}: recovered energy matches`);
  assert.ok(Math.abs((trip.summary.heatLossKwh ?? 0) - heatKwh) < 1e-9, `${name}: heat loss matches`);
}

// regen + friction equals braking power demanded, in every sample
for (const c of CONDITIONS) {
  for (const d of DRIVERS) {
    const { samples, demandKw } = runSimulation({ route, driver: d, condition: c, regenEnabled: true });
    samples.forEach((s, i) => {
      assert.ok(Math.abs(s.regenKw + s.frictionKw - demandKw[i]) < 1e-9, `${d}/${c}: split sums to demand at ${i}`);
    });
  }
}

// Regen disabled: conventional-car baseline
for (const d of DRIVERS) {
  const base = simulateTrip({ route, driver: d, condition: "dry", regenEnabled: false });
  assert.ok(base.samples.every((s) => s.regenKw === 0 && s.missed === null), `${d}: baseline has no regen`);
  assert.equal(base.summary.score, 0);
  assert.equal(base.summary.energyRecoveredKwh, 0);
  assert.equal(base.summary.dollarsSaved, 0);
  assert.ok(base.samples.some((s) => s.frictionKw > 0), `${d}: baseline brakes with friction`);
}

// Degenerate routes do not crash
for (const r of [[], route.slice(0, 1)]) {
  const t = simulateTrip({ route: r, driver: "mixed", condition: "dry", regenEnabled: true });
  assert.equal(t.samples.length, 0);
  assert.equal(t.summary.score, 0);
}

console.log("\nselfcheck: all assertions passed");
