import "server-only";
import type { BankingSnapshot, CompareRequest, Comparison, ConsentRecord, RecommendationRecord } from "@/contracts";
import { ownedStore } from "./store";

export interface ComparisonRecord {
  comparisonId: string;
  request: CompareRequest;
  bank: { customerId: string; mode: BankingSnapshot["mode"]; retrievedAt: string };
  comparison: Comparison;
  createdAt: string;
}

export const comparisons = ownedStore<ComparisonRecord>("comparisons", { maxPerOwner: 200 });
export const recommendations = ownedStore<RecommendationRecord>("recommendations", { maxPerOwner: 200 });
export const consents = ownedStore<ConsentRecord>("consents", { maxPerOwner: 500 });

/** Written by the banking sync route (Workstream B) under `${personaId}:${mode}`. */
export const bankingSnapshots = ownedStore<BankingSnapshot>("banking_snapshots", { maxPerOwner: 20 });

/** zod issues → `{ "scenario.monthlyMiles": "Too big" }` for the error body. */
export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  return Object.fromEntries(issues.map((i) => [i.path.map(String).join(".") || "body", i.message]));
}
