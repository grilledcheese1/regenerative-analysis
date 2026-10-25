import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "./password";

// Demo accounts. In memory everywhere; outside production also mirrored to a JSON file so a
// dev server restart keeps them. Vercel instances don't share memory, which the sign-in route
// explains to the user. Swap this module for a database to make accounts durable.

export interface AccountRecord {
  accountId: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}
export type PublicAccount = Pick<AccountRecord, "accountId" | "email" | "name">;

export class AuthNotConfigured extends Error {}

const DEV_SECRET = "regentic-dev-only-secret";
let warned = false;

/** AUTH_SECRET, or a fixed dev secret outside production. Production without one throws. */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new AuthNotConfigured("AUTH_SECRET is not set");
  if (!warned) {
    warned = true;
    console.warn("AUTH_SECRET is not set; using a dev-only secret for demo account sessions.");
  }
  return DEV_SECRET;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const toPublic = ({ accountId, email, name }: AccountRecord): PublicAccount => ({ accountId, email, name });

const g = globalThis as typeof globalThis & { __nmAccounts?: Map<string, AccountRecord> };

function file(): string | null {
  const f = process.env.ACCOUNTS_FILE;
  if (f === "off" || process.env.NODE_ENV === "production") return null;
  return f || path.join(process.cwd(), ".data", "accounts.json");
}

function store(): Map<string, AccountRecord> {
  if (g.__nmAccounts) return g.__nmAccounts;
  const m = new Map<string, AccountRecord>();
  const f = file();
  if (f) {
    try {
      for (const a of JSON.parse(readFileSync(f, "utf8")) as AccountRecord[]) m.set(a.email, a);
    } catch {
      // No file yet, or unreadable: start empty.
    }
  }
  return (g.__nmAccounts = m);
}

function persist() {
  const f = file();
  if (!f) return;
  try {
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify([...store().values()], null, 1));
  } catch {
    // Read-only filesystem: memory still works.
  }
}

export async function createAccount(input: { email: string; name: string; password: string }): Promise<AccountRecord | "email_taken"> {
  const email = normalizeEmail(input.email);
  if (store().has(email)) return "email_taken";
  const record: AccountRecord = {
    accountId: `acct_${randomBytes(8).toString("hex")}`,
    email,
    name: input.name.trim(),
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  // Re-check after the await so two simultaneous sign-ups can't both win.
  if (store().has(email)) return "email_taken";
  store().set(email, record);
  persist();
  return record;
}

export const findAccountByEmail = (email: string) => store().get(normalizeEmail(email));
export const accountCount = () => store().size;

export function resetAccountsForTests() {
  g.__nmAccounts = new Map();
}
