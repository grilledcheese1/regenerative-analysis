import type { OnboardingAnswers, UserBanking } from "@/contracts";

export const felixAnswers: OnboardingAnswers = {
  name: "Felix",
  car: { catalogId: "rav4_awd_2021", odometerMiles: 61200, estimatedValueCents: 1900000 },
  contract: { type: "loan", payoffCents: 1400000, aprBps: 790, paymentCents: 45500, remainingMonths: 30 },
  money: {
    takeHomeMonthlyCents: 480000,
    housingCents: 150000,
    utilitiesCents: 12000,
    groceriesCents: 45000,
    diningShoppingCents: 35000,
    subscriptionsCents: 4000,
    checkingCents: 320000,
    savingsCents: 600000,
    cardBalanceCents: 25000,
  },
  driving: { monthlyMiles: 900, cityShare: 0.6, source: "user_reported" },
  insurance: { monthlyCents: 16500, source: "user_reported", policy: null },
  goals: { monthlySavingsGoalCents: 30000, monthlyBufferCents: 15000, protectedCashReserveCents: 300000, objective: "minimize_cost" },
};

export const localBanking: UserBanking = { mode: "fixture", nessieCustomerId: null, connectedAt: "2026-10-24T12:00:00Z", note: null };
