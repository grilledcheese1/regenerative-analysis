import { known, unknown, type BankingSnapshot, type CreditProfile, type SourceKind } from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { CREDIT_POLICY as P } from "./config";

/** What underwriting knows about a borrower: Nessie loan records plus the bank history in the budget window. */
export function creditProfile(bank: BankingSnapshot, budget: BudgetSnapshot, scoreSource: SourceKind): CreditProfile {
  const loans = bank.loans ?? [];
  const scored = loans.find((l) => l.creditScore > 0);
  const inWindow = (d: string) => d >= budget.window.start && d <= budget.window.end;
  const months = Math.max(1, budget.window.months);

  const carBills = bank.transactions.filter((t) => t.type === "bill" && t.category === "vehicle_payment" && t.status !== "recurring");
  const housing = bank.transactions
    .filter((t) => t.type === "bill" && t.category === "housing" && t.status === "completed" && inWindow(t.effectiveAt))
    .reduce((s, t) => s + t.amountCents, 0);
  const sum = (type: "Checking" | "Savings") => bank.accounts.filter((a) => a.type === type).reduce((s, a) => s + a.balanceCents, 0);
  const cardOwed = bank.accounts.filter((a) => a.type === "Credit Card").reduce((s, a) => s - a.balanceCents, 0);

  return {
    score: scored ? known(scored.creditScore) : unknown("Credit score not provided"),
    scoreSource,
    loans,
    onTimeCarPayments: carBills.filter((t) => t.status === "completed").length,
    // Pending means upcoming (and unknown live statuses normalize to pending), so only cancelled counts as missed.
    lateCarPayments: carBills.filter((t) => t.status === "cancelled").length,
    payrollDepositsPerMonth: budget.incomeDeposits / months,
    takeHomeMonthlyCents: budget.recurringIncomeCents,
    grossMonthlyCents: Math.round(budget.recurringIncomeCents / P.grossFromTakeHome),
    housingMonthlyCents: Math.round(housing / months),
    otherDebtMonthlyCents: loans.reduce((s, l) => s + (l.amountCents > 0 ? l.monthlyPaymentCents : 0), 0),
    cardMinimumCents: cardOwed > 0 ? Math.max(P.cardMinimumFloorCents, Math.round(cardOwed * P.cardMinimumShare)) : 0,
    checkingCents: sum("Checking"),
    savingsCents: sum("Savings"),
  };
}
