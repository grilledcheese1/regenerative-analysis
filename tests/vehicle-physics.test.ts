import { describe, expect, it } from "vitest";
import { PEOPLE } from "@/fixtures/personas";
import { physicsFor } from "@/fixtures/vehicle-physics";
import { DEFAULT_PHYSICS, type DriverProfileName } from "@/lib/model/config";
import { analyzeTrip } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";
import { ROUTES } from "@/lib/routes";
import { buildSegments } from "@/lib/segments";

const HILLS = ROUTES.find((r) => r.id === "hills")!; // Mount Bonnell to Deep Eddy
const run = (personaId: string, driver: DriverProfileName = "mixed") => {
  const { replay } = physicsFor(personaId);
  const trip = simulateTrip(HILLS, { driver, condition: "dry", regen: true, vehicle: replay });
  return { trip, a: analyzeTrip(trip) };
};

describe("each person's own car drives their telemetry", () => {
  it("has physics for every person, and a regen-capable replay car", () => {
    for (const p of PEOPLE) {
      const phys = physicsFor(p.id);
      expect(phys.replay.regenCapable, p.id).toBe(true);
      expect(phys.replay.massKg, p.id).toBeGreaterThan(1000);
      expect(phys.replay).not.toBe(DEFAULT_PHYSICS);
    }
  });

  it("models a gasoline owner's replay on a hybrid counterpart, and a hybrid owner's on their own car", () => {
    expect(physicsFor("user-003")).toMatchObject({ ownLabel: "Toyota 4Runner", ownRegen: false });
    expect(physicsFor("user-003").replay.label).toBe("Toyota Highlander Hybrid");
    expect(physicsFor("user-002")).toMatchObject({ ownLabel: "Toyota Sienna Hybrid", ownRegen: true });
    expect(physicsFor("user-002").replay.label).toBe("Toyota Sienna Hybrid");
    expect(physicsFor("devon").ownRegen).toBe(false); // Devon's 2016 Corolla
    expect(physicsFor("maria").ownRegen).toBe(true);
  });

  it("adds the person's usual load to the car's weight", () => {
    // Noah carries about 350 kg on top of a 2,100 kg Sienna.
    expect(physicsFor("user-002").replay.massKg).toBe(2450);
  });

  it("gives different telemetry for different cars on the same real route", () => {
    const sienna = run("user-002");
    const corollaHybrid = run("user-013"); // a Corolla owner is replayed on the Corolla Hybrid
    const bolt = run("user-024");
    expect(sienna.a.availableKwh).toBeGreaterThan(corollaHybrid.a.availableKwh); // a heavier car has more energy to recover
    expect(sienna.a.regenKwh).not.toBeCloseTo(corollaHybrid.a.regenKwh, 2);
    expect(bolt.a.regenKwh).not.toBeCloseTo(sienna.a.regenKwh, 2);
    expect(bolt.trip.vehicle).toContain("Bolt");
  });

  it("segments and trip analysis use the simulated car's regen efficiency", () => {
    const bolt = run("user-024");
    expect(bolt.trip.physics.regenEfficiency).toBe(0.72);
    const segs = buildSegments(bolt.trip.samples, 6, bolt.trip.physics.regenEfficiency);
    expect(segs.some((s) => s.grade !== "idle")).toBe(true);
  });

  it("changes the regen path itself: a heavy truck driven hard loses regen where a smooth Prius keeps it", () => {
    const tundra = run("user-008", "aggressive"); // Tundra Hybrid, 3,100 kg
    const prius = run("user-020", "smooth"); // Prius Prime, 1,680 kg
    const grades = (r: ReturnType<typeof run>) => {
      const segs = buildSegments(r.trip.samples, 6, r.trip.physics.regenEfficiency);
      return { bad: segs.filter((s) => s.grade === "bad").length, good: segs.filter((s) => s.grade === "good").length, kw: segs.reduce((a, s) => a + s.regenKw, 0) };
    };
    expect(grades(tundra).bad).toBeGreaterThan(grades(prius).bad);
    expect(grades(prius).good).toBeGreaterThan(0);
    expect(grades(tundra).kw).not.toBeCloseTo(grades(prius).kw, 1);
  });

  it("leaves the default car unchanged when no vehicle is given", () => {
    const a = simulateTrip(HILLS, { driver: "mixed", condition: "dry", regen: true });
    const b = simulateTrip(HILLS, { driver: "mixed", condition: "dry", regen: true, vehicle: DEFAULT_PHYSICS });
    expect(a.samples).toEqual(b.samples);
    expect(a.vehicle).toBe("Camry Hybrid (simulated)");
  });

  it("brakes with friction only when the car cannot recover energy", () => {
    const ice = simulateTrip(HILLS, { driver: "mixed", condition: "dry", regen: true, vehicle: { ...DEFAULT_PHYSICS, regenCapable: false } });
    expect(ice.samples.every((s) => s.regenKw === 0)).toBe(true);
    expect(ice.regenEnabled).toBe(false);
    expect(Number.isFinite(analyzeTrip(ice).regenShare)).toBe(true);
  });
});
