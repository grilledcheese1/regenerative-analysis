import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImportPreview } from "@/contracts";
import type { DemoRoute } from "@/lib/mock/route";
import { asOwner, cookiesMock } from "../server/cookies";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
const importsRoute = await import("@/app/api/imports/route");
const confirmRoute = await import("@/app/api/imports/[id]/confirm/route");
const replayRoute = await import("@/app/api/drives/[id]/route/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function importConfirmed(): Promise<string> {
  const name = "demo-drive-2-errand.gpx";
  const form = new FormData();
  form.set("file", new File([readFileSync(path.join(process.cwd(), "docs/demo/drives", name), "utf8")], name));
  form.set("vehicleId", "devon");
  const { preview } = (await (await importsRoute.POST(new Request("http://t/api/imports", { method: "POST", body: form }))).json()) as { preview: ImportPreview };
  const res = await confirmRoute.POST(
    new Request(`http://t/api/imports/${preview.importId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ driverConfirmed: true, vehicleId: "devon" }) }),
    ctx(preview.importId),
  );
  return ((await res.json()) as { tripIds: string[] }).tripIds[0];
}

describe("GET /api/drives/[id]/route", () => {
  it("serves the replay route built when the trip was confirmed", async () => {
    asOwner("a");
    const tripId = await importConfirmed();
    const res = await replayRoute.GET(new Request("http://t"), ctx(tripId));
    expect(res.status).toBe(200);
    const { route } = (await res.json()) as { route: DemoRoute };
    expect(route.stepM).toBe(10);
    expect(route.points.length).toBeGreaterThan(100);
    expect(route.stopsM.length).toBeGreaterThan(1);
  });

  it("is private to the owner who imported it", async () => {
    asOwner("a");
    const tripId = await importConfirmed();
    asOwner("b");
    expect((await replayRoute.GET(new Request("http://t"), ctx(tripId))).status).toBe(404);
  });
});
