import { expect, it } from "vitest";
import { niceDate } from "@/domain/format";

it("formats ISO dates for people", () => {
  expect(niceDate("2027-02-24")).toBe("Feb 24, 2027");
  expect(niceDate("2026-10-01")).toBe("Oct 1, 2026");
  expect(niceDate("not a date")).toBe("not a date");
});
