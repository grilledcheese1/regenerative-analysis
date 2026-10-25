"use client";

import type { CatalogVehicle, Persona } from "@/contracts";
import { monthlyFuel } from "@/domain/finance/fuel";
import { usd } from "@/domain/format";
import { CATALOG, catalogVehicle } from "@/fixtures/catalog";
import { estimateSavings } from "@/lib/model/score";
import { SAVINGS } from "@/lib/model/config";
import type { Drive } from "./drive";
import { StaggerItem, StaggerList } from "./motion";
import StorySection from "./StorySection";

const TRIPS_PER_DAY = 2;

/** Slide 4. What a hybrid would change on this person's driving: gas, then the brakes and CO2 behind it. */
export default function Value({
  persona,
  vehicle,
  drive,
  gasCents,
  monthlyMiles,
}: {
  persona: Persona;
  vehicle: CatalogVehicle;
  drive: Drive;
  gasCents: number;
  monthlyMiles: number;
}) {
  const cityShare = persona.usage.cityShare;
  const hybrid = vehicle.powertrain === "hybrid"
    ? null
    : persona.scenario.candidates.map((c) => catalogVehicle(c.catalogId)).find((v) => v.powertrain === "hybrid") ?? CATALOG.find((v) => v.powertrain === "hybrid") ?? null;

  if (!hybrid) {
    const sv = estimateSavings(drive.a, gasCents / 100, TRIPS_PER_DAY);
    return (
      <StorySection id="value" kicker="What a hybrid does" title="You already drive one" lede="So the question is how much braking energy your driving keeps.">
        <StaggerList className="stats" inView>
          <StaggerItem className="stat"><b>{usd(Math.round(sv.annualDollars * 100))}</b><span>gas avoided each year by regen on this route (modeled, {TRIPS_PER_DAY} trips a day)</span></StaggerItem>
          <StaggerItem className="stat"><b>{usd(Math.round(sv.leftOnTableDollars * TRIPS_PER_DAY * 365 * 100))}</b><span>more each year if every missed braking moment were captured</span></StaggerItem>
          <StaggerItem className="stat"><b>{Math.round(sv.annualCo2Kg)} kg</b><span>CO2 avoided each year</span></StaggerItem>
        </StaggerList>
        <p className="muted small">Modeled from a simulated drive. Estimates, not measurements.</p>
      </StorySection>
    );
  }

  const now = monthlyFuel(vehicle, monthlyMiles, cityShare, gasCents);
  const then = monthlyFuel(hybrid, monthlyMiles, cityShare, gasCents);
  const saveMonth = now.costCents - then.costCents;
  const gallonsYear = (now.gallons - then.gallons) * 12;
  return (
    <StorySection
      id="value"
      kicker="What a hybrid does"
      title={saveMonth > 0 ? `About ${usd(saveMonth * 12)} a year in gas` : "On this driving, gas savings are small"}
      lede={`${hybrid.modelYear} ${hybrid.model} instead of your ${vehicle.modelYear} ${vehicle.model}, at ${monthlyMiles.toLocaleString()} miles a month.`}
    >
      <StaggerList className="stats" inView>
        <StaggerItem className="stat"><b>{usd(now.costCents)}</b><span>fuel a month now · {vehicle.cityMpg}/{vehicle.highwayMpg} mpg city/hwy</span></StaggerItem>
        <StaggerItem className="stat"><b>{usd(then.costCents)}</b><span>fuel a month as a hybrid · {hybrid.cityMpg}/{hybrid.highwayMpg} mpg</span></StaggerItem>
        <StaggerItem className="stat"><b>{Math.round(Math.max(0, gallonsYear) * SAVINGS.kgCo2PerGallon)} kg</b><span>less CO2 a year ({Math.round(Math.max(0, gallonsYear))} gallons)</span></StaggerItem>
      </StaggerList>
      <p className="muted small">
        Uses fueleconomy.gov ratings for each exact variant and your simulated miles and city share. A hybrid&apos;s rating already includes regen, so it is not counted twice.
        Hills add long downhill stretches that recharge the battery, which is why the commute above matters.
      </p>
    </StorySection>
  );
}
