import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.ACCOUNTS_FILE = "off";
});

const { accountCount, AuthNotConfigured, authSecret, createAccount, findAccountByEmail, resetAccountsForTests } = await import("@/server/auth/accounts");

describe("account store", () => {
  beforeEach(() => resetAccountsForTests());
  afterEach(() => vi.unstubAllEnvs());

  it("stores a hashed password, never the plain text", async () => {
    const a = await createAccount({ email: "felix@x.com", name: "Felix", password: "password123" });
    if (a === "email_taken") throw new Error("unexpected");
    expect(a.accountId).toMatch(/^acct_[0-9a-f]{16}$/);
    expect(a.passwordHash).not.toContain("password123");
    expect(a.passwordHash).toMatch(/^scrypt\$/);
    expect(accountCount()).toBe(1);
  });

  it("treats emails that differ only in case or spaces as the same", async () => {
    await createAccount({ email: "felix@x.com", name: "Felix", password: "password123" });
    expect(await createAccount({ email: " FELIX@x.com ", name: "Felix 2", password: "password123" })).toBe("email_taken");
    expect(findAccountByEmail("Felix@X.com")?.name).toBe("Felix");
  });

  it("refuses to sign with the dev secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => authSecret()).toThrow(AuthNotConfigured);
    vi.stubEnv("AUTH_SECRET", "a-real-secret");
    expect(authSecret()).toBe("a-real-secret");
  });
});
