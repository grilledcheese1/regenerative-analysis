import { listHeaders } from "../../../../scripts/lib/trips-store.ts";

// GET /api/trips?route=&driver=&condition=&regen=true|false  ->  TripHeader[]
export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const route = q.get("route");
  const driver = q.get("driver");
  const condition = q.get("condition");
  const regen = q.get("regen");
  const headers = listHeaders().filter(
    (h) =>
      (!route || h.tripId.startsWith(`${route}-`)) &&
      (!driver || h.driver === driver) &&
      (!condition || h.condition === condition) &&
      (regen === null || String(h.regenEnabled) === regen),
  );
  return Response.json(headers);
}
