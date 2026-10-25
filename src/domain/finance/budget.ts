import type { BankingSnapshot, Cents, Profile, Transaction, TxnCategory } from "@/contracts";
import { roundCents } from "./loan";

const VEHICLE_CATEGORIES: TxnCategory[] = ["vehicle_payment", "vehicle_fuel", "vehicle_insurance", "vehicle_maintenance"];

export interface BudgetSnapshot {
  window: { start: string; end: string; months: number };
  recurringIncomeCents: Cents;
  otherMonthlySpendingCents: Cents; // excludes the vehicle costs being compared
  manualObligationsCents: Cents;
  observedVehicleMonthlyCents: Partial<Record<TxnCategory, Cents>>;
  monthlySavingsGoalCents: Cents;
  monthlyBufferCents: Cents;
  vehicleBudgetCents: Cents; // may be negative
  liquidCashCents: Cents;
  protectedCashReserveCents: Cents;
  availableUpfrontCashCents: Cents; // may be negative
  excluded: { reason: string; count: number; cents: Cents }[];
  incomeDeposits: number;
}

/** The last `months` complete calendar months before `asOf` (UTC). */
export function completeMonthWindow(asOf: string, months = 3) {
  const d = new Date(asOf);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); // exclusive
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), months };
}

const DAY = 86400000;

/**
 * A completed bill and a purchase for the same payee and amount within three days are
 * one payment seen twice; keep the bill and drop the purchase.
 */
function duplicateBillPayments(txns: Transaction[]): Set<string> {
  const bills = txns.filter((t) => t.type === "bill");
  const dupes = new Set<string>();
  for (const p of txns.filter((t) => t.type === "purchase")) {
    const match = bills.find(
      (b) =>
        b.amountCents === p.amountCents &&
        b.description.toLowerCase() === p.description.toLowerCase() &&
        Math.abs(Date.parse(b.effectiveAt) - Date.parse(p.effectiveAt)) <= 3 * DAY,
    );
    if (match) dupes.add(p.transactionId);
  }
  return dupes;
}

export function buildBudget(bank: BankingSnapshot, profile: Profile, asOf: string, months = 3): BudgetSnapshot {
  const window = completeMonthWindow(asOf, months);
  const excluded = new Map<string, { count: number; cents: Cents }>();
  const exclude = (reason: string, t: Transaction) => {
    const e = excluded.get(reason) ?? { count: 0, cents: 0 };
    e.count++;
    e.cents += t.amountCents;
    excluded.set(reason, e);
  };

  const inWindow = bank.transactions.filter((t) => t.effectiveAt >= window.start && t.effectiveAt < window.end);
  const settled: Transaction[] = [];
  for (const t of inWindow) {
    if (t.status === "completed") settled.push(t);
    else if (t.status === "recurring") exclude("Scheduled bill (counted when paid)", t);
    else exclude(`${t.status[0].toUpperCase()}${t.status.slice(1)} (not settled)`, t);
  }
  const dupes = duplicateBillPayments(settled);

  let income = 0;
  let incomeDeposits = 0;
  let spending = 0;
  const vehicle: Partial<Record<TxnCategory, Cents>> = {};

  for (const t of settled) {
    if (dupes.has(t.transactionId)) {
      exclude("Bill payment already counted", t);
    } else if (t.category === "internal_transfer") {
      exclude("Transfer between own accounts", t);
    } else if (t.type === "deposit") {
      if (t.category === "income") {
        income += t.amountCents;
        incomeDeposits++;
      } else exclude(t.category === "refund" ? "Refund (not income)" : "One-off deposit (not income)", t);
    } else if (VEHICLE_CATEGORIES.includes(t.category)) {
      vehicle[t.category] = (vehicle[t.category] ?? 0) + t.amountCents;
    } else {
      spending += t.amountCents;
    }
  }

  const perMonth = (c: Cents) => roundCents(c / months);
  for (const k of Object.keys(vehicle) as TxnCategory[]) vehicle[k] = perMonth(vehicle[k]!);

  const recurringIncomeCents = perMonth(income);
  const manualObligationsCents = profile.manualObligations.reduce((a, o) => a + o.monthlyCents, 0);
  const otherMonthlySpendingCents = perMonth(spending) + manualObligationsCents;
  const vehicleBudgetCents =
    recurringIncomeCents - otherMonthlySpendingCents - profile.monthlySavingsGoalCents - profile.monthlyBufferCents;

  const liquidCashCents = bank.accounts
    .filter((a) => a.type !== "Credit Card")
    .reduce((acc, a) => acc + a.balanceCents, 0);
  const availableUpfrontCashCents =
    liquidCashCents - profile.protectedCashReserveCents - profile.otherCommittedUpfrontCashCents;

  return {
    window,
    recurringIncomeCents,
    otherMonthlySpendingCents,
    manualObligationsCents,
    observedVehicleMonthlyCents: vehicle,
    monthlySavingsGoalCents: profile.monthlySavingsGoalCents,
    monthlyBufferCents: profile.monthlyBufferCents,
    vehicleBudgetCents,
    liquidCashCents,
    protectedCashReserveCents: profile.protectedCashReserveCents,
    availableUpfrontCashCents,
    excluded: [...excluded].map(([reason, e]) => ({ reason, ...e })),
    incomeDeposits,
  };
}
