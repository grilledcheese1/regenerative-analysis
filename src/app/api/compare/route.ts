// GET /api/compare?ids=hill-smooth-dry-noregen,hill-smooth-dry,hill-aggressive-dry -> Trip[]
// Shortcut: /api/compare?route=hill&condition=wet returns the three compare-mode columns
// in order: conventional (smooth driver, regen off), smooth, aggressive.

import type { NextRequest } from "next/server";
import { getTrip, tripIdFor, CONDITIONS } from "../_lib/trips";
import type { Condition } from "@/lib/trip/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  let ids = (q.get("ids") ?? "").split(",").filter(Boolean);
  if (!ids.length) {
    const route = q.get("route") ?? "hill";
    const condition = (q.get("condition") ?? "dry") as Condition;
    if (!CONDITIONS.includes(condition))
      return Response.json({ error: `condition must be one of ${CONDITIONS.join(", ")}` }, { status: 400 });
    ids = [
      tripIdFor(route, "smooth", condition, false),
      tripIdFor(route, "smooth", condition),
      tripIdFor(route, "aggressive", condition),
    ];
  }

  const trips = [];
  for (const id of ids) {
    const found = await getTrip(id);
    if (!found) return Response.json({ error: `No trip "${id}". See /api/trips.` }, { status: 404 });
    trips.push(found.trip);
  }
  return Response.json(trips);
}
