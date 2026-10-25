// Shared contracts for Next Move. Money is integer cents (USD), rates are basis points,
// distance is meters internally. Unknown values are null with a reason, never zero.

import type { BankLoan } from "./credit";

export const SCHEMA_VERSION = "1.0";
export const MODEL_VERSION = "finance-1";

export type Cents = number;

/** Where a value came from. A single demo label never replaces field-level provenance. */
export type SourceKind = "observed" | "user_reported" | "derived" | "modeled" | "synthetic";
export type DataMode = "fixture" | "sandbox";

export interface Unknown {
  known: false;
  reason: string;
}
export type Maybe<T> = { known: true; value: T } | Unknown;
export const known = <T>(value: T): Maybe<T> => ({ known: true, value });
export const unknown = (reason: string): Unknown => ({ known: false, reason });

// ---------- Vehicles ----------

export interface CatalogVehicle {
  catalogId: string;
  make: "Toyota";
  model: string;
  modelYear: number;
  trim: string;
  powertrain: "gasoline" | "hybrid";
  fuelEconomyId: number; // fueleconomy.gov vehicle record
  cityMpg: number;
  highwayMpg: number;
  retrievedAt: string;
}

export interface OwnedVehicle {
  vehicleId: string;
  catalogId: string;
  odometerMiles: number;
  odometerObservedAt: string;
  estimatedValueCents: Maybe<Cents>;
  valuationSource: SourceKind;
}

// ---------- Contracts ----------

export interface Quote {
  quoteId: string;
  kind: "buyout" | "payoff" | "purchase" | "lease" | "insurance";
  amountCents: Cents;
  includesTaxesAndFees: boolean;
  effectiveDate: string;
  source: SourceKind;
  note?: string;
}

export type OwnershipContract =
  | { type: "owned" }
  | {
      type: "loan";
      payoffCents: Cents;
      payoffDate: string;
      aprBps: number;
      paymentCents: Cents;
      remainingMonths: number;
    }
  | {
      type: "lease";
      maturityDate: string;
      paymentCents: Cents;
      totalAllowedMiles: number;
      excessCentsPerMile: number;
      dispositionFeeCents: Maybe<Cents>;
      purchaseOptionCents: Maybe<Cents>; // contract residual, not an out-the-door buyout quote
      buyoutQuote: Maybe<Quote>;
    };

// ---------- Banking (normalized) ----------

export type TxnType = "deposit" | "purchase" | "bill" | "withdrawal" | "transfer";
export type TxnStatus = "completed" | "pending" | "cancelled" | "recurring" | "unknown";
export type TxnCategory =
  | "income"
  | "refund"
  | "internal_transfer"
  | "housing"
  | "groceries"
  | "utilities"
  | "dining"
  | "shopping"
  | "subscriptions"
  | "other"
  | "vehicle_payment"
  | "vehicle_fuel"
  | "vehicle_insurance"
  | "vehicle_maintenance";

export interface Account {
  accountId: string;
  providerRecordId: string;
  type: "Checking" | "Savings" | "Credit Card";
  nickname: string;
  balanceCents: Cents;
}

export interface Transaction {
  transactionId: string;
  providerRecordId: string;
  accountId: string;
  type: TxnType;
  status: TxnStatus;
  amountCents: Cents; // positive magnitude; direction comes from type
  effectiveAt: string; // ISO date
  description: string;
  category: TxnCategory;
  counterpartAccountId?: string;
}

export interface BankingSnapshot {
  customerId: string;
  mode: DataMode;
  retrievedAt: string;
  accounts: Account[];
  transactions: Transaction[];
  loans?: BankLoan[]; // absent on snapshots read before loan records existed
}

// ---------- Profile and persona ----------

export interface Profile {
  ownerId: string;
  displayName: string;
  timeZone: string;
  monthlySavingsGoalCents: Cents;
  monthlyBufferCents: Cents;
  protectedCashReserveCents: Cents;
  otherCommittedUpfrontCashCents: Cents;
  manualObligations: { label: string; monthlyCents: Cents }[];
  objective: "preserve_cash_then_minimize_cost" | "minimize_cost" | "lowest_monthly";
}

export interface DrivingUsage {
  monthlyMiles: number;
  cityShare: number; // 0..1, from recorded routes and user confirmation
  source: SourceKind;
  routeId: string; // cached demo route for the Drives screen
}

export interface Persona {
  id: string;
  summary: string;
  situation: string;
  profile: Profile;
  vehicle: OwnedVehicle;
  contract: OwnershipContract;
  usage: DrivingUsage;
  costs: { insuranceMonthlyCents: Cents; maintenanceMonthlyCents: Cents };
  scenario: ScenarioTerms;
}

/** Explicit synthetic terms for options that need a quote we don't have. */
export interface ScenarioTerms {
  actionDate: string;
  horizonMonths: number;
  gasCentsPerGallon: number;
  financeAprBps: number;
  financeTermMonths: number;
  currentVehicleEndValueCents: Cents; // estimated value at the horizon if kept
  candidates: CandidateTerms[];
  refinance?: { aprBps: number; termMonths: number; feeCents: Cents };
}

export interface CandidateTerms {
  catalogId: string;
  acquisition: "lease" | "finance" | "cash";
  priceCents: Cents; // all-in price for finance/cash, adjusted cap cost for lease
  residualCents?: Cents;
  moneyFactor?: number;
  leaseTermMonths?: number;
  dueAtSigningCents: Cents;
  endValueCents: Cents; // estimated value at the horizon (0 for a lease that ends there)
  insuranceMonthlyCents: Cents;
  maintenanceMonthlyCents: Cents;
}

// ---------- Comparison ----------

export interface EvidenceFact {
  id: string;
  label: string;
  display: string;
  source: SourceKind;
  formula?: string;
}

export interface OptionResult {
  optionId: string;
  label: string;
  kind: "keep" | "buyout" | "lease_new" | "purchase_new" | "refinance" | "sell_replace";
  catalogId?: string;
  upfrontCashCents: Cents;
  monthlyPaymentCents: Cents;
  monthlyRunningCents: Cents; // fuel, insurance, maintenance
  totalMonthlyCents: Cents;
  monthlyRemainingCents: Cents; // budget left; can be negative
  netCashOutflowCents: Cents;
  startingEquityCents: Cents;
  endingDebtCents: Cents;
  endingValueCents: Cents;
  endingEquityCents: Cents;
  economicCostCents: Cents;
  feasible: boolean;
  exclusions: string[];
  missingInputs: string[];
  tradeoff: string;
}

export type NextAction =
  | "keep_current_plan"
  | "request_buyout_quote"
  | "request_payoff_quote"
  | "compare_confirmed_offers"
  | "review_insurance_program"
  | "review_budget"
  | "obtain_missing_vehicle_information";

export interface Recommendation {
  status: "recommended" | "needs_information" | "no_feasible_option";
  selectedOptionId: string | null;
  nextAction: NextAction;
  headline: string;
  explanation: string[];
  evidenceIds: string[];
  missingInputs: string[];
  explanationMode: "template" | "ai"; // the domain always says "template"; only the server explainer sets "ai"
}

export interface Comparison {
  schemaVersion: string;
  modelVersion: string;
  personaId: string;
  actionDate: string;
  horizonMonths: number;
  preparation: { months: number; cashCents: Cents; note: string } | null;
  options: OptionResult[];
  notConsidered: { label: string; reason: string }[];
  sensitivity: { label: string; flipsRanking: boolean; detail: string }[];
  evidence: EvidenceFact[];
  recommendation: Recommendation;
}

export * from "./explain";
export * from "./driving";
export * from "./banking-sync";
export * from "./market";
export * from "./onboarding";
export * from "./credit";
