import { CATALOG } from "@/fixtures/catalog";
import { Choice, Money, Num } from "../fields";
import s from "../onboarding.module.css";
import type { StepProps } from "./types";

export default function Car({ a, set, errors }: StepProps) {
  const unsure = a.car.estimatedValueCents === null;
  return (
    <>
      <p className={s.kicker}>Your car</p>
      <h1 className={s.title}>Which car do you drive?</h1>
      <p className={s.lede}>Pick the closest match. Fuel economy comes from fueleconomy.gov.</p>
      <div className={s.choices} role="group" aria-label="Car">
        {CATALOG.map((v) => (
          <Choice
            key={v.catalogId}
            pressed={a.car.catalogId === v.catalogId}
            onClick={() => set((x) => ({ ...x, car: { ...x.car, catalogId: v.catalogId } }))}
            title={`${v.modelYear} ${v.model}`}
            sub={`${v.cityMpg} city / ${v.highwayMpg} hwy mpg · ${v.powertrain}`}
          />
        ))}
      </div>
      <div className={s.grid}>
        <Num label="Odometer (miles)" name="odometer" value={a.car.odometerMiles} onValue={(n) => set((x) => ({ ...x, car: { ...x.car, odometerMiles: n } }))} error={errors["car.odometerMiles"]} />
        {unsure ? (
          <div className={s.field}>
            <span>What it&rsquo;s worth</span>
            <span className={s.hint}>Unknown. Selling your car won&rsquo;t be compared.</span>
            <button type="button" className={s.linkBtn} onClick={() => set((x) => ({ ...x, car: { ...x.car, estimatedValueCents: 2000000 } }))}>I know roughly</button>
          </div>
        ) : (
          <Money
            label="What it's worth today"
            name="value"
            cents={a.car.estimatedValueCents!}
            onCents={(c) => set((x) => ({ ...x, car: { ...x.car, estimatedValueCents: c } }))}
            error={errors["car.estimatedValueCents"]}
            hint={<button type="button" className={s.linkBtn} onClick={() => set((x) => ({ ...x, car: { ...x.car, estimatedValueCents: null } }))}>I&rsquo;m not sure</button>}
          />
        )}
      </div>
    </>
  );
}
