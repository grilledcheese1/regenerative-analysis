import { describe, expect, it } from "vitest";
import { bankingSpecFromAnswers } from "@/domain/onboarding/banking";
import { buildUserPersona } from "@/domain/onboarding/persona";
import { validateAnswers } from "@/domain/onboarding/validate";
import { felixAnswers } from "./fixtures";

describe("credit score in onboarding", () => {
  it("puts the score and the current loan on a Nessie loan record", () => {
    const a = { ...felixAnswers, credit: { score: 742 } };
    const spec = bankingSpecFromAnswers(a, buildUserPersona("acct_c", a));
    expect(spec.credit).toEqual({ score: 742, loans: [{ type: "auto", status: "approved", amount: 14000, monthly_payment: 455, description: "2021 RAV4 AWD loan" }] });
  });

  it("writes an unknown score as null", () => {
    const a = { ...felixAnswers, credit: { score: null } };
    expect(bankingSpecFromAnswers(a, buildUserPersona("acct_c", a)).credit?.score).toBeNull();
  });

  it("treats answers saved before the field existed as unknown", () => {
    const spec = bankingSpecFromAnswers(felixAnswers, buildUserPersona("acct_c", felixAnswers));
    expect(spec.credit?.score).toBeNull();
  });

  it("rejects a score outside 300–850", () => {
    expect(validateAnswers({ credit: { score: 900 } })["credit.score"]).toBe("Enter a score between 300 and 850");
    expect(validateAnswers({ credit: { score: null } })).toEqual({});
  });
});
