import "server-only";
import { z } from "zod";

// Shape checks for onboarding bodies; range rules live in validateAnswers (shared with the wizard).
const cents = z.number().int();
export const AnswersSchema = z.object({
  name: z.string().trim().min(1).max(60),
  car: z.object({ catalogId: z.string(), odometerMiles: z.number(), estimatedValueCents: cents.nullable() }),
  contract: z.discriminatedUnion("type", [
    z.object({ type: z.literal("owned") }),
    z.object({ type: z.literal("loan"), payoffCents: cents, aprBps: z.number().int(), paymentCents: cents, remainingMonths: z.number().int() }),
    z.object({
      type: z.literal("lease"),
      maturityDate: z.string(),
      paymentCents: cents,
      totalAllowedMiles: z.number().int(),
      excessCentsPerMile: z.number(),
      purchaseOptionCents: cents.nullable(),
      dispositionFeeCents: cents.nullable(),
    }),
  ]),
  money: z.object({
    takeHomeMonthlyCents: cents,
    housingCents: cents,
    utilitiesCents: cents,
    groceriesCents: cents,
    diningShoppingCents: cents,
    subscriptionsCents: cents,
    checkingCents: cents,
    savingsCents: cents,
    cardBalanceCents: cents,
  }),
  driving: z.object({ monthlyMiles: z.number(), cityShare: z.number(), source: z.enum(["user_reported", "observed"]) }),
  insurance: z.object({
    monthlyCents: cents,
    source: z.enum(["synthetic", "user_reported"]),
    policy: z
      .object({ provider: z.literal("Toyota Insurance (simulated)"), policyNumber: z.string().max(20), coverage: z.string().max(80), monthlyCents: cents })
      .nullable(),
  }),
  credit: z.object({ score: z.number().int().nullable() }).optional(),
  goals: z.object({
    monthlySavingsGoalCents: cents,
    monthlyBufferCents: cents,
    protectedCashReserveCents: cents,
    objective: z.enum(["preserve_cash_then_minimize_cost", "minimize_cost", "lowest_monthly"]),
  }),
});

export const BankingSchema = z.object({
  mode: z.enum(["fixture", "sandbox"]),
  nessieCustomerId: z.string().max(64).nullable(),
  connectedAt: z.string().max(40),
  note: z.string().max(300).nullable(),
  proof: z.string().max(100).optional(),
});
