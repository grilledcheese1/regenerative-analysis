import type { CreditTier } from "@/contracts";

// Every underwriting number lives here. Sources: docs/superpowers/specs/2026-10-25-loan-prequalification-design.md.

export const CREDIT_POLICY = {
  maxPti: 0.2, // car payment ÷ estimated gross income
  maxDti: 0.5, // all debt payments incl. the new one ÷ estimated gross income
  maxLtv: 1.25, // amount ÷ vehicle value
  maxTermMonths: 84,
  minPayrollDepositsPerMonth: 2,
  minScore: 500,
  nearLimitShare: 0.9, // within 10% of a limit → needs review
  grossFromTakeHome: 0.78, // estimated gross = take-home ÷ 0.78
  cardMinimumShare: 0.02,
  cardMinimumFloorCents: 2500,
  longTermMonths: 60,
  longTermAddBps: 50,
  highLtv: 1.0,
  highLtvAddBps: 75,
  bandBps: 75,
  refinanceFeeCents: 25000, // synthetic
  refinanceMinSavingsBps: 100,
  maxReasons: 4,
} as const;

/** Experian State of the Automotive Finance Market, Q3 2025 average APRs (bps), by score tier. */
export const TIER_APR_BPS: Record<CreditTier, { new: number; used: number }> = {
  super_prime: { new: 488, used: 743 },
  prime: { new: 651, used: 965 },
  near_prime: { new: 977, used: 1411 },
  subprime: { new: 1334, used: 1900 },
  deep_subprime: { new: 1585, used: 2160 },
};

export const TIER_ORDER: CreditTier[] = ["super_prime", "prime", "near_prime", "subprime", "deep_subprime"];
export const TIER_LABEL: Record<CreditTier, string> = {
  super_prime: "Super prime (781–850)",
  prime: "Prime (661–780)",
  near_prime: "Near prime (601–660)",
  subprime: "Subprime (501–600)",
  deep_subprime: "Deep subprime (300–500)",
};

export const tierForScore = (score: number): CreditTier =>
  score >= 781 ? "super_prime" : score >= 661 ? "prime" : score >= 601 ? "near_prime" : score >= 501 ? "subprime" : "deep_subprime";

// German Credit bands, in 1994 DM (converted with the model's dmPerUsd).
export const GERMAN_BANDS = {
  checkingDm: 200, // A12 below, A13 at or above
  savingsDm: [100, 500, 1000], // A61 | A62 | A63 | A64
  installmentPti: [0.05, 0.1, 0.15], // A8 = 1 | 2 | 3 | 4
} as const;
