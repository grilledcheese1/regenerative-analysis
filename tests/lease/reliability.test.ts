import { describe, expect, it } from "vitest";
import { moreReliable, reliabilityFor } from "@/domain/reliability";
import { CATALOG } from "@/fixtures/catalog";

describe("NHTSA reliability", () => {
  it("has a dated entry for every catalog car", () => {
    for (const c of CATALOG) {
      const r = reliabilityFor(c.catalogId);
      expect(r.catalogId).toBe(c.catalogId);
      expect(r.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(r.source).toBe("observed");
    }
  });

  it("reports unknown cars as no data", () => {
    expect(reliabilityFor("nope")).toMatchObject({ recalls: null, complaints: null });
  });

  it("prefers fewer complaints, then fewer recalls, and won't judge missing data", () => {
    const base = { catalogId: "x", retrievedAt: "2026-10-25", source: "observed" as const };
    expect(moreReliable({ ...base, recalls: 3, complaints: 10 }, { ...base, recalls: 0, complaints: 20 })).toBe(-1);
    expect(moreReliable({ ...base, recalls: 2, complaints: 10 }, { ...base, recalls: 1, complaints: 10 })).toBe(1);
    expect(moreReliable({ ...base, recalls: 1, complaints: 10 }, { ...base, recalls: 1, complaints: 10 })).toBe(0);
    expect(moreReliable({ ...base, recalls: null, complaints: null }, { ...base, recalls: 1, complaints: 10 })).toBe(0);
  });
});
