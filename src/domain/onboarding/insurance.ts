import type { SimulatedPolicy } from "@/contracts";
import { catalogVehicle } from "@/fixtures/catalog";
import { DEMO_AS_OF } from "@/fixtures/personas";

/** A made-up "Toyota Insurance" policy for the simulated connect step. Deterministic; not a quote. */
export function simulatedToyotaPolicy(catalogId: string, modelYear: number, odometerMiles: number): SimulatedPolicy {
  const v = catalogVehicle(catalogId);
  const age = Number(DEMO_AS_OF.slice(0, 4)) - modelYear;
  let dollars = 130;
  if (/RAV4/.test(v.model)) dollars += 25;
  if (v.powertrain === "hybrid") dollars -= 10;
  if (age <= 2) dollars += 15;
  if (age >= 10) dollars -= 15;
  let h = 2166136261;
  for (const ch of `${catalogId}|${modelYear}|${odometerMiles}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return {
    provider: "Toyota Insurance (simulated)",
    policyNumber: `SIM-${String(h % 1_000_000).padStart(6, "0")}`,
    coverage: "Full coverage · $500 deductible",
    monthlyCents: dollars * 100,
  };
}
