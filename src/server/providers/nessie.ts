import "server-only";
import { z } from "zod";
import type { BankingSnapshot } from "@/contracts";
import { nessieBundlesFromSpec, nessieFixture, type BankingSpec } from "@/fixtures/banking";
import { NessieAccount, NessieBill, NessieDeposit, NessieLoan, NessiePurchase, NessieTransfer, NessieWithdrawal, normalizeNessie } from "./nessie-normalize";

// ---------- Live sandbox access ----------

/** Nessie could not be reached, or refused the request. Messages never contain the key or URL. */
export class NessieUnavailable extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/** Nessie answered, but with records we could not read. `path` is the first bad field, never a value. */
export class NessieBadResponse extends Error {
  constructor(readonly path: string) {
    super("Nessie returned records we could not read");
  }
}

const REQUEST_TIMEOUT_MS = 8000;
const SYNC_BUDGET_MS = 20_000;
const RETRY_DELAYS_MS = [250, 750];
const MAX_IN_FLIGHT = 4;

// The plain-HTTP host refuses connections; only HTTPS works.
export const nessieBase = () => process.env.NESSIE_BASE_URL || "https://api.nessieisreal.com";

function apiKey(): string {
  const key = process.env.NESSIE_API_KEY;
  if (!key) throw new NessieUnavailable("NESSIE_API_KEY is not set", false);
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);

/** A tiny semaphore: at most `limit` tasks run at once. */
function limiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

interface GetOptions {
  /** List endpoints answer 404 "No … found" for an empty collection. */
  emptyOn404?: boolean;
  signal?: AbortSignal;
}

/**
 * GET with bounded retries on network errors, timeouts and 5xx. Never retries 4xx.
 * Exported for tests; use fetchSandbox / fetchCustomer instead.
 */
export async function nessieGet<T>(path: string, schema: z.ZodType<T>, opts: GetOptions = {}): Promise<T> {
  const key = apiKey();
  let lastError: NessieUnavailable | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(jitter(RETRY_DELAYS_MS[attempt - 1]));
    if (opts.signal?.aborted) throw new NessieUnavailable("Nessie took too long", true);
    let res: Response;
    try {
      const signal = opts.signal
        ? AbortSignal.any([opts.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      res = await fetch(`${nessieBase()}${path}?key=${encodeURIComponent(key)}`, { signal, cache: "no-store" });
    } catch {
      if (opts.signal?.aborted) throw new NessieUnavailable("Nessie took too long", true);
      lastError = new NessieUnavailable("Nessie did not respond", true);
      continue;
    }
    if (res.status === 404 && opts.emptyOn404) return schema.parse([]);
    if (res.status >= 500) {
      lastError = new NessieUnavailable(`Nessie returned HTTP ${res.status}`, true);
      continue;
    }
    if (!res.ok) throw new NessieUnavailable(`Nessie returned HTTP ${res.status}`, false);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new NessieBadResponse("(not JSON)");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new NessieBadResponse(parsed.error.issues[0]?.path.join(".") || "(root)");
    return parsed.data;
  }
  throw lastError ?? new NessieUnavailable("Nessie did not respond", true);
}

/** POST without retries (writes aren't idempotent). Returns the created object. Seeding only. */
export async function nessiePost(path: string, body: unknown): Promise<{ _id: string } & Record<string, unknown>> {
  const key = apiKey();
  let res: Response;
  try {
    res = await fetch(`${nessieBase()}${path}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new NessieUnavailable("Nessie did not respond", true);
  }
  const json = (await res.json().catch(() => null)) as { objectCreated?: Record<string, unknown> } | string | null;
  if (!res.ok) {
    // Validation messages name fields only, so they are safe to surface to a developer.
    const detail = typeof json === "string" ? `: ${json.split("\n").slice(0, 3).join(" ")}` : "";
    throw new NessieUnavailable(`Nessie rejected a write (HTTP ${res.status})${detail}`, false);
  }
  const created = typeof json === "object" && json ? json.objectCreated : undefined;
  const id = created?._id ?? created?.id;
  if (typeof id !== "string") throw new NessieBadResponse("objectCreated._id");
  return { ...created, _id: id };
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

/** Reads one Nessie customer's accounts and every account's records into a snapshot. */
export async function fetchCustomer(customerId: string): Promise<BankingSnapshot> {
  const budget = AbortSignal.timeout(SYNC_BUDGET_MS);
  const run = limiter(MAX_IN_FLIGHT);
  const list = <T>(path: string, schema: z.ZodType<T>) => run(() => nessieGet(path, schema, { emptyOn404: true, signal: budget }));

  const accounts = await list(`/customers/${customerId}/accounts`, z.array(NessieAccount));
  const bundles = await Promise.all(
    accounts.map(async (account) => {
      const base = `/accounts/${account._id}`;
      const [deposits, withdrawals, purchases, transfers, bills, loans] = await Promise.all([
        list(`${base}/deposits`, z.array(NessieDeposit)),
        list(`${base}/withdrawals`, z.array(NessieWithdrawal)),
        list(`${base}/purchases`, z.array(NessiePurchase)),
        list(`${base}/transfers`, z.array(NessieTransfer)),
        list(`${base}/bills`, z.array(NessieBill)),
        list(`${base}/loans`, z.array(NessieLoan)),
      ]);
      return { account, deposits, withdrawals, purchases, transfers, bills, loans };
    }),
  );
  return normalizeNessie(customerId, "sandbox", bundles);
}

export async function fetchSandbox(personaId: string, customerIdOverride?: string | null): Promise<BankingSnapshot> {
  const customerId = customerIdOverride ?? sandboxCustomerId(personaId);
  if (!customerId) throw new NessieUnavailable(`No Nessie customer mapped for ${personaId}`, false);
  return fetchCustomer(customerId);
}

/** The local bank history: a case study's fixture, or an onboarded user's history from their spec. */
export function fixtureSnapshot(personaId: string, spec?: BankingSpec): BankingSnapshot | null {
  const bundles = spec ? nessieBundlesFromSpec(personaId, spec) : nessieFixture(personaId);
  return bundles ? normalizeNessie(`fixture_${personaId}`, "fixture", bundles) : null;
}
