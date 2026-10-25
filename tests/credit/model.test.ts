import { describe, expect, it } from "vitest";
import { CREDIT_MODEL as model, scoreGerman } from "@/domain/credit/model";

describe("credit model", () => {
  it("reproduces scikit-learn's probabilities", () => {
    for (const c of model.checks) expect(scoreGerman(c.input).pBad).toBeCloseTo(c.pBad, 6);
  });

  it("leaves out protected attributes", () => {
    expect(model.excluded).toEqual(expect.arrayContaining(["A9", "A13", "A20"]));
    expect(model.features.map((f) => f.name)).not.toEqual(expect.arrayContaining(["A9"]));
    expect(model.features.map((f) => f.name)).not.toContain("A13");
    expect(model.features.map((f) => f.name)).not.toContain("A20");
  });

  it("explains the score: contributions sum to the logit", () => {
    const { pBad, contributions } = scoreGerman(model.checks[1].input);
    const logit = Math.log(pBad / (1 - pBad));
    expect(contributions.reduce((s, c) => s + c.value, model.intercept)).toBeCloseTo(logit, 9);
  });
});
