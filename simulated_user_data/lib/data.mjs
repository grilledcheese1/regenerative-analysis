// Loads the hand-edited reference files.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const surf = read("reference/surfaces.json");
export const SURF = { ...surf.surfaces, ...surf.details };
export const K = read("reference/constants.json");
export const DRIVERS = read("reference/driver_profiles.json").profiles;
export const ROADS = read("reference/road_types.json").roadTypes;
export const REG = read("reference/regions.json");
export const REGIONS = REG.regions;
export const SEED_VEHICLES = read("reference/vehicles.seed.json").vehicles;
export const DEPR = read("reference/depreciation.json").classes;
export const INCENT = read("reference/incentives.json");
export const STATIONS = read("reference/stations.json");
