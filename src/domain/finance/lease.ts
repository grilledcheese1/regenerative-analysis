import type { Cents } from "@/contracts";
import { roundCents } from "./loan";

/** Simplified synthetic lease payment, before taxes and fees. Not an offer. */
export function leasePayment(adjustedCapCostCents: Cents, residualCents: Cents, termMonths: number, moneyFactor: number): Cents {
  const depreciation = (adjustedCapCostCents - residualCents) / termMonths;
  const rent = (adjustedCapCostCents + residualCents) * moneyFactor;
  return roundCents(depreciation + rent);
}

export interface MileageProjection {
  projectedEndMiles: number;
  excessMiles: number;
  overageCents: Cents;
}

export function projectLeaseMileage(
  currentOdometerMiles: number,
  expectedRemainingMiles: number,
  totalAllowedMiles: number,
  excessCentsPerMile: number,
): MileageProjection {
  const projectedEndMiles = currentOdometerMiles + expectedRemainingMiles;
  const excessMiles = Math.max(0, projectedEndMiles - totalAllowedMiles);
  return { projectedEndMiles, excessMiles, overageCents: excessMiles * excessCentsPerMile };
}

/** Whole months from one ISO date to another, never negative. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return Math.max(0, b.getUTCDate() < a.getUTCDate() ? m - 1 : m);
}
