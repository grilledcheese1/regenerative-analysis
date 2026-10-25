import "server-only";
import { buildBudget } from "@/domain/finance/budget";
import { nessieFixture } from "@/fixtures/banking";
import { DEMO_AS_OF, persona } from "@/fixtures/personas";
import { fetchCustomer, fixtureSnapshot, nessieGet, nessiePost } from "./nessie";
import { z } from "zod";

// Seeds team-controlled Nessie sandbox customers from the same records as the fixture, so a
// live sync should produce the fixture's budget. Shapes follow the live API as probed on
// 2026-10-24: transfers take no payer/payee (they're created on the sending account), purchases
// need a merchant, bills must carry recurring_date (one without it breaks the account's bill
// list), and deposit/purchase amounts are whole dollars (Nessie truncates decimals).

export const DEMO_MERCHANT = "NextMove Demo Merchant";
const ADDRESS = { street_number: "1", street_name: "Speedway", city: "Austin", state: "TX", zip: "78705" };

export interface SeedWrite {
  path: string; // relative to the account, e.g. "deposits"
  body: Record<string, unknown>;
}

export interface AccountPlan {
  fixtureAccountId: string;
  create: { type: string; nickname: string; rewards: number; balance: number };
  writes: SeedWrite[];
}

export interface PersonaPlan {
  personaId: string;
  customer: { first_name: string; last_name: string; address: typeof ADDRESS };
  accounts: AccountPlan[];
  warnings: string[];
}

const dayOfMonth = (date: string) => Number(date.slice(8, 10));

/** The writes needed to reproduce one persona's fixture. Pure: no network. */
export function planPersona(personaId: string, runId: string): PersonaPlan {
  const p = persona(personaId);
  const bundles = nessieFixture(personaId);
  if (!p || !bundles) throw new Error(`Unknown persona ${personaId}`);
  const warnings: string[] = [];
  const whole = (amount: number, what: string) => {
    if (!Number.isInteger(amount)) warnings.push(`${what} ${amount} would be truncated by Nessie`);
    return amount;
  };
  const seenTransfers = new Set<string>();

  const accounts: AccountPlan[] = bundles.map((b) => {
    const writes: SeedWrite[] = [];
    for (const d of b.deposits) {
      writes.push({ path: "deposits", body: { medium: "balance", transaction_date: d.transaction_date, status: d.status, amount: whole(d.amount, "deposit"), description: d.description } });
    }
    for (const w of b.withdrawals) {
      writes.push({ path: "withdrawals", body: { medium: "balance", transaction_date: w.transaction_date, status: w.status, amount: whole(w.amount, "withdrawal"), description: w.description } });
    }
    for (const pur of b.purchases) {
      writes.push({ path: "purchases", body: { merchant_id: "$merchant", medium: "balance", purchase_date: pur.purchase_date, amount: whole(pur.amount, "purchase"), status: pur.status, description: pur.description } });
    }
    for (const bill of b.bills) {
      const date = bill.payment_date ?? bill.upcoming_payment_date!;
      writes.push({
        path: "bills",
        body: { status: bill.status, payee: bill.payee, nickname: bill.nickname, payment_date: date, recurring_date: dayOfMonth(date), payment_amount: bill.payment_amount },
      });
    }
    for (const t of b.transfers) {
      // The fixture lists a transfer on both accounts; the API records it once, on the sender.
      if (seenTransfers.has(t._id) || (t.payer_id && t.payer_id !== b.account._id)) continue;
      seenTransfers.add(t._id);
      writes.push({ path: "transfers", body: { transaction_date: t.transaction_date, status: t.status, amount: whole(t.amount, "transfer"), description: t.description } });
    }
    return {
      fixtureAccountId: b.account._id,
      create: { type: b.account.type, nickname: b.account.nickname, rewards: 0, balance: whole(b.account.balance, "balance") },
      writes,
    };
  });

  const first = p.profile.displayName.split(" ")[0] || personaId;
  return { personaId, customer: { first_name: first, last_name: `NextMoveDemo-${runId}`, address: ADDRESS }, accounts, warnings };
}

export const planCounts = (plan: PersonaPlan) => {
  const counts: Record<string, number> = { customers: 1, accounts: plan.accounts.length };
  for (const a of plan.accounts) for (const w of a.writes) counts[w.path] = (counts[w.path] ?? 0) + 1;
  return counts;
};

const Merchants = z.array(z.object({ _id: z.string(), name: z.string() }).passthrough());

/** Reuses the demo merchant if it exists, otherwise creates it. */
async function demoMerchantId(): Promise<string> {
  const existing = (await nessieGet("/merchants", Merchants, { emptyOn404: true })).find((m) => m.name === DEMO_MERCHANT);
  if (existing) return existing._id;
  return (await nessiePost("/merchants", { name: DEMO_MERCHANT, category: "demo", address: ADDRESS, geocode: { lat: 30.2849, lng: -97.7341 } }))._id;
}

export interface BudgetDiff {
  [field: string]: { fixture: number; sandbox: number };
}

const COMPARED = ["recurringIncomeCents", "otherMonthlySpendingCents", "vehicleBudgetCents", "availableUpfrontCashCents"] as const;

/** Executes a plan against the live sandbox, then reads it back and compares budgets with the fixture. */
export async function seedPersona(plan: PersonaPlan): Promise<{ customerId: string; written: Record<string, number>; diff: BudgetDiff }> {
  const merchantId = await demoMerchantId();
  const customerId = (await nessiePost("/customers", plan.customer))._id;
  const written: Record<string, number> = { customers: 1 };
  const bump = (k: string) => (written[k] = (written[k] ?? 0) + 1);

  // Accounts in parallel; each account's records in order.
  await Promise.all(
    plan.accounts.map(async (a) => {
      const accountId = (await nessiePost(`/customers/${customerId}/accounts`, a.create))._id;
      bump("accounts");
      for (const w of a.writes) {
        const body = w.body.merchant_id === "$merchant" ? { ...w.body, merchant_id: merchantId } : w.body;
        await nessiePost(`/accounts/${accountId}/${w.path}`, body);
        bump(w.path);
      }
    }),
  );

  const p = persona(plan.personaId)!;
  const live = buildBudget(await fetchCustomer(customerId), p.profile, DEMO_AS_OF);
  const fixture = buildBudget(fixtureSnapshot(plan.personaId)!, p.profile, DEMO_AS_OF);
  const diff: BudgetDiff = {};
  for (const k of COMPARED) if (live[k] !== fixture[k]) diff[k] = { fixture: fixture[k], sandbox: live[k] };
  return { customerId, written, diff };
}
