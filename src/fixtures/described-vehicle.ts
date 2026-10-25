import type { Persona } from "@/contracts";
import { catalogVehicle } from "./catalog";

/**
 * The car a customer is described as owning, as the sign-in list names it ("Noah · 2024 Toyota Sienna Hybrid, loan…").
 * Costs are still modeled on the nearest catalog vehicle, so the two can differ; the picture and headline follow
 * the description so what the customer picked is what they see. The three curated customers are described by their catalog car.
 */
export interface DescribedVehicle {
  /** "2024 Toyota Sienna Hybrid" */
  label: string;
  /** File name (no extension) under public/cars/. */
  imageKey: string;
  /** True when the catalog vehicle the costs use is the same year and model. */
  modeledExactly: boolean;
  /** "2025 RAV4 Hybrid AWD": what the numbers are modeled on. */
  modeledAs: string;
}

// "Noah · 2024 Toyota Sienna Hybrid, loan, 54 payments left" → year, then make and model up to the first comma.
const DESCRIPTION = /^[^·]+·\s*(\d{4})\s+([^,]+)/;

/**
 * Years whose body style is the same as another picture we have (same generation), so they reuse that file
 * instead of the search's nearest, usually newer, result.
 */
const SAME_BODY: Record<string, string> = {
  "2019_toyota_camry_hybrid": "camry_hybrid_le_2024", // Camry 2018 to 2024
  "2021_toyota_camry_hybrid": "camry_hybrid_le_2024",
  "2023_toyota_camry_hybrid": "camry_hybrid_le_2024",
  "2022_toyota_4runner": "2016_toyota_4runner", // 4Runner 2010 to 2024
  "2021_toyota_tundra": "2017_toyota_tundra_hybrid", // Tundra 2007 to 2021
};

export const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Year and "Make Model" parsed from a summary line, or null for a summary with no year and make. */
export function parseDescription(summary: string): { year: number; name: string } | null {
  const m = summary.match(DESCRIPTION);
  return m ? { year: Number(m[1]), name: m[2].trim() } : null;
}

export function describedVehicle(p: Persona): DescribedVehicle {
  const catalog = catalogVehicle(p.vehicle.catalogId);
  const modeledAs = `${catalog.modelYear} ${catalog.model}`;
  const d = parseDescription(p.summary);
  if (!d) return { label: modeledAs, imageKey: catalog.catalogId, modeledExactly: true, modeledAs };
  const label = `${d.year} ${d.name}`;
  const model = d.name.replace(/^toyota\s+/i, "").toLowerCase();
  const modeledExactly = catalog.modelYear === d.year && catalog.model.toLowerCase().includes(model);
  const key = slugify(label);
  return { label, imageKey: SAME_BODY[key] ?? key, modeledExactly, modeledAs };
}
