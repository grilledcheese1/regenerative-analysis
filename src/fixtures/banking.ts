import type { NessieAccountBundle } from "@/server/providers/nessie-normalize";
import generated from "./people.generated.json";

// Synthetic bank history in Nessie's record shapes (dollars), July through October 22 2026.
// Each persona exercises the normalization rules: an internal transfer, a credit card and
// its payment, a refund, a pending purchase, and a bill also recorded as a purchase.

interface Monthly {
  income: [number, number]; // two payroll deposits per month
  bills: [string, number, number][]; // payee, dollars, day
  purchases: [string, number, number][]; // description, dollars, day
  card: [string, number, number][]; // purchases on the credit card
  savingsTransfer: number;
}

/** Nessie loan records (dollars) carrying the credit score; score null is written as 0 ("not provided"). */
export interface CreditSpec {
  score: number | null;
  loans: { type: "auto" | "auto lease" | "credit file"; status: "approved"; amount: number; monthly_payment: number; description: string }[];
}

export interface BankingSpec {
  checking: number;
  savings: number;
  cardBalance: number;
  monthly: Monthly;
  credit?: CreditSpec;
}

const CURATED_SPECS: Record<string, BankingSpec> = {
  maria: {
    checking: 3800,
    savings: 5700,
    cardBalance: 310,
    monthly: {
      income: [2100, 2100],
      bills: [
        ["Riverside Apartments rent", 1450, 1],
        ["Austin Energy electric", 95, 12],
        ["Internet service", 65, 14],
        ["Auto lease payment", 389, 24],
        ["Auto insurance premium", 140, 5],
      ],
      purchases: [
        ["Grocery market", 210, 6],
        ["Grocery market", 210, 20],
        ["Taco restaurant", 120, 9],
        ["Coffee cafe", 130, 23],
        ["Streaming subscription", 70, 3],
        ["Gas station", 25, 8],
        ["Gas station", 25, 22],
      ],
      card: [["Home goods store", 350, 17]],
      savingsTransfer: 400,
    },
    credit: { score: 712, loans: [{ type: "auto lease", status: "approved", amount: 19850, monthly_payment: 389, description: "2024 Camry Hybrid LE lease" }] },
  },
  devon: {
    checking: 4000,
    savings: 10000,
    cardBalance: 180,
    monthly: {
      income: [2550, 2550],
      bills: [
        ["Mortgage payment", 1900, 1],
        ["Electric and water utility", 165, 10],
        ["Internet service", 65, 15],
        ["Auto insurance premium", 120, 7],
      ],
      purchases: [
        ["Grocery market", 280, 5],
        ["Grocery market", 280, 19],
        ["Restaurant", 260, 13],
        ["Streaming and phone plan subscription", 90, 4],
        ["Gas station", 30, 9],
        ["Gas station", 30, 24],
        ["Oil change and tire rotation", 95, 16],
      ],
      card: [["Hardware store", 260, 21]],
      savingsTransfer: 700,
    },
    credit: { score: 768, loans: [{ type: "credit file", status: "approved", amount: 0, monthly_payment: 0, description: "No open auto loans" }] },
  },
  kai: {
    checking: 1050,
    savings: 750,
    cardBalance: 640,
    monthly: {
      income: [1800, 1800],
      bills: [
        ["Eastside Lofts rent", 1350, 1],
        ["Electric utility", 120, 11],
        ["Internet service", 70, 13],
        ["Auto loan payment", 581.9, 15],
        ["Auto insurance premium", 165, 6],
      ],
      purchases: [
        ["Grocery market", 240, 7],
        ["Grocery market", 240, 21],
        ["Taco restaurant", 300, 18],
        ["Phone plan subscription", 130, 2],
        ["Gas station", 47, 10],
        ["Gas station", 48, 25],
        ["Auto repair shop", 55, 27],
      ],
      card: [["Online order store", 300, 12]],
      savingsTransfer: 150,
    },
    credit: { score: 618, loans: [{ type: "auto", status: "approved", amount: 21400, monthly_payment: 582, description: "2021 RAV4 AWD loan" }] },
  },
};

// Bank histories for the generated people live beside them (scripts/build-people.ts).
const SPECS: Record<string, BankingSpec> = { ...CURATED_SPECS, ...(generated.bankingSpecs as unknown as Record<string, BankingSpec>) };

const MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10"];
const LAST_DAY_SEEN = "2026-10-22";
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`;

export function nessieFixture(personaId: string): NessieAccountBundle[] | null {
  const spec = SPECS[personaId];
  return spec ? nessieBundlesFromSpec(personaId, spec) : null;
}

/** Four months of Nessie-shaped records from a spec. Used for curated, generated and onboarded people. */
export function nessieBundlesFromSpec(personaId: string, spec: BankingSpec): NessieAccountBundle[] {
  const id = (s: string) => `${personaId}_${s}`;
  const checking: NessieAccountBundle = {
    account: { _id: id("chk"), type: "Checking", nickname: "Everyday checking", balance: spec.checking },
    deposits: [],
    withdrawals: [],
    purchases: [],
    transfers: [],
    bills: [],
  };
  const savings: NessieAccountBundle = {
    account: { _id: id("sav"), type: "Savings", nickname: "Savings", balance: spec.savings },
    deposits: [],
    withdrawals: [],
    purchases: [],
    transfers: [],
    bills: [],
  };
  const card: NessieAccountBundle = {
    account: { _id: id("card"), type: "Credit Card", nickname: "Credit card", balance: spec.cardBalance },
    deposits: [],
    withdrawals: [],
    purchases: [],
    transfers: [],
    bills: [],
  };

  let n = 0;
  const rid = (kind: string) => id(`${kind}_${++n}`);
  const seen = (date: string) => date <= LAST_DAY_SEEN;
  const m = spec.monthly;

  for (const month of MONTHS) {
    const [a, b] = m.income;
    for (const [amount, d] of [[a, 1], [b, 15]] as const) {
      const date = day(month, d);
      if (seen(date)) checking.deposits.push({ _id: rid("dep"), amount, status: "completed", description: "Payroll direct deposit", transaction_date: date });
    }
    for (const [payee, amount, d] of m.bills) {
      const date = day(month, d);
      if (seen(date)) checking.bills.push({ _id: rid("bill"), status: "completed", payee, nickname: payee, payment_date: date, payment_amount: amount });
    }
    for (const [description, amount, d] of m.purchases) {
      const date = day(month, d);
      if (seen(date)) checking.purchases.push({ _id: rid("pur"), amount, status: "completed", description, purchase_date: date });
    }
    let cardTotal = 0;
    for (const [description, amount, d] of m.card) {
      const date = day(month, d);
      if (seen(date)) {
        card.purchases.push({ _id: rid("pur"), amount, status: "completed", description, purchase_date: date });
        cardTotal += amount;
      }
    }
    const t = { _id: rid("xfer"), amount: m.savingsTransfer, status: "completed" as const, description: "Transfer to savings", transaction_date: day(month, 2), payer_id: checking.account._id, payee_id: savings.account._id };
    if (seen(t.transaction_date)) {
      checking.transfers.push(t);
      savings.transfers.push(t);
    }
    // Paying the card is not spending; the card purchases already were.
    const payDate = day(month, 28);
    if (seen(payDate) && cardTotal > 0) {
      checking.bills.push({ _id: rid("bill"), status: "completed", payee: "Credit card payment", nickname: "Card autopay", payment_date: payDate, payment_amount: cardTotal });
    }
  }

  if (spec.credit) {
    checking.loans = spec.credit.loans.map((l) => ({ _id: rid("loan"), ...l, credit_score: spec.credit!.score ?? 0 }));
  }

  // Edge cases inside the July-September budget window.
  const rent = m.bills[0];
  if (!rent) return [checking, savings, card];
  checking.purchases.push({ _id: rid("pur"), amount: rent[1], status: "completed", description: rent[0], purchase_date: day("2026-08", rent[2] + 1) });
  checking.deposits.push({ _id: rid("dep"), amount: 85, status: "completed", description: "Refund - online order", transaction_date: "2026-09-11" });
  checking.purchases.push({ _id: rid("pur"), amount: 45, status: "pending", description: "Coffee cafe", purchase_date: "2026-09-30" });
  checking.purchases.push({ _id: rid("pur"), amount: 60, status: "cancelled", description: "Online order store", purchase_date: "2026-08-19" });
  checking.bills.push({ _id: rid("bill"), status: "recurring", payee: rent[0], nickname: "Rent schedule", upcoming_payment_date: day("2026-09", 1), payment_amount: rent[1] });

  return [checking, savings, card];
}
