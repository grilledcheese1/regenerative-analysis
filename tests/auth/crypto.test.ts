import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { signSession, verifySession } from "@/server/auth/token";

describe("passwords", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse");
    expect(h).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong horse", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("hashes the same password differently each time", async () => {
    expect(await hashPassword("pw123456")).not.toBe(await hashPassword("pw123456"));
  });
});

describe("session tokens", () => {
  it("round-trips a session and rejects tampering, the wrong secret and expiry", () => {
    const p = { accountId: "acct_1", email: "a@b.co", name: "Ana", exp: 2_000 };
    const t = signSession(p, "s1");
    expect(verifySession(t, "s1", 1_000)).toEqual(p);
    expect(verifySession(t, "s2", 1_000)).toBeNull();
    expect(verifySession(t.replace(/^./, "x"), "s1", 1_000)).toBeNull();
    expect(verifySession(t, "s1", 2_001)).toBeNull();
    expect(verifySession(undefined, "s1")).toBeNull();
    expect(verifySession("not-a-token", "s1")).toBeNull();
  });
});
