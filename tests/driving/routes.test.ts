import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImportPreview, TripRecord } from "@/contracts";
import { asOwner, cookiesMock } from "../server/cookies";
import { gpx, northTrack } from "./fixtures/gpx";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

const importsRoute = await import("@/app/api/imports/route");
const importRoute = await import("@/app/api/imports/[id]/route");
const confirmRoute = await import("@/app/api/imports/[id]/confirm/route");
const drivesRoute = await import("@/app/api/drives/route");
const driveRoute = await import("@/app/api/drives/[id]/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// Each test uses distinct bytes so the per-owner dedup doesn't leak between tests.
let seq = 0;
const uniqueGpx = () => gpx([northTrack(30, { start: ++seq * 1000 })]);

function upload(text: string, { name = "drive.gpx", vehicleId = "maria", sample = false } = {}) {
  const form = new FormData();
  form.set("file", new File([text], name));
  form.set("vehicleId", vehicleId);
  if (sample) form.set("sample", "1");
  return importsRoute.POST(new Request("http://test/api/imports", { method: "POST", body: form }));
}
const confirm = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  confirmRoute.POST(
    new Request(`http://test/api/imports/${id}/confirm`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }),
    ctx(id),
  );
const preview = async (res: Response) => ((await res.json()) as { preview: ImportPreview }).preview;
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const drives = async (vehicleId = "maria") =>
  ((await (await drivesRoute.GET(new Request(`http://test/api/drives?vehicleId=${vehicleId}`))).json()) as { trips: TripRecord[] }).trips;

describe("POST /api/imports", () => {
  it("A4: Content-Length over the limit is a 413 without reading the body", async () => {
    let pulled = false;
    // highWaterMark 0: the stream only pulls when someone actually reads the body.
    const body = new ReadableStream(
      {
        pull() {
          pulled = true;
          throw new Error("body was read");
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request("http://test/api/imports", {
      method: "POST",
      headers: { "content-length": String(5 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
    const res = await importsRoute.POST(req);
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe("file_too_large");
    expect(pulled).toBe(false);
  });

  it("an oversized file is a 413 even when Content-Length is missing or lies", async () => {
    const res = await upload("x".repeat(4 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });

  it("returns a 201 preview for a GPX upload, labeled observed", async () => {
    asOwner("a");
    const res = await upload(uniqueGpx());
    expect(res.status).toBe(201);
    const p = await preview(res);
    expect(p).toMatchObject({ state: "preview_ready", format: "gpx", vehicleId: "maria", source: { kind: "gpx_upload", mode: "observed" } });
    expect(p.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p).not.toHaveProperty("bytes");
  });

  it("refuses unknown vehicles, other extensions, archives, bad UTF-8 and unknown samples", async () => {
    asOwner("a");
    const bad = await upload(uniqueGpx(), { vehicleId: "nobody" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { fieldErrors: Record<string, string> } }).error.fieldErrors.vehicleId).toBeTruthy();
    expect(await errorCode(await upload("hello", { name: "drive.kml" }))).toBe("unsupported_format");
    expect(await errorCode(await upload("PK\x03\x04zipdata", { name: "drive.gpx" }))).toBe("archive_not_supported");
    const latin1 = new FormData();
    latin1.set("file", new File([new Uint8Array([0x3c, 0x67, 0x70, 0x78, 0xff, 0xfe])], "drive.gpx"));
    latin1.set("vehicleId", "maria");
    expect(await errorCode(await importsRoute.POST(new Request("http://test/api/imports", { method: "POST", body: latin1 })))).toBe("unsupported_encoding");
    expect(await errorCode(await upload(uniqueGpx(), { name: "made-up.gpx", sample: true }))).toBe("unknown_sample");
    expect(await errorCode(await upload("<gpx/>", { name: "drive.csv" }))).toBe("unsupported_format");
  });

  it("maps parser failures and keeps the failed job inspectable", async () => {
    asOwner("a");
    const xxe = await upload(`<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx>&x;</gpx>`);
    expect(xxe.status).toBe(400);
    expect(await errorCode(xxe)).toBe("unsupported_xml_feature");
    const csv = await upload("a,b,c\n1,2,3", { name: "drive.csv" });
    expect(await errorCode(csv)).toBe("csv_header_mismatch");
    const route = await upload(`<gpx><rte><rtept lat="1" lon="1"/></rte></gpx>`);
    expect(route.status).toBe(422);
  });

  it("marks sample uploads synthetic", async () => {
    asOwner("b");
    const text = readFileSync(path.join(process.cwd(), "public/samples/devon-errand.gpx"), "utf8");
    const p = await preview(await upload(text, { name: "devon-errand.gpx", vehicleId: "devon", sample: true }));
    expect(p.source).toEqual({ kind: "sample", mode: "synthetic" });
    expect(p.quality.findings.map((f) => f.code)).toContain("synthetic_sample");
  });
});

describe("confirm, cancel and drives", () => {
  it("A13: the same bytes twice → 200 duplicateOf, one job; after confirming, one trip", async () => {
    asOwner("a");
    const text = uniqueGpx();
    const first = await preview(await upload(text));
    const again = await upload(text);
    expect(again.status).toBe(200);
    expect((await preview(again)).duplicateOf).toBe(first.importId);

    const before = (await drives()).length;
    expect((await confirm(first.importId, { driverConfirmed: true, vehicleId: "maria" })).status).toBe(201);
    const third = await upload(text);
    expect(third.status).toBe(200);
    const dup = await preview(third);
    expect(dup).toMatchObject({ duplicateOf: first.importId, state: "confirmed" });
    expect((await drives()).length).toBe(before + 1);
  });

  it("A14: another owner can't see the import or the trips", async () => {
    asOwner("a");
    const p = await preview(await upload(uniqueGpx(), { vehicleId: "kai" }));
    await confirm(p.importId, { driverConfirmed: true, vehicleId: "kai" });
    expect((await importRoute.GET(new Request("http://test"), ctx(p.importId))).status).toBe(200);
    const [trip] = await drives("kai");
    expect((await driveRoute.GET(new Request("http://test"), ctx(trip.tripId))).status).toBe(200);

    asOwner("b");
    const res = await importRoute.GET(new Request("http://test"), ctx(p.importId));
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("not_found");
    expect(await drives("kai")).toEqual([]);
    expect((await driveRoute.GET(new Request("http://test"), ctx(trip.tripId))).status).toBe(404);
    expect((await confirm(p.importId, { driverConfirmed: true, vehicleId: "kai" })).status).toBe(404);
  });

  it("A15: confirming without driverConfirmed: true is a 400", async () => {
    asOwner("a");
    const p = await preview(await upload(uniqueGpx()));
    expect((await confirm(p.importId, { vehicleId: "maria" })).status).toBe(400);
    expect((await confirm(p.importId, { driverConfirmed: false, vehicleId: "maria" })).status).toBe(400);
    expect((await confirm(p.importId, { driverConfirmed: "true", vehicleId: "maria" })).status).toBe(400);
    expect((await confirm(p.importId, { driverConfirmed: true, vehicleId: "devon" })).status).toBe(400);
  });

  it("A16: cancel then confirm → 409 import_not_confirmable", async () => {
    asOwner("a");
    const p = await preview(await upload(uniqueGpx()));
    const del = await importRoute.DELETE(new Request("http://test", { method: "DELETE" }), ctx(p.importId));
    expect(del.status).toBe(200);
    expect((await preview(del)).state).toBe("cancelled");
    const res = await confirm(p.importId, { driverConfirmed: true, vehicleId: "maria" });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("import_not_confirmable");
  });

  it("a cancelled upload can be imported again as a new job", async () => {
    asOwner("a");
    const text = uniqueGpx();
    const p = await preview(await upload(text));
    await importRoute.DELETE(new Request("http://test", { method: "DELETE" }), ctx(p.importId));
    const again = await upload(text);
    expect(again.status).toBe(201);
    expect((await preview(again)).importId).not.toBe(p.importId);
  });

  it("confirmed imports can't be cancelled; unusable routes can't be confirmed", async () => {
    asOwner("a");
    const p = await preview(await upload(uniqueGpx()));
    await confirm(p.importId, { driverConfirmed: true, vehicleId: "maria" });
    expect((await importRoute.DELETE(new Request("http://test", { method: "DELETE" }), ctx(p.importId))).status).toBe(409);

    const tiny = await preview(await upload(gpx([northTrack(4, { start: ++seq * 1000 })])));
    expect(tiny.quality.routeAvailable).toBe(false);
    const res = await confirm(tiny.importId, { driverConfirmed: true, vehicleId: "maria" });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("trip_not_usable");
  });

  it("confirm replays with the same Idempotency-Key and returns the same trips without a key", async () => {
    asOwner("a");
    const p = await preview(await upload(uniqueGpx()));
    const body = { driverConfirmed: true, vehicleId: "maria" };
    const first = await confirm(p.importId, body, { "idempotency-key": `k-${p.importId}` });
    const replay = await confirm(p.importId, body, { "idempotency-key": `k-${p.importId}` });
    expect(replay.headers.get("idempotent-replay")).toBe("true");
    const { tripIds } = (await first.json()) as { tripIds: string[] };
    expect(((await replay.json()) as { tripIds: string[] }).tripIds).toEqual(tripIds);
    const plain = await confirm(p.importId, body);
    expect(plain.status).toBe(200);
    expect(((await plain.json()) as { tripIds: string[] }).tripIds).toEqual(tripIds);
  });

  it("one trip per source track, gap segments kept inside the trip, drives newest first", async () => {
    asOwner("b");
    const a = northTrack(30, { start: ++seq * 1000 });
    const b = northTrack(30, { start: seq * 1000 + 200 }); // 2nd half after a long gap
    const twoTracks = gpx([[...a, ...b], northTrack(30, { start: seq * 1000 + 600 })]).replace("</trkseg><trkseg>", "</trkseg></trk><trk><trkseg>");
    const p = await preview(await upload(twoTracks, { vehicleId: "devon" }));
    const { tripIds } = (await (await confirm(p.importId, { driverConfirmed: true, vehicleId: "devon" })).json()) as { tripIds: string[] };
    expect(tripIds).toHaveLength(2);
    const list = await drives("devon");
    const mine = list.filter((t) => tripIds.includes(t.tripId));
    expect(mine.find((t) => t.segmentBreaks.length === 1)).toBeTruthy();
    expect(list[0].createdAt >= list.at(-1)!.createdAt).toBe(true);
    expect(mine.every((t) => t.driverConfirmed && !("points" in t))).toBe(true);
  });
});
