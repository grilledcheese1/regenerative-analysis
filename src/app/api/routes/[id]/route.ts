import { isValidId, readRoute } from "../../../../../scripts/lib/trips-store.ts";

// GET /api/routes/hilly -> { routeId, name, meta, points: RoutePoint[] }
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Invalid route id" }, { status: 400 });
  const route = readRoute(id);
  if (!route) return Response.json({ error: `Route not found: ${id}` }, { status: 404 });
  return Response.json(route);
}
