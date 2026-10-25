import type { Cents } from "@/contracts";

/** Round half up to whole cents. */
export const roundCents = (x: number): Cents => Math.floor(x + 0.5);

/** Regular payment for a fixed-rate fully amortizing loan, rounded half up to cents. */
export function loanPayment(principalCents: Cents, aprBps: number, termMonths: number): Cents {
  const r = aprBps / 10000 / 12;
  if (r === 0) return roundCents(principalCents / termMonths);
  return roundCents((principalCents * r) / (1 - (1 + r) ** -termMonths));
}

export interface LoanState {
  paymentCents: Cents;
  paidCents: Cents;
  interestCents: Cents;
  balanceCents: Cents;
  monthsPaid: number;
}

/**
 * Walk a cents schedule: interest rounded to cents each month, the regular payment
 * applied to it, and the final payment adjusted to clear the balance.
 */
export function amortize(principalCents: Cents, aprBps: number, termMonths: number, months: number): LoanState {
  const r = aprBps / 10000 / 12;
  const payment = loanPayment(principalCents, aprBps, termMonths);
  let balance = principalCents;
  let paid = 0;
  let interest = 0;
  const n = Math.min(months, termMonths);
  for (let m = 1; m <= n && balance > 0; m++) {
    const i = roundCents(balance * r);
    const due = m === termMonths ? balance + i : Math.min(payment, balance + i);
    balance = balance + i - due;
    paid += due;
    interest += i;
  }
  return { paymentCents: payment, paidCents: paid, interestCents: interest, balanceCents: balance, monthsPaid: n };
}
