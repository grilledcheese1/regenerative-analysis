import type { Cents, Maybe, SourceKind } from "./index";

/** A Nessie loan record, normalized. Nessie stores the borrower's credit score on each loan. */
export interface BankLoan {
  loanId: string;
  accountId: string;
  type: string; // "auto", "auto lease", "credit file", …
  status: string;
  creditScore: number; // 0 = not provided
  monthlyPaymentCents: Cents;
  amountCents: Cents;
  description: string;
}

export type CreditTier = "super_prime" | "prime" | "near_prime" | "subprime" | "deep_subprime";

/** What underwriting knows about a borrower, from Nessie loan records and the bank history. */
export interface CreditProfile {
  score: Maybe<number>;
  scoreSource: SourceKind;
  loans: BankLoan[];
  onTimeCarPayments: number;
  lateCarPayments: number;
  payrollDepositsPerMonth: number;
  takeHomeMonthlyCents: Cents;
  grossMonthlyCents: Cents; // estimated: take-home ÷ 0.78
  housingMonthlyCents: Cents;
  otherDebtMonthlyCents: Cents; // all open loan payments; underwriting subtracts the one being replaced
  cardMinimumCents: Cents;
  checkingCents: Cents;
  savingsCents: Cents;
}

export interface LoanApplication {
  purpose: "finance" | "buyout" | "refinance" | "lease";
  vehicleCondition: "new" | "used";
  amountCents: Cents;
  termMonths: number;
  collateralValueCents: Cents | null;
  replacesPaymentCents: Cents; // payment this loan replaces (left out of DTI)
  currentAprBps?: number; // refinance only
  feeCents?: Cents; // refinance only
  /** Leases: the lease payment, used instead of amortizing `amountCents` (a lease isn't a loan of the full price). */
  paymentCents?: Cents;
}

export interface CreditReason {
  code: string;
  text: string;
  evidence: { label: string; display: string; source: SourceKind };
}

export interface LoanDecision {
  status: "prequalified" | "needs_review" | "not_prequalified";
  tier: CreditTier;
  scoreTier: CreditTier;
  aprBps: number;
  aprBandBps: [number, number];
  paymentCents: Cents;
  maxAmountCents: Cents;
  pBad: number;
  ptiPct: number | null; // null when there is no income to divide by
  dtiPct: number | null;
  ltvPct: number | null;
  reasons: CreditReason[];
  worthIt?: boolean; // refinance only
}
