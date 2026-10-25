import type { Cents, Profile } from "./index";

// What a new account holder tells us during onboarding. The app turns it into a regular
// Persona (src/domain/onboarding/persona.ts), so every screen works the same for them.

export interface SimulatedPolicy {
  provider: "Toyota Insurance (simulated)";
  policyNumber: string;
  coverage: string;
  monthlyCents: Cents;
}

export type OnboardingContract =
  | { type: "owned" }
  | { type: "loan"; payoffCents: Cents; aprBps: number; paymentCents: Cents; remainingMonths: number }
  | {
      type: "lease";
      maturityDate: string;
      paymentCents: Cents;
      totalAllowedMiles: number;
      excessCentsPerMile: number;
      purchaseOptionCents: Cents | null;
      dispositionFeeCents: Cents | null;
    };

export interface OnboardingAnswers {
  name: string;
  car: { catalogId: string; odometerMiles: number; estimatedValueCents: Cents | null };
  contract: OnboardingContract;
  money: {
    takeHomeMonthlyCents: Cents;
    housingCents: Cents;
    utilitiesCents: Cents;
    groceriesCents: Cents;
    diningShoppingCents: Cents;
    subscriptionsCents: Cents;
    checkingCents: Cents;
    savingsCents: Cents;
    cardBalanceCents: Cents;
  };
  driving: { monthlyMiles: number; cityShare: number; source: "user_reported" | "observed" };
  insurance: { monthlyCents: Cents; source: "synthetic" | "user_reported"; policy: SimulatedPolicy | null };
  /** Approximate credit score the user gave; null = didn't know. Absent on profiles saved before it existed. */
  credit?: { score: number | null };
  goals: {
    monthlySavingsGoalCents: Cents;
    monthlyBufferCents: Cents;
    protectedCashReserveCents: Cents;
    objective: Profile["objective"];
  };
}

export interface UserBanking {
  mode: "fixture" | "sandbox";
  nessieCustomerId: string | null;
  connectedAt: string;
  note: string | null;
  proof?: string; // server-issued tag tying nessieCustomerId to this account (sandbox only)
}

export interface UserProfile {
  accountId: string;
  personaId: string;
  answers: OnboardingAnswers;
  banking: UserBanking;
  updatedAt: string;
}
