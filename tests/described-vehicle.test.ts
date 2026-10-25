import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogVehicle } from "@/fixtures/catalog";
import { describedVehicle, parseDescription } from "@/fixtures/described-vehicle";
import { PEOPLE } from "@/fixtures/personas";

describe("the car a customer picks is the car shown", () => {
  it.each(PEOPLE.map((p) => [p.id, p.summary, p] as const))("%s: %s", (_id, summary, p) => {
    const d = describedVehicle(p);
    // The label is the car the sign-in list names.
    const parsed = parseDescription(summary);
    if (parsed) expect(d.label).toBe(`${parsed.year} ${parsed.name}`);
    // And its picture exists in public/cars (run scripts/fetch-car-images.mjs for a new one).
    expect(existsSync(`public/cars/${d.imageKey}.png`), `public/cars/${d.imageKey}.png`).toBe(true);
  });

  it("describes the curated customers by their catalog car", () => {
    for (const id of ["maria", "devon", "kai"]) {
      const p = PEOPLE.find((x) => x.id === id)!;
      const c = catalogVehicle(p.vehicle.catalogId);
      expect(describedVehicle(p)).toMatchObject({ label: `${c.modelYear} ${c.model}`, imageKey: c.catalogId, modeledExactly: true });
    }
  });

  it("says when the costs are modeled on a different car", () => {
    const noah = PEOPLE.find((p) => p.id === "user-002")!;
    expect(describedVehicle(noah)).toMatchObject({ label: "2024 Toyota Sienna Hybrid", modeledExactly: false, modeledAs: "2025 RAV4 Hybrid AWD" });
  });
});
