import { describe, expect, it } from "vitest";
import { splitBraking } from "@/lib/model/braking";

describe("braking split", () => {
  it("matches the spec example: 20 kW demand, 15 motor, 20 grip, 8 battery, η 0.8", () => {
    const s = splitBraking(20, 15, 20, 8, 0.8);
    expect(s.mechanicalRegenKw).toBeCloseTo(10);
    expect(s.capturedKw).toBeCloseTo(8);
    expect(s.frictionKw).toBeCloseTo(10);
    expect(s.conversionLossKw).toBeCloseTo(2);
    expect(s.limit).toBe("battery");
    expect((s.capturedKw * 10) / 3600).toBeCloseTo(0.02222, 5); // kWh over ten seconds
  });

  it("balances: captured + friction + loss = demand", () => {
    for (const [d, m, g, b, e] of [[5, 30, 40, 30, 0.65], [50, 46, 20, 30, 0.65], [12, 10, 9, 2, 0.9]]) {
      const s = splitBraking(d, m, g, b, e);
      expect(s.capturedKw + s.frictionKw + s.conversionLossKw).toBeCloseTo(d);
    }
  });

  it("a full battery captures nothing", () => {
    const s = splitBraking(20, 15, 20, 0, 0.8);
    expect(s.capturedKw).toBe(0);
    expect(s.frictionKw).toBe(20);
  });

  it("rejects an efficiency outside (0, 1]", () => {
    expect(() => splitBraking(10, 10, 10, 10, 1.2)).toThrow();
  });
});
