import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImportPreview } from "@/contracts";
import { asOwner, cookiesMock } from "../server/cookies";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
const importsRoute = await import("@/app/api/imports/route");

const DIR = path.join(process.cwd(), "docs", "demo", "drives");

// The hand-import demo files must parse as clean, observed drives.
describe.each(["demo-drive-1-commute.gpx", "demo-drive-2-errand.gpx"])("%s", (name) => {
  it("imports as an observed GPX drive with timing and events", async () => {
    asOwner("b");
    const form = new FormData();
    form.set("file", new File([readFileSync(path.join(DIR, name), "utf8")], name));
    form.set("vehicleId", "maria");
    const res = await importsRoute.POST(new Request("http://test/api/imports", { method: "POST", body: form }));
    expect(res.status).toBe(201);
    const { preview } = (await res.json()) as { preview: ImportPreview };
    expect(preview.source).toEqual({ kind: "gpx_upload", mode: "observed" });
    expect(preview.summary.distanceMeters).toBeGreaterThan(5000);
    expect(preview.summary.durationS.known).toBe(true);
    expect(preview.summary.sharpDecelEvents.known).toBe(true);
  });
});
