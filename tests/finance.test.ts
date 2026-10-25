import { describe, expect, it } from "vitest";
import { leasePayment, monthsBetween, projectLeaseMileage } from "@/domain/finance/lease";
import { amortize, loanPayment } from "@/domain/finance/loan";
import { monthlyFuel } from "@/domain/finance/fuel";
import { catalogVehicle } from "@/fixtures/catalog";

// Expected values are the worked examples in the Calculation and Data Specification.

describe("loan", () => {
  it("zero APR: $12,000 over 24 months is $500", () => {
    expect(loanPayment(1200000, 0, 24)).toBe(50000);
  });

  it("$20,000 at 6% for 60 months matches the reference schedule", () => {
    const s = amortize(2000000, 600, 60, 36);
    expect(s.paymentCents).toBe(38666);
    expect(s.paidCents).toBe(1391976);
    expect(s.balanceCents).toBe(872393);
    expect(s.interestCents).toBe(264369);
  });

  it("clears the balance at the end of the term", () => {
    expect(amortize(2000000, 600, 60, 60).balanceCents).toBe(0);
  });

  it("a longer term lowers the payment but keeps more debt at the horizon", () => {
    const short = amortize(2000000, 600, 60, 36);
    const long = amortize(2000000, 600, 72, 36);
    expect(long.paymentCents).toBeLessThan(short.paymentCents);
    expect(long.balanceCents).toBeGreaterThan(short.balanceCents);
  });
});

describe("lease", () => {
  it("$30,000 cap, $18,000 residual, 36 months, MF 0.002 is $429.33", () => {
    expect(leasePayment(3000000, 1800000, 36, 0.002)).toBe(42933);
  });

  it("34,600 + 3,500 miles against 36,000 at 15¢ is a $315 possible charge", () => {
    const m = projectLeaseMileage(34600, 3500, 36000, 15);
    expect(m).toEqual({ projectedEndMiles: 38100, excessMiles: 2100, overageCents: 31500 });
    expect(m.overageCents / 4).toBe(7875); // $78.75 reserved monthly over four months
  });

  it("counts whole months to maturity", () => {
    expect(monthsBetween("2026-10-24", "2027-02-24")).toBe(4);
    expect(monthsBetween("2026-10-25", "2027-02-24")).toBe(3);
  });
});

describe("fuel", () => {
  it("combines consumption by city/highway share instead of averaging MPG", () => {
    const corolla = catalogVehicle("corolla_2016"); // 28 city / 36 hwy
    const f = monthlyFuel(corolla, 1000, 0.5, 300);
    expect(f.gallons).toBeCloseTo(500 / 28 + 500 / 36, 6);
    expect(f.gallons).not.toBeCloseTo(1000 / 32, 2);
  });
});
