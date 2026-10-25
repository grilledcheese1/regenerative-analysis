import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookiesMock, resetJar } from "../server/cookies";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

beforeAll(() => {
  process.env.ACCOUNTS_FILE = "off";
});

const signup = await import("@/app/api/auth/signup/route");
const signin = await import("@/app/api/auth/signin/route");
const signout = await import("@/app/api/auth/signout/route");
const me = await import("@/app/api/auth/me/route");
const { resetAccountsForTests } = await import("@/server/auth/accounts");

const post = (body: unknown) =>
  new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const whoAmI = async () => ((await (await me.GET()).json()) as { account: { name: string } | null }).account;
const felix = { name: "Felix", email: "felix@example.com", password: "password123" };

describe("auth routes", () => {
  beforeEach(() => {
    resetAccountsForTests();
    resetJar();
  });

  it("signs up, then me returns the account", async () => {
    const res = await signup.POST(post(felix));
    expect(res.status).toBe(201);
    expect((await res.json()).account).toMatchObject({ name: "Felix", email: "felix@example.com" });
    expect(await whoAmI()).toMatchObject({ name: "Felix" });
  });

  it("rejects a duplicate email that differs only in case or spaces", async () => {
    await signup.POST(post(felix));
    const res = await signup.POST(post({ ...felix, email: " FELIX@Example.com " }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("email_taken");
  });

  it("returns field errors for a bad email and a short password", async () => {
    const res = await signup.POST(post({ name: "F", email: "nope", password: "1234567" }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.fieldErrors.email).toBeTruthy();
    expect(error.fieldErrors.password).toBeTruthy();
  });

  it("answers a wrong password and an unknown email the same way", async () => {
    await signup.POST(post(felix));
    const wrong = await signin.POST(post({ email: felix.email, password: "wrongpass1" }));
    const unknownEmail = await signin.POST(post({ email: "nobody@example.com", password: "wrongpass1" }));
    expect(wrong.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const strip = async (r: Response) => {
      const { error } = await r.json();
      return { ...error, requestId: undefined };
    };
    expect(await strip(wrong)).toEqual(await strip(unknownEmail));
    expect((await strip(await signin.POST(post({ email: felix.email, password: "x" })))).message).toBe("Email or password is incorrect");
  });

  it("signs in with the right password", async () => {
    await signup.POST(post(felix));
    resetJar();
    expect(await whoAmI()).toBeNull();
    const res = await signin.POST(post({ email: "Felix@Example.com", password: felix.password }));
    expect(res.status).toBe(200);
    expect(await whoAmI()).toMatchObject({ name: "Felix" });
  });

  it("keeps the session after the store resets, and explains the failed sign-in", async () => {
    await signup.POST(post(felix));
    resetAccountsForTests();
    expect(await whoAmI()).toMatchObject({ name: "Felix" });
    const res = await signin.POST(post({ email: felix.email, password: felix.password }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.hint).toBe("Accounts reset when the demo server restarts. Create it again.");
  });

  it("signs out", async () => {
    await signup.POST(post(felix));
    expect((await signout.POST()).status).toBe(204);
    expect(await whoAmI()).toBeNull();
  });
});
