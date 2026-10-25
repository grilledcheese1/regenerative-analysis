import { known, unknown, type OnboardingAnswers, type OwnershipContract, type Persona } from "@/contracts";
import { catalogVehicle } from "@/fixtures/catalog";
import { DEMO_AS_OF, PERSONAS } from "@/fixtures/personas";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOT_PROVIDED = "Not provided during onboarding";

// Defaults every onboarded person starts from. All synthetic scenario inputs, like the case studies.
export const ONBOARDING_DEFAULTS = {
  horizonMonths: 36,
  gasCentsPerGallon: 300,
  financeAprBps: 649,
  financeTermMonths: 60,
  endValueShare: 0.65,
  actionDate: "2026-11-01",
} as const;

/** Monthly maintenance estimate by the car's age. */
export const maintenanceCents = (modelYear: number, asOf: string) => {
  const age = Number(asOf.slice(0, 4)) - modelYear;
  return age <= 3 ? 3000 : age <= 8 ? 6000 : 9500;
};

const routeFor = (cityShare: number) => (cityShare >= 0.65 ? "downtown" : cityShare <= 0.35 ? "hills" : "mixed");

function contractOf(c: OnboardingAnswers["contract"]): OwnershipContract {
  if (c.type === "owned") return { type: "owned" };
  if (c.type === "loan") {
    const { payoffCents, aprBps, paymentCents, remainingMonths } = c;
    return { type: "loan", payoffCents, payoffDate: DEMO_AS_OF, aprBps, paymentCents, remainingMonths };
  }
  return {
    type: "lease",
    maturityDate: c.maturityDate,
    paymentCents: c.paymentCents,
    totalAllowedMiles: c.totalAllowedMiles,
    excessCentsPerMile: c.excessCentsPerMile,
    dispositionFeeCents: c.dispositionFeeCents === null ? unknown(NOT_PROVIDED) : known(c.dispositionFeeCents),
    purchaseOptionCents: c.purchaseOptionCents === null ? unknown(NOT_PROVIDED) : known(c.purchaseOptionCents),
    buyoutQuote: unknown("No out-the-door buyout quote requested yet"),
  };
}

function situation(a: OnboardingAnswers): string {
  const c = a.contract;
  if (c.type === "owned") return "paid off";
  if (c.type === "loan") return `loan, ${c.remainingMonths} payments left`;
  return `lease ending ${MONTHS[Number(c.maturityDate.slice(5, 7)) - 1]} ${c.maturityDate.slice(0, 4)}`;
}

/** A regular Persona from onboarding answers, so every calculation and screen works unchanged. */
export function buildUserPersona(accountId: string, a: OnboardingAnswers, asOf = DEMO_AS_OF): Persona {
  const v = catalogVehicle(a.car.catalogId);
  const id = `u_${accountId}`;
  const value = a.car.estimatedValueCents;
  return {
    id,
    summary: `${a.name} · ${v.modelYear} ${v.model}, ${situation(a)}`,
    situation: "Your own answers from onboarding. Bank history is seeded from them; prices and rates for new cars are synthetic.",
    profile: {
      ownerId: accountId,
      displayName: a.name,
      timeZone: "America/Chicago",
      monthlySavingsGoalCents: a.goals.monthlySavingsGoalCents,
      monthlyBufferCents: a.goals.monthlyBufferCents,
      protectedCashReserveCents: a.goals.protectedCashReserveCents,
      otherCommittedUpfrontCashCents: 0,
      manualObligations: [],
      objective: a.goals.objective,
    },
    vehicle: {
      vehicleId: `vehicle_${id}`,
      catalogId: v.catalogId,
      odometerMiles: a.car.odometerMiles,
      odometerObservedAt: asOf,
      estimatedValueCents: value === null ? unknown(NOT_PROVIDED) : known(value),
      valuationSource: "user_reported",
    },
    contract: contractOf(a.contract),
    usage: { monthlyMiles: a.driving.monthlyMiles, cityShare: a.driving.cityShare, source: a.driving.source, routeId: routeFor(a.driving.cityShare) },
    costs: { insuranceMonthlyCents: a.insurance.monthlyCents, maintenanceMonthlyCents: maintenanceCents(v.modelYear, asOf) },
    scenario: {
      actionDate: a.contract.type === "lease" ? a.contract.maturityDate : ONBOARDING_DEFAULTS.actionDate,
      horizonMonths: ONBOARDING_DEFAULTS.horizonMonths,
      gasCentsPerGallon: ONBOARDING_DEFAULTS.gasCentsPerGallon,
      financeAprBps: ONBOARDING_DEFAULTS.financeAprBps,
      financeTermMonths: ONBOARDING_DEFAULTS.financeTermMonths,
      currentVehicleEndValueCents: value === null ? 0 : Math.round(value * ONBOARDING_DEFAULTS.endValueShare),
      // The same two synthetic offers Maria compares: a new Camry Hybrid lease and a Corolla Hybrid loan.
      candidates: PERSONAS[0].scenario.candidates.map((c) => ({ ...c })),
    },
  };
}
