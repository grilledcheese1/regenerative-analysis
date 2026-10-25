"use client";

import { useState } from "react";
import type { DrivingProfile, TripRecord, WeeklyDriving } from "@/contracts";
import { DEFAULT_WEEKS_PER_YEAR } from "@/domain/driving/constants";
import { buildDrivingProfile } from "@/domain/driving/profile";
import { SourceChip } from "../Evidence";
import styles from "./ImportDrive.module.css";

const fmt1 = (n: number) => n.toFixed(1);
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

/** Which miles the comparison is using: from the imported drives, or the person's own estimate. */
export interface UsageStatus {
  fromDrives: boolean;
  monthlyMiles: number;
  estimateMiles: number;
}

/** Weekly pattern the user confirms; with the confirmed trips it becomes the driving profile. */
export default function WeeklyForm({
  vehicleId,
  trips,
  usage,
  onUse,
  onRevert,
}: {
  vehicleId: string;
  trips: TripRecord[];
  usage?: UsageStatus;
  onUse: (p: DrivingProfile) => void;
  onRevert: () => void;
}) {
  const [weekly, setWeekly] = useState<WeeklyDriving>({ tripsPerWeek: 10, otherMilesPerWeek: 0, weeksPerYear: DEFAULT_WEEKS_PER_YEAR });
  const profile = buildDrivingProfile(vehicleId, trips, weekly);
  const set = (k: keyof WeeklyDriving, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setWeekly((w) => ({ ...w, [k]: clamp(e.target.valueAsNumber, 0, max) }));

  const avg = profile.avgTripMiles;
  const monthly = profile.monthlyMiles;
  const single = trips.length < 2;

  return (
    <div className={styles.weekly}>
      <h3 className={styles.h3}>How often do you drive this?</h3>
      <div className={styles.fields}>
        <label>
          <span className="muted">Trips per week</span>
          <input type="number" min={0} max={50} step={1} value={weekly.tripsPerWeek} onChange={set("tripsPerWeek", 50)} />
        </label>
        <label>
          <span className="muted">Other miles per week</span>
          <input type="number" min={0} max={2000} step={1} value={weekly.otherMilesPerWeek} onChange={set("otherMilesPerWeek", 2000)} />
        </label>
        <label>
          <span className="muted">Weeks per year</span>
          <input type="number" min={1} max={52} step={1} value={weekly.weeksPerYear} onChange={set("weeksPerYear", 52)} />
        </label>
      </div>

      {avg.known && monthly.known ? (
        <p className={styles.formula}>
          <span className="mono">
            avg {fmt1(avg.value)} mi × {weekly.tripsPerWeek} trips × {weekly.weeksPerYear} wk + {weekly.otherMilesPerWeek} mi × {weekly.weeksPerYear} wk ÷ 12 ={" "}
            <strong data-testid="profile-monthly-miles">{monthly.value.toLocaleString()}</strong> mi/mo
          </span>{" "}
          <SourceChip source={profile.source} />
        </p>
      ) : (
        <p className="muted small">Confirm at least one trip to project monthly miles.</p>
      )}
      {profile.cityShare.known && (
        <p className="small">
          City driving {Math.round(profile.cityShare.value * 100)}% of distance <SourceChip source="modeled" />
        </p>
      )}
      {single && trips.length === 1 && <p className="muted small">Based on one trip. Add another to check this is a regular drive.</p>}

      <div className={styles.actions}>
        <button className="btn primary" disabled={!monthly.known} onClick={() => onUse(profile)}>
          Use for comparison
        </button>
        <button className="btn" disabled={usage ? !usage.fromDrives : false} onClick={onRevert}>
          Use my estimate instead
        </button>
      </div>
      {usage && (
        <p className={`${styles.usage}${usage.fromDrives ? ` ${styles.usageOn}` : ""}`} data-testid="usage-status" role="status">
          {usage.fromDrives
            ? `Your comparison now uses ${usage.monthlyMiles.toLocaleString()} mi/mo from your drives.`
            : `Your comparison uses your estimate of ${usage.estimateMiles.toLocaleString()} mi/mo.`}
        </p>
      )}
    </div>
  );
}
