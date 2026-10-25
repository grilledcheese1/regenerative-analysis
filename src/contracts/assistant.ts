// Contracts for the "Ask Next Move" assistant (POST /api/assistant).
import type { FallbackReason, NextAction, ScenarioInputs } from "./index";

export const ASSISTANT_SCHEMA_VERSION = "1.0";

export type AssistantIntent =
  | "explain_decision"
  | "compare_options"
  | "what_if"
  | "fees_and_terms"
  | "budget"
  | "hybrid_savings"
  | "next_step"
  | "missing_info"
  | "out_of_scope";

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string; // ≤ 500 chars
}

export interface AssistantRequest {
  schemaVersion: "1.0";
  comparisonId: string; // from POST /api/options/compare
  question: string; // 1–500 chars
  history?: AssistantTurn[]; // ≤ 6 turns; used for wording only, never as facts
}

export interface WhatIfResult {
  changed: Partial<Pick<ScenarioInputs, "gasCentsPerGallon" | "monthlyMiles" | "extraMonthlySpendingCents">>;
  assumption?: string; // set when the question was vague ("drive more") and a fixed step was used
  comparisonId: string; // new snapshot stored for the owner
  headline: string; // domain headline after the change
  selectedOptionId: string | null;
  nextAction: NextAction;
  decisionChanged: boolean;
}

export const FOLLOW_UPS = [
  "Why this option?",
  "What if gas hits $5?",
  "What if I drive more?",
  "What does it cost each month?",
  "What do I do next?",
  "What information is missing?",
] as const;
export type AssistantFollowUp = (typeof FOLLOW_UPS)[number];

export type AssistantFallbackReason = FallbackReason | "rate_limited";

export interface AssistantAnswer {
  requestId: string;
  intent: AssistantIntent;
  mode: "ai" | "template";
  provider: "meta" | "anthropic" | null;
  model: string | null;
  promptVersion: string;
  answer: string; // ≤ 700 chars, plain English
  citedEvidenceIds: string[]; // ids from comparison.evidence or option ids
  followUps: AssistantFollowUp[]; // 0–3, from the fixed list
  whatIf?: WhatIfResult;
  declined: boolean; // true for out-of-scope questions
  fallbackReason?: AssistantFallbackReason;
  rejectedDetail?: string; // developer-facing
  generatedAt: string;
  cacheHit: boolean;
}
