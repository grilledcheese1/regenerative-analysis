import { beforeEach, describe, expect, it, vi } from "vitest";
import { asOwner, cookiesMock, ownerUuid, setCookies } from "./cookies";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

const { ownerId } = await import("@/server/session");
const { deleteOwnerData, ownedStore } = await import("@/server/store");
const { withIdempotency } = await import("@/server/http");

describe("session", () => {
  beforeEach(() => {
    setCookies.length = 0;
  });

  it("reuses a valid nm_sid cookie", async () => {
    asOwner("a");
    expect(await ownerId()).toBe(ownerUuid("a"));
    expect(setCookies).toHaveLength(0);
  });

  it("creates the cookie when it is missing", async () => {
    asOwner(null);
    const id = await ownerId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(setCookies).toEqual([{ name: "nm_sid", value: id }]);
  });
});

describe("owned store", () => {
  it("keeps owners isolated", () => {
    const s = ownedStore<string>("t_isolation");
    s.put("A", "x", "secret");
    expect(s.get("A", "x")).toBe("secret");
    expect(s.get("B", "x")).toBeUndefined();
    expect(s.list("B")).toEqual([]);
  });

  it("lists newest first and evicts the oldest past maxPerOwner", () => {
    const s = ownedStore<number>("t_evict", { maxPerOwner: 2 });
    s.put("A", "1", 1);
    s.put("A", "2", 2);
    s.put("A", "3", 3);
    expect(s.list("A")).toEqual([3, 2]);
    expect(s.get("A", "1")).toBeUndefined();
  });

  it("deleteOwnerData clears every store for that owner only", () => {
    const one = ownedStore<number>("t_del_one");
    const two = ownedStore<number>("t_del_two");
    one.put("A", "k", 1);
    two.put("A", "k", 2);
    two.put("B", "k", 3);
    const { stores } = deleteOwnerData("A");
    expect(stores).toEqual(expect.arrayContaining(["t_del_one", "t_del_two"]));
    expect(one.get("A", "k")).toBeUndefined();
    expect(two.get("A", "k")).toBeUndefined();
    expect(two.get("B", "k")).toBe(3);
  });
});

describe("idempotency", () => {
  const post = (body: string, key?: string) =>
    new Request("http://test/api/x", {
      method: "POST",
      body,
      headers: key ? { "idempotency-key": key } : {},
    });

  it("replays the stored response for the same key and body", async () => {
    let runs = 0;
    const run = async () => Response.json({ n: ++runs }, { status: 201 });
    const first = await withIdempotency(post('{"a":1}', "k1"), "A", "x", run);
    const second = await withIdempotency(post('{"a":1}', "k1"), "A", "x", run);
    expect(await first.json()).toEqual({ n: 1 });
    expect(await second.json()).toEqual({ n: 1 });
    expect(second.headers.get("idempotent-replay")).toBe("true");
    expect(runs).toBe(1);
  });

  it("rejects the same key with a different body", async () => {
    const run = async () => Response.json({}, { status: 201 });
    await withIdempotency(post('{"a":1}', "k2"), "A", "x", run);
    const res = await withIdempotency(post('{"a":2}', "k2"), "A", "x", run);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("idempotency_conflict");
  });

  it("runs every time without a key, and does not store failures", async () => {
    let runs = 0;
    const fail = async () => Response.json({ n: ++runs }, { status: 500 });
    await withIdempotency(post("{}", "k3"), "A", "x", fail);
    await withIdempotency(post("{}", "k3"), "A", "x", fail);
    await withIdempotency(post("{}"), "A", "x", fail);
    expect(runs).toBe(3);
  });
});
