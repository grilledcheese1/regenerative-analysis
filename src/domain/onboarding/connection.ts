import type { BankingSnapshot, OnboardingAnswers } from "@/contracts";
import { buildBudget, type BudgetSnapshot } from "@/domain/finance/budget";
import { nessieBundlesFromSpec } from "@/fixtures/banking";
import { DEMO_AS_OF } from "@/fixtures/personas";
import { normalizeNessie } from "@/server/providers/nessie-normalize";
import { bankingSpecFromAnswers } from "./banking";
import { buildUserPersona } from "./persona";

export interface LocalConnection {
  snapshot: BankingSnapshot;
  budget: BudgetSnapshot;
  steps: { label: string; count: number }[];
}

/**
 * The history a connection creates, rebuilt locally from the answers: the same records, budget and
 * counts, with no Nessie writes. Used for the live preview and when editing a saved profile.
 */
export function localConnection(accountId: string, answers: OnboardingAnswers): LocalConnection {
  const persona = buildUserPersona(accountId, answers);
  const bundles = nessieBundlesFromSpec(persona.id, bankingSpecFromAnswers(answers, persona));
  const snapshot = normalizeNessie(`fixture_${persona.id}`, "fixture", bundles);
  const total = (k: "deposits" | "bills" | "purchases" | "withdrawals") => bundles.reduce((n, b) => n + b[k].length, 0);
  const loans = bundles.reduce((n, b) => n + (b.loans?.length ?? 0), 0);
  // A transfer appears on both accounts but is one record.
  const transfers = new Set(bundles.flatMap((b) => b.transfers.map((t) => t._id))).size;
  const steps = [
    { label: "customers", count: 1 },
    { label: "accounts", count: bundles.length },
    { label: "loans", count: loans },
    { label: "deposits", count: total("deposits") },
    { label: "bills", count: total("bills") },
    { label: "purchases", count: total("purchases") },
    { label: "transfers", count: transfers },
    { label: "withdrawals", count: total("withdrawals") },
  ].filter((s) => s.count > 0);
  return { snapshot, budget: buildBudget(snapshot, persona.profile, DEMO_AS_OF), steps };
}
