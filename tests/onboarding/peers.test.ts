import { describe, expect, it } from "vitest";
import { buildUserPersona } from "@/domain/onboarding/persona";
import { PEOPLE } from "@/fixtures/personas";
import { peerRank } from "@/lib/peers";
import { felixAnswers } from "./fixtures";

describe("peerRank", () => {
  it("ranks an onboarded user against every case study", () => {
    const me = buildUserPersona("acct_peer", felixAnswers);
    const r = peerRank(me);
    expect(r.n).toBe(PEOPLE.length);
    expect(r.betterThanPct).toBeGreaterThanOrEqual(0);
    expect(r.betterThanPct).toBeLessThanOrEqual(100);
  });

  it("still excludes a case study from its own comparison", () => {
    expect(peerRank(PEOPLE[0]).n).toBe(PEOPLE.length - 1);
  });
});
