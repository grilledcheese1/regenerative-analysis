import type { CatalogVehicle, Cents } from "@/contracts";
import { roundCents } from "./loan";

/**
 * Gallons from a city/highway split: combine consumption, never average MPG.
 * Uses the published rating for the exact variant; a hybrid's rating already
 * reflects regen, so modeled regen savings are not added on top.
 */
export function monthlyFuel(vehicle: CatalogVehicle, monthlyMiles: number, cityShare: number, gasCentsPerGallon: number) {
  const gallons = (monthlyMiles * cityShare) / vehicle.cityMpg + (monthlyMiles * (1 - cityShare)) / vehicle.highwayMpg;
  return { gallons, costCents: roundCents(gallons * gasCentsPerGallon) as Cents };
}
