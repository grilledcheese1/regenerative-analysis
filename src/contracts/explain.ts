// Contracts for the server comparison, recommendation and explanation API (Workstream C).
import type { Comparison, NextAction, Recommendation, SourceKind } from "./index";

export const PROMPT_VERSION = "explain-1";

/** Same union as Workstream B's BankingSyncMode; kept inline so this file has no cross-stream import. */
export type BankingModeInput = "fixture" | "sandbox" | "sandbox_cached";

export interface ScenarioInputs {
  gasCentsPerGallon: number;
  monthlyMiles: number;
  cityShare?: number;
  usageSource?: SourceKind;
  extraMonthlySpendingCents: number;
  incomeConfirmed: boolean;
}

export interface CompareRequest {
  schemaVersion: "1.0";
  personaId: string;
  bankingMode: BankingModeInput;
  scenario: ScenarioInputs;
}

export interface CompareResponse {
  requestId: string;
  comparisonId: string;
  comparison: Comparison;
}

export type FallbackReason = "not_configured" | "timeout" | "provider_error" | "daily_cap" | "validation_failed";

export interface Explanation {
  mode: "ai" | "template";
  promptVersion: string;
  model: string | null;
  summary: string; // ≤ 600 chars
  tradeoffs: string[]; // ≤ 3
  missingInfo: string[]; // ≤ 3
  nextAction: NextAction; // always equals recommendation.nextAction
  citedEvidenceIds: string[];
  fallbackReason?: FallbackReason;
  rejectedDetail?: string; // developer-facing, e.g. "unsupported_number:412"; the UI shows a generic line
  generatedAt: string;
  cacheHit: boolean;
}

export interface RecommendationRecord {
  requestId: string;
  recommendationId: string;
  comparisonId: string;
  recommendation: Recommendation;
  explanation: Explanation;
}

// ---------- Consents ----------

export type ConsentPurpose = "driving_analysis" | "banking_analysis" | "insurer_sharing";
export const CONSENT_VERSION = "consent-1";

export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  version: string;
  at: string;
  source: "settings_screen";
}

export interface ConsentState {
  requestId: string;
  effective: Record<ConsentPurpose, { granted: boolean; version: string; at: string } | null>;
  history: ConsentRecord[];
}
