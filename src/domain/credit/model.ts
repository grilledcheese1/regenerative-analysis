import raw from "@/fixtures/credit-model.json";

// The pre-qualification risk model: a logistic regression trained offline on UCI German Credit
// (scripts/credit/train.py). Scoring is a dot product, so every feature's push is visible.

export interface GermanInput {
  A1: "A11" | "A12" | "A13" | "A14"; // checking account status
  A2: number; // duration in months
  A3: "A30" | "A31" | "A32" | "A33" | "A34"; // credit history
  A5: number; // credit amount (DM)
  A6: "A61" | "A62" | "A63" | "A64" | "A65"; // savings
  A8: 1 | 2 | 3 | 4; // installment rate band
  A16: 1 | 2 | 3 | 4; // existing credits
}

interface Feature {
  name: keyof GermanInput;
  kind: "category" | "number";
  levels?: string[];
  mean?: number;
  std?: number;
}

export interface CreditModel {
  dataset: string;
  license: string;
  excluded: string[];
  dmPerUsd: number; // amounts and balance bands: DM = USD × dmPerUsd
  durationScale: number; // dataset months = loan term × durationScale
  features: Feature[];
  weights: number[];
  intercept: number;
  thresholds: { tierUp: number; tierDown: number; review: number; costOptimal: number };
  metrics: { auc: number; accuracy: number; badRate: number; validation: string };
  checks: { input: GermanInput; pBad: number }[];
}

export const CREDIT_MODEL = raw as CreditModel;

/** Probability the loan goes bad, and each feature's contribution to the logit (positive = riskier). */
export function scoreGerman(input: GermanInput, model: CreditModel = CREDIT_MODEL): { pBad: number; contributions: { feature: keyof GermanInput; value: number }[] } {
  const contributions: { feature: keyof GermanInput; value: number }[] = [];
  let i = 0;
  for (const f of model.features) {
    let value = 0;
    if (f.kind === "category") {
      for (const level of f.levels!) value += (input[f.name] === level ? 1 : 0) * model.weights[i++];
    } else {
      value = ((Number(input[f.name]) - f.mean!) / f.std!) * model.weights[i++];
    }
    contributions.push({ feature: f.name, value });
  }
  const logit = contributions.reduce((s, c) => s + c.value, model.intercept);
  return { pBad: 1 / (1 + Math.exp(-logit)), contributions };
}
