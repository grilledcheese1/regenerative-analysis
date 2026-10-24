import { isValidId, readTrip } from "../../../../scripts/lib/trips-store.ts";

// GET /api/compare?ids=a,b  ->  Trip[]  (2 to 4 ids)
export function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length < 2 || ids.length > 4) return Response.json({ error: "Provide 2 to 4 trip ids in ?ids=a,b" }, { status: 400 });
  if (!ids.every(isValidId)) return Response.json({ error: "Invalid trip id" }, { status: 400 });
  const trips = ids.map(readTrip);
  const missing = ids.filter((_, i) => !trips[i]);
  if (missing.length) return Response.json({ error: `Trip not found: ${missing.join(", ")}` }, { status: 404 });
  return Response.json(trips);
}
