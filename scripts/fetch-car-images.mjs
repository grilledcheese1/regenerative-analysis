// Fetch one transparent-background PNG per catalog vehicle through SerpAPI Google Images
// (tbs=ic:trans asks for transparent images) and save it to public/cars/<catalogId>.png.
// Run once with `node --env-file=.env.local scripts/fetch-car-images.mjs [catalogId ...]`; the app
// only serves the saved files, so SerpAPI is never called at runtime.
// Images are third-party and copyrighted: public/cars/sources.json records where each came from.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.SERPAPI_API_KEY;
if (!KEY) throw new Error("SERPAPI_API_KEY is not set (use --env-file=.env.local)");

const OUT = "public/cars";
const SOURCES = `${OUT}/sources.json`;
const MIN_WIDTH = 700;
const MAX_BYTES = 3 * 1024 * 1024;

// Search wording per catalog vehicle: exact year and trim where Toyota sells it, "side view" for a flat profile.
const VEHICLES = {
  camry_hybrid_le_2024: "2024 Toyota Camry Hybrid LE side view",
  camry_hev_le_2025: "2025 Toyota Camry Hybrid LE side view",
  corolla_hybrid_2025: "2025 Toyota Corolla Hybrid side view",
  corolla_2016: "2016 Toyota Corolla side view",
  rav4_awd_2021: "2021 Toyota RAV4 side view",
  rav4_hybrid_awd_2025: "2025 Toyota RAV4 Hybrid side view",
};

// Every other car the sign-in list names ("Noah · 2024 Toyota Sienna Hybrid, loan…"), saved under a slug of its label.
// Same parsing and slug as src/fixtures/described-vehicle.ts.
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
for (const p of JSON.parse(readFileSync("src/fixtures/people.generated.json", "utf8")).personas) {
  const m = p.summary.match(/^[^·]+·\s*(\d{4})\s+([^,]+)/);
  if (m) VEHICLES[slugify(`${m[1]} ${m[2].trim()}`)] ??= `${m[1]} ${m[2].trim()} side view`;
}

// Where the plain "year make model" search returns the wrong car, say what to look for instead.
Object.assign(VEHICLES, {
  "2018_toyota_crown_hybrid": "Toyota Crown Hybrid sedan side view",
  "2022_chevrolet_silverado_1500": "2022 Chevrolet Silverado 1500 LT crew cab pickup truck side view",
});

// With no arguments only the missing pictures are fetched; name a key to fetch it again.
const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const sources = existsSync(SOURCES) ? JSON.parse(readFileSync(SOURCES, "utf8")) : {};

/** True when the PNG has an alpha channel or a transparency chunk, so its background is really cut out. */
function hasTransparency(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return false;
  const colorType = buf[25];
  if (colorType === 4 || colorType === 6) return true;
  return buf.includes(Buffer.from("tRNS"));
}

async function search(query) {
  const params = new URLSearchParams({ engine: "google_images", q: `${query} png transparent background`, tbs: "ic:trans", ijn: "0", api_key: KEY });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`); // status only: never print the URL, it holds the key
  const body = await res.json();
  return (body.images_results ?? []).filter((r) => typeof r.original === "string" && r.original.startsWith("https://") && (r.original_width ?? 0) >= MIN_WIDTH);
}

for (const [catalogId, query] of Object.entries(VEHICLES)) {
  if (only.length ? !only.includes(catalogId) : existsSync(`${OUT}/${catalogId}.png`)) continue;
  let saved = false;
  try {
    const candidates = (await search(query)).slice(0, 12);
    // PNG links first: they are the ones that can carry a cut-out background.
    candidates.sort((a, b) => Number(/\.png(\?|$)/i.test(b.original)) - Number(/\.png(\?|$)/i.test(a.original)));
    for (const c of candidates) {
      try {
        const res = await fetch(c.original, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "RegenCoach/0.1 (HackTX demo)" } });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES || !hasTransparency(buf)) continue;
        writeFileSync(`${OUT}/${catalogId}.png`, buf);
        sources[catalogId] = { query, title: String(c.title ?? "").slice(0, 160), source: c.source ?? null, page: c.link ?? null, image: c.original, width: c.original_width, height: c.original_height, retrievedAt: new Date().toISOString() };
        console.log(`ok   ${catalogId}  ${c.original_width}x${c.original_height}  ${Math.round(buf.length / 1024)} KB  ${c.source ?? ""}`);
        saved = true;
        break;
      } catch {
        // try the next candidate
      }
    }
  } catch (e) {
    console.log(`fail ${catalogId}: ${e.message}`);
    continue;
  }
  if (!saved) console.log(`none ${catalogId}: no transparent PNG found`);
}
writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + "\n");
