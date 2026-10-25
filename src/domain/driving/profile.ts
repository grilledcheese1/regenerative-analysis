import { known, unknown, type DrivingProfile, type QualityFinding, type TripRecord, type WeeklyDriving } from "@/contracts";
import { METERS_PER_MILE } from "./constants";

export function buildDrivingProfile(
  vehicleId: string,
  trips: TripRecord[],
  weekly: WeeklyDriving | null,
  now: Date = new Date(),
): DrivingProfile {
  const findings: QualityFinding[] = [];
  const miles = trips.map((t) => t.summary.distanceMeters / METERS_PER_MILE);
  const avg = miles.length ? miles.reduce((s, m) => s + m, 0) / miles.length : null;

  if (trips.length < 2) {
    findings.push({
      code: "single_trip_only",
      count: trips.length,
      message: "Fewer than two confirmed trips, so we can't call this a recurring journey.",
    });
  }

  let monthlyMiles: DrivingProfile["monthlyMiles"];
  if (!weekly) {
    monthlyMiles = unknown("weekly_driving_unconfirmed");
    findings.push({
      code: "weekly_driving_unconfirmed",
      message: "Confirm how often you drive this before we project monthly miles.",
    });
  } else if (avg === null) {
    monthlyMiles = unknown("no_trips");
  } else {
    monthlyMiles = known(Math.round(monthlyMilesFrom(avg, weekly)));
  }

  // Distance-weighted mean of the trips whose city share is known.
  const withShare = trips.filter((t) => t.summary.cityShare.known);
  const shareM = withShare.reduce((s, t) => s + t.summary.distanceMeters, 0);
  const cityShare =
    shareM > 0
      ? known(withShare.reduce((s, t) => s + (t.summary.cityShare.known ? t.summary.cityShare.value : 0) * t.summary.distanceMeters, 0) / shareM)
      : unknown("speed_unavailable");

  return {
    vehicleId,
    tripCount: trips.length,
    avgTripMiles: avg === null ? unknown("no_trips") : known(avg),
    monthlyMiles,
    cityShare,
    source: weekly ? "user_reported" : "derived",
    findings,
    computedAt: now.toISOString(),
  };
}

/** (avg trip mi × trips/wk × weeks + other mi/wk × weeks) ÷ 12, unrounded. */
export const monthlyMilesFrom = (avgTripMiles: number, w: WeeklyDriving) =>
  (avgTripMiles * w.tripsPerWeek * w.weeksPerYear + w.otherMilesPerWeek * w.weeksPerYear) / 12;
