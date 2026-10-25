import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asOwner, cookiesMock, resetJar } from "../server/cookies";
import { felixAnswers, localBanking } from "./fixtures";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

beforeAll(() => {
  process.env.ACCOUNTS_FILE = "off";
});

const signup = await import("@/app/api/auth/signup/route");
const profileRoute = await import("@/app/api/me/profile/route");
const meData = await import("@/app/api/me/data/route");
const { userProfiles } = await import("@/server/profiles");
const { resetAccountsForTests } = await import("@/server/auth/accounts");

const json = (method: string, body?: unknown) =>
  new Request("http://test/api/me/profile", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("/api/me/profile", () => {
  let accountId = "";
  beforeEach(async () => {
    resetAccountsForTests();
    resetJar();
    asOwner("a");
    const res = await signup.POST(json("POST", { name: "Felix", email: `f-${Math.random()}@x.com`, password: "password123" }));
    accountId = (await res.json()).account.accountId;
  });

  it("round-trips a profile", async () => {
    const put = await profileRoute.PUT(json("PUT", { answers: felixAnswers, banking: localBanking }));
    expect(put.status).toBe(200);
    const got = await profileRoute.GET();
    expect(got.status).toBe(200);
    const { profile } = await got.json();
    expect(profile.personaId).toBe(`u_${accountId}`);
    expect(profile.answers.name).toBe("Felix");
  });

  it("answers 404 before onboarding and 401 when signed out", async () => {
    expect((await profileRoute.GET()).status).toBe(404);
    resetJar();
    expect((await profileRoute.GET()).status).toBe(401);
    expect((await profileRoute.PUT(json("PUT", { answers: felixAnswers, banking: localBanking }))).status).toBe(401);
  });

  it("rejects invalid answers with field errors", async () => {
    const res = await profileRoute.PUT(json("PUT", { answers: { ...felixAnswers, driving: { ...felixAnswers.driving, monthlyMiles: -5 } }, banking: localBanking }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fieldErrors["driving.monthlyMiles"]).toBeTruthy();
  });

  it("restores a lost server record from the same body", async () => {
    await profileRoute.PUT(json("PUT", { answers: felixAnswers, banking: localBanking }));
    userProfiles.remove(accountId, "profile");
    expect((await profileRoute.GET()).status).toBe(404);
    await profileRoute.PUT(json("PUT", { answers: felixAnswers, banking: localBanking }));
    expect((await profileRoute.GET()).status).toBe(200);
  });

  it("deleting demo data removes the profile but keeps the account", async () => {
    await profileRoute.PUT(json("PUT", { answers: felixAnswers, banking: localBanking }));
    await meData.DELETE();
    expect((await profileRoute.GET()).status).toBe(404);
  });
});
