import type { Cents } from "./index";

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
