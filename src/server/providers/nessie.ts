import "server-only";
import { z } from "zod";
import type { BankingSnapshot } from "@/contracts";
import { nessieFixture } from "@/fixtures/banking";
import { NessieAccount, NessieBill, NessieDeposit, NessiePurchase, NessieTransfer, NessieWithdrawal, normalizeNessie } from "./nessie-normalize";

// ---------- Live sandbox reads ----------

export class NessieUnavailable extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

const NESSIE_TIMEOUT_MS = 8000;

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const base = process.env.NESSIE_BASE_URL ?? "http://api.nessieisreal.com";
  const key = process.env.NESSIE_API_KEY;
  if (!key) throw new NessieUnavailable("NESSIE_API_KEY is not set", false);
  let res: Response;
  try {
    res = await fetch(`${base}${path}?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(NESSIE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new NessieUnavailable("Nessie did not respond", true);
  }
  if (!res.ok) throw new NessieUnavailable(`Nessie returned HTTP ${res.status}`, res.status >= 500);
  return schema.parse(await res.json());
}

/** Map persona ids to team-controlled Nessie customer ids, e.g. NESSIE_CUSTOMERS="maria:abc,devon:def". */
export function sandboxCustomerId(personaId: string): string | null {
  const map = Object.fromEntries(
    (process.env.NESSIE_CUSTOMERS ?? "")
      .split(",")
      .map((pair) => pair.split(":").map((s) => s.trim()))
      .filter((p) => p.length === 2 && p[0] && p[1]),
  );
  return map[personaId] ?? null;
}

export async function fetchSandbox(personaId: string): Promise<BankingSnapshot> {
  const customerId = sandboxCustomerId(personaId);
  if (!customerId) throw new NessieUnavailable(`No Nessie customer mapped for ${personaId}`, false);
  const accounts = await get(`/customers/${customerId}/accounts`, z.array(NessieAccount));
  const bundles = await Promise.all(
    accounts.map(async (account) => ({
      account,
      deposits: await get(`/accounts/${account._id}/deposits`, z.array(NessieDeposit)),
      withdrawals: await get(`/accounts/${account._id}/withdrawals`, z.array(NessieWithdrawal)),
      purchases: await get(`/accounts/${account._id}/purchases`, z.array(NessiePurchase)),
      transfers: await get(`/accounts/${account._id}/transfers`, z.array(NessieTransfer)),
      bills: await get(`/accounts/${account._id}/bills`, z.array(NessieBill)),
    })),
  );
  return normalizeNessie(customerId, "sandbox", bundles);
}

export function fixtureSnapshot(personaId: string): BankingSnapshot | null {
  const bundles = nessieFixture(personaId);
  return bundles ? normalizeNessie(`fixture_${personaId}`, "fixture", bundles) : null;
}
