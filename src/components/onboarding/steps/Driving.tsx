"use client";

import ImportDrive from "@/components/next-move/import/ImportDrive";
import type { DrivingProfile } from "@/contracts";
import { catalogVehicle } from "@/fixtures/catalog";
import { Slider } from "../fields";
import s from "../onboarding.module.css";
import type { StepProps } from "./types";

export default function Driving({ a, set, personaId, importing, onImport }: StepProps & { personaId: string; importing: "off" | "saving" | "on"; onImport: () => void }) {
  const v = catalogVehicle(a.car.catalogId);
  const useProfile = (p: DrivingProfile | null) => {
    if (!p) return set((x) => ({ ...x, driving: { ...x.driving, source: "user_reported" } }));
    set((x) => ({
      ...x,
      driving: {
        monthlyMiles: p.monthlyMiles.known ? Math.round(p.monthlyMiles.value) : x.driving.monthlyMiles,
        cityShare: p.cityShare.known ? Math.round(p.cityShare.value * 100) / 100 : x.driving.cityShare,
        source: "observed",
      },
    }));
  };
  return (
    <>
      <p className={s.kicker}>Driving</p>
      <h1 className={s.title}>How much do you drive?</h1>
      <p className={s.lede}>This sets your fuel cost and, for a lease, whether you&rsquo;re on track for your mileage allowance.</p>
      <div className={s.grid}>
        <Slider label="Miles a month" name="miles" min={0} max={3000} step={25} value={a.driving.monthlyMiles} onValue={(n) => set((x) => ({ ...x, driving: { ...x.driving, monthlyMiles: n, source: "user_reported" } }))} format={(n) => `${n.toLocaleString()} mi`} />
        <Slider label="City driving" name="city" min={0} max={100} step={5} value={Math.round(a.driving.cityShare * 100)} onValue={(n) => set((x) => ({ ...x, driving: { ...x.driving, cityShare: n / 100, source: "user_reported" } }))} format={(n) => `${n}% city`} />
      </div>
      {a.driving.source === "observed" && <p className={s.hint}>Using your imported drives.</p>}
      <div style={{ marginTop: "1.5rem" }}>
        {importing === "on" ? (
          <ImportDrive personaId={personaId} vehicleLabel={`${v.modelYear} ${v.model}`} onProfile={useProfile} />
        ) : (
          <button type="button" className="m-btn m-btn--ghost" onClick={onImport} disabled={importing === "saving"}>
            {importing === "saving" ? "Getting ready…" : "Import a drive (optional)"}
          </button>
        )}
      </div>
    </>
  );
}
