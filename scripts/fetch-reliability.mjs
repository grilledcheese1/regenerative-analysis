// Fetches NHTSA recall and owner-complaint counts for each catalog car into
// src/fixtures/reliability.json. Public API, no key. The app reads the committed file and never
// calls NHTSA at runtime. Run: node scripts/fetch-reliability.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const catalog = readFileSync(path.join(ROOT, "src/fixtures/catalog.ts"), "utf8");
const cars = [...catalog.matchAll(/catalogId: "([^"]+)", make: "Toyota", model: "([^"]+)", modelYear: (\d+), trim: "[^"]*", powertrain: "(\w+)"/g)].map(
  ([, catalogId, model, year, powertrain]) => ({ catalogId, base: model.split(" ")[0].toUpperCase(), hybrid: powertrain === "hybrid", year: Number(year) }),
);

const get = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return await res.json(); // NHTSA answers "no records" with HTTP 400 and a normal body, so read it either way
  } catch {
    return null;
  }
};

// NHTSA's exact model names differ by year ("CAMRY HYBRID" in 2025, only "CAMRY" in 2024), so look them up
// instead of guessing. A model name that isn't listed is "no data" (null), never a clean record (0).
async function modelName(car, issueType) {
  const body = await get(`https://api.nhtsa.gov/products/vehicle/models?modelYear=${car.year}&make=toyota&issueType=${issueType}`);
  const names = new Set((body?.results ?? []).map((r) => r.model));
  if (car.hybrid && names.has(`${car.base} HYBRID`)) return `${car.base} HYBRID`;
  return names.has(car.base) ? car.base : null;
}

async function count(kind, car) {
  const name = await modelName(car, kind === "recalls" ? "r" : "c");
  if (!name) return { name: null, n: null };
  const endpoint = kind === "recalls" ? "recalls/recallsByVehicle" : "complaints/complaintsByVehicle";
  const body = await get(`https://api.nhtsa.gov/${endpoint}?make=toyota&model=${encodeURIComponent(name)}&modelYear=${car.year}`);
  const n = body?.Count ?? body?.count;
  return { name, n: typeof n === "number" ? n : null };
}

const retrievedAt = new Date().toISOString();
const out = {};
for (const car of cars) {
  const recalls = await count("recalls", car);
  const complaints = await count("complaints", car);
  const name = complaints.name ?? recalls.name ?? car.base;
  out[car.catalogId] = { catalogId: car.catalogId, nhtsaModel: `${car.year} Toyota ${name}`, recalls: recalls.n, complaints: complaints.n, retrievedAt, source: "observed" };
  console.log(`${car.catalogId} → ${name}: ${recalls.n} recalls, ${complaints.n} complaints`);
}
writeFileSync(
  path.join(ROOT, "src/fixtures/reliability.json"),
  JSON.stringify({ source: "NHTSA recalls and complaints APIs (api.nhtsa.gov), by make, exact model name and model year", cars: out }, null, 1) + "\n",
);
