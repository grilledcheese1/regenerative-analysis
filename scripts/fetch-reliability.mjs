// Fetches NHTSA recall and owner-complaint counts for each catalog car into
// src/fixtures/reliability.json. Public API, no key. The app reads the committed file and never
// calls NHTSA at runtime. Run: node scripts/fetch-reliability.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const catalog = readFileSync(path.join(ROOT, "src/fixtures/catalog.ts"), "utf8");
const cars = [...catalog.matchAll(/catalogId: "([^"]+)", make: "Toyota", model: "([^"]+)", modelYear: (\d+)/g)].map(([, catalogId, model, year]) => ({
  catalogId,
  // NHTSA's model names: Camry, Corolla, RAV4 (no trim or powertrain words).
  model: model.replace(/\b(Hybrid|LE|AWD)\b/g, "").trim(),
  year: Number(year),
}));

const count = async (kind, car) => {
  const url = `https://api.nhtsa.gov/${kind}/${kind === "recalls" ? "recallsByVehicle" : "complaintsByVehicle"}?make=toyota&model=${encodeURIComponent(car.model)}&modelYear=${car.year}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    // NHTSA answers "no records" with HTTP 400 and a normal body ({ Count: 0 }), so trust the count, not the status.
    const body = await res.json().catch(() => null);
    const n = body?.Count ?? body?.count;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
};

const retrievedAt = new Date().toISOString();
const out = {};
for (const car of cars) {
  out[car.catalogId] = { catalogId: car.catalogId, nhtsaModel: `${car.year} Toyota ${car.model}`, recalls: await count("recalls", car), complaints: await count("complaints", car), retrievedAt, source: "observed" };
  console.log(`${car.catalogId}: ${out[car.catalogId].recalls} recalls, ${out[car.catalogId].complaints} complaints`);
}
writeFileSync(path.join(ROOT, "src/fixtures/reliability.json"), JSON.stringify({ source: "NHTSA recalls and complaints APIs (api.nhtsa.gov), by make, model and model year", cars: out }, null, 1) + "\n");
