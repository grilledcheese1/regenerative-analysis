import { isValidId, readTrip } from "../../../../scripts/lib/trips-store.ts";

const CONDITIONS = ["dry", "wet", "snow", "mud"];

// GET /api/compare?ids=a,b  ->  Trip[]  (2 to 4 ids)
// GET /api/compare?route=hilly&condition=wet  ->  Trip[]: conventional (smooth, regen off), smooth, aggressive
export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  let ids = (q.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 && q.get("route")) {
    const route = q.get("route")!;
    const condition = q.get("condition") ?? "dry";
    if (!CONDITIONS.includes(condition)) return Response.json({ error: `condition must be one of ${CONDITIONS.join(", ")}` }, { status: 400 });
    ids = [`${route}-smooth-${condition}-noregen`, `${route}-smooth-${condition}`, `${route}-aggressive-${condition}`];
  }
  if (ids.length < 2 || ids.length > 4) return Response.json({ error: "Provide 2 to 4 trip ids in ?ids=a,b, or ?route=&condition=" }, { status: 400 });
  if (!ids.every(isValidId)) return Response.json({ error: "Invalid trip id" }, { status: 400 });
  const trips = ids.map(readTrip);
  const missing = ids.filter((_, i) => !trips[i]);
  if (missing.length) return Response.json({ error: `Trip not found: ${missing.join(", ")}` }, { status: 404 });
  return Response.json(trips);
}
