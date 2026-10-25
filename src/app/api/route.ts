// GET /api -> a small HTML guide listing every Stream 2 endpoint with clickable examples.

import { listRoutes } from "./_lib/trips";

const ENDPOINTS: { path: string; returns: string; examples: (route: string, condition: string) => string[] }[] = [
  { path: "/api/routes", returns: "RouteListItem[]: the demo routes, a friendly label, and a condition suggested from today's weather", examples: () => ["/api/routes"] },
  { path: "/api/routes/[id]", returns: "DemoRoute: every 10 m point with elevation, speed limit, surface and street name. Drop-in for buildDemoRoute()", examples: (r) => [`/api/routes/${r}`] },
  { path: "/api/trips", returns: "TripHeader[]. Filters: route, driver, condition, regen", examples: (r, c) => ["/api/trips", `/api/trips?route=${r}&condition=${c}&regen=true`] },
  { path: "/api/trips/[id]", returns: "Trip (the locked contract). Ids: route-driver-condition, add -noregen for the conventional car", examples: (r, c) => [`/api/trips/${r}-smooth-${c}`, `/api/trips/${r}-smooth-${c}-noregen`] },
  { path: "/api/trips/[id]/story", returns: "TripStory: plain-English sentences in miles and mph, with the biggest missed moments by street", examples: (r, c) => [`/api/trips/${r}-aggressive-${c}/story`, `/api/trips/${r}-smooth-${c}/story`] },
  { path: "/api/trips/[id]/coach", returns: "CoachResponse: one coaching tip and the facts it is based on (Claude with a key, rules without)", examples: (r, c) => [`/api/trips/${r}-aggressive-${c}/coach`] },
  { path: "/api/compare", returns: "Trip[]: pass ?ids=a,b,c, or ?route=&condition= for conventional, smooth and aggressive", examples: (r, c) => [`/api/compare?route=${r}&condition=${c}`] },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const routes = await listRoutes();
  const route = routes[0]?.routeId ?? "hill";
  const condition = routes[0]?.suggestedCondition.condition ?? "dry";

  const rows = ENDPOINTS.map(
    (e) => `<section>
      <h2><code>GET ${esc(e.path)}</code></h2>
      <p>${esc(e.returns)}</p>
      <ul>${e.examples(route, condition).map((u) => `<li><a href="${esc(u)}">${esc(u)}</a></li>`).join("")}</ul>
    </section>`,
  ).join("");
  const routeList = routes
    .map((r) => `<li><b>${esc(r.routeId)}</b>: ${esc(r.name)}. Suggested today: ${esc(r.suggestedCondition.condition)} (${esc(r.suggestedCondition.reason)})</li>`)
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Regen Coach API</title>
<style>
  :root { --bg:#fff; --fg:#1a1a1a; --muted:#666; --card:#f2f2f2; --accent:#eb0a1e; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1013; --fg:#eef0ee; --muted:#a9b1b4; --card:#161a1f; --accent:#4cc5b6; } }
  body { background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, sans-serif; max-width:820px; margin:0 auto; padding:24px 16px; }
  h1 { margin:0 0 4px; } .tag { font:12px ui-monospace, monospace; letter-spacing:2px; color:var(--accent); }
  section { background:var(--card); border-radius:12px; padding:12px 16px; margin:12px 0; }
  h2 { font-size:16px; margin:0; } p { margin:6px 0; color:var(--muted); } a { color:var(--accent); word-break:break-all; }
  ul { margin:4px 0; padding-left:20px; }
</style></head>
<body>
  <span class="tag">STREAM 2 · SIMULATED DATA · ESTIMATES</span>
  <h1>Regen Coach API</h1>
  <p>Trips are simulated on request from real Austin roads using Stream 1's model. Response types: <code>src/app/api/_lib/types.ts</code>.</p>
  <ul>${routeList}</ul>
  ${rows}
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
