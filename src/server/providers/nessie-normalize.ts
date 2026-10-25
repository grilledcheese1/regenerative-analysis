import { z } from "zod";
import type { Account, BankingSnapshot, Transaction, TxnCategory, TxnStatus, TxnType } from "@/contracts";

// Nessie (Capital One sandbox) record shapes, per prod.nessieisreal.com/docs. Amounts are dollars.
const status = z.enum(["pending", "cancelled", "completed", "recurring", "executed"]).catch("pending");
export const NessieAccount = z.object({
  _id: z.string(),
  type: z.string(),
  nickname: z.string().default(""),
  balance: z.number(),
});
const money = z.object({ _id: z.string(), amount: z.number(), status, description: z.string().default("") });
export const NessieDeposit = money.extend({ transaction_date: z.string(), payee_id: z.string().optional() });
export const NessieWithdrawal = money.extend({ transaction_date: z.string(), payer_id: z.string().optional() });
export const NessiePurchase = money.extend({ purchase_date: z.string(), payer_id: z.string().optional() });
export const NessieTransfer = money.extend({ transaction_date: z.string(), payer_id: z.string(), payee_id: z.string() });
export const NessieBill = z.object({
  _id: z.string(),
  status,
  payee: z.string().default(""),
  nickname: z.string().default(""),
  payment_date: z.string().optional(),
  upcoming_payment_date: z.string().optional(),
  payment_amount: z.number(),
});

export interface NessieAccountBundle {
  account: z.infer<typeof NessieAccount>;
  deposits: z.infer<typeof NessieDeposit>[];
  withdrawals: z.infer<typeof NessieWithdrawal>[];
  purchases: z.infer<typeof NessiePurchase>[];
  transfers: z.infer<typeof NessieTransfer>[];
  bills: z.infer<typeof NessieBill>[];
}

// Nessie has no transaction categories, so classify by description. Vehicle costs are
// tagged separately so they can be excluded from "other spending" and shown as observed.
const RULES: [RegExp, TxnCategory][] = [
  [/payroll|salary|direct dep/i, "income"],
  [/refund|return credit/i, "refund"],
  [/auto (lease|loan)|car payment/i, "vehicle_payment"],
  [/gas station|fuel/i, "vehicle_fuel"],
  [/auto insurance/i, "vehicle_insurance"],
  [/oil change|tire|auto repair|brake service/i, "vehicle_maintenance"],
  [/rent|mortgage/i, "housing"],
  [/grocery|market/i, "groceries"],
  [/electric|water|internet|utility/i, "utilities"],
  [/restaurant|cafe|coffee|taco/i, "dining"],
  [/streaming|phone plan|gym|subscription/i, "subscriptions"],
  [/store|online order|pharmacy/i, "shopping"],
];
const categorize = (description: string, fallback: TxnCategory): TxnCategory =>
  RULES.find(([re]) => re.test(description))?.[1] ?? fallback;

const toCents = (dollars: number) => Math.round(dollars * 100);
const toStatus = (s: string): TxnStatus => (s === "executed" ? "completed" : (s as TxnStatus));

export function normalizeNessie(customerId: string, mode: BankingSnapshot["mode"], bundles: NessieAccountBundle[]): BankingSnapshot {
  const ownIds = new Set(bundles.map((b) => b.account._id));
  const accounts: Account[] = bundles.map(({ account: a }) => ({
    accountId: `acct_${a._id}`,
    providerRecordId: a._id,
    type: (["Checking", "Savings", "Credit Card"].includes(a.type) ? a.type : "Checking") as Account["type"],
    nickname: a.nickname,
    // Nessie reports a credit card balance as the amount owed.
    balanceCents: a.type === "Credit Card" ? -toCents(a.balance) : toCents(a.balance),
  }));

  const seen = new Set<string>();
  const txns: Transaction[] = [];
  const push = (t: Omit<Transaction, "transactionId">) => {
    if (seen.has(t.providerRecordId)) return; // a transfer appears on both accounts
    seen.add(t.providerRecordId);
    txns.push({ transactionId: `txn_${t.providerRecordId}`, ...t });
  };

  for (const b of bundles) {
    const accountId = `acct_${b.account._id}`;
    const base = (id: string, type: TxnType, s: string, amount: number, date: string, description: string) => ({
      providerRecordId: id,
      accountId,
      type,
      status: toStatus(s),
      amountCents: toCents(amount),
      effectiveAt: date.slice(0, 10),
      description,
    });
    for (const d of b.deposits) push({ ...base(d._id, "deposit", d.status, d.amount, d.transaction_date, d.description), category: categorize(d.description, "other") });
    for (const w of b.withdrawals) push({ ...base(w._id, "withdrawal", w.status, w.amount, w.transaction_date, w.description), category: categorize(w.description, "other") });
    for (const p of b.purchases) push({ ...base(p._id, "purchase", p.status, p.amount, p.purchase_date, p.description), category: categorize(p.description, "shopping") });
    for (const bill of b.bills) {
      const date = bill.payment_date ?? bill.upcoming_payment_date ?? "";
      const description = bill.payee || bill.nickname;
      const ownCard = /credit card payment/i.test(description);
      push({
        ...base(bill._id, "bill", bill.status, bill.payment_amount, date, description),
        category: ownCard ? "internal_transfer" : categorize(description, "other"),
      });
    }
    for (const t of b.transfers) {
      const internal = ownIds.has(t.payer_id) && ownIds.has(t.payee_id);
      push({
        ...base(t._id, "transfer", t.status, t.amount, t.transaction_date, t.description),
        category: internal ? "internal_transfer" : categorize(t.description, "other"),
        counterpartAccountId: `acct_${t.payer_id === b.account._id ? t.payee_id : t.payer_id}`,
      });
    }
  }
  txns.sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  return { customerId, mode, retrievedAt: new Date().toISOString(), accounts, transactions: txns };
}

