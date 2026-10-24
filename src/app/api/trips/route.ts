// GET /api/trips -> TripHeader[] for every route, driver, condition and regen on/off
// Optional filters: ?route=hill&driver=smooth&condition=wet&regen=true

import type { NextRequest } from "next/server";
import { listTripHeaders } from "../_lib/trips";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const headers = (await listTripHeaders()).filter(
    (h) =>
      (!q.get("route") || h.tripId.startsWith(`${q.get("route")}-`)) &&
      (!q.get("driver") || h.driver === q.get("driver")) &&
      (!q.get("condition") || h.condition === q.get("condition")) &&
      (!q.get("regen") || String(h.regenEnabled) === q.get("regen")),
  );
  return Response.json(headers);
}
