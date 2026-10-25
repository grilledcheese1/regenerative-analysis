"use client";

import { useState } from "react";
import { simulatedToyotaPolicy } from "@/domain/onboarding/insurance";
import { catalogVehicle } from "@/fixtures/catalog";
import { fmtUsd, Money } from "../fields";
import s from "../onboarding.module.css";
import type { StepProps } from "./types";

export default function Insurance({ a, set, errors }: StepProps) {
  const [connecting, setConnecting] = useState(false);
  const policy = a.insurance.policy;
  const connect = () => {
    setConnecting(true);
    const v = catalogVehicle(a.car.catalogId);
    const p = simulatedToyotaPolicy(v.catalogId, v.modelYear, a.car.odometerMiles);
    // A short pause so the simulated connection reads as one.
    setTimeout(() => {
      set((x) => ({ ...x, insurance: { monthlyCents: p.monthlyCents, source: "synthetic", policy: p } }));
      setConnecting(false);
    }, 1200);
  };
  return (
    <>
      <p className={s.kicker}>Insurance</p>
      <h1 className={s.title}>What do you pay to insure it?</h1>
      <p className={s.lede}>Connect a Toyota Insurance policy or type in your premium. The connection is simulated: no real insurer is contacted.</p>
      <div className={s.grid}>
        <div className={s.card}>
          <span className={`${s.badge} ${s.badgeSoft}`}>Simulated</span>
          <strong>Toyota Insurance (simulated)</strong>
          {policy ? (
            <>
              <span className={s.big}>{fmtUsd(policy.monthlyCents)}<span className={s.hint}>/mo</span></span>
              <span className={s.hint}>Policy {policy.policyNumber} · {policy.coverage}</span>
              <span className={s.badge}>Connected · SIMULATED</span>
            </>
          ) : (
            <button type="button" className="m-btn m-btn--primary" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Toyota Insurance (simulated)"}
            </button>
          )}
        </div>
        <div className={s.card}>
          <strong>Or enter it yourself</strong>
          <Money
            label="Monthly premium"
            name="premium"
            cents={a.insurance.monthlyCents}
            onCents={(c) => set((x) => ({ ...x, insurance: { monthlyCents: c, source: "user_reported", policy: null } }))}
            error={errors["insurance.monthlyCents"]}
          />
        </div>
      </div>
    </>
  );
}
