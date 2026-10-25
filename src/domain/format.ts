import type { Cents } from "@/contracts";

/** Format cents as USD. Negative values keep their sign. */
export function usd(cents: Cents, digits = 0): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
