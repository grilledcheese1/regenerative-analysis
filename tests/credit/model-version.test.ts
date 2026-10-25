import { expect, it } from "vitest";
import { MODEL_VERSION } from "@/contracts";

it("bumps the model version so cached comparisons from before pre-qualification aren't reused", () => {
  expect(MODEL_VERSION).toBe("finance-2");
});
