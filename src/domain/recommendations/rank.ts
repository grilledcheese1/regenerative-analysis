import type { OptionResult, Persona } from "@/contracts";
import { moreReliable } from "@/domain/reliability";

/** Less than this many cents a month apart, the more reliable car ranks first. */
export const RELIABILITY_TIE_CENTS = 2500;

const keyFor = (objective: Persona["profile"]["objective"]) => (o: OptionResult) =>
  objective === "lowest_monthly" ? o.totalMonthlyCents : o.avgMonthlyCostCents;

/**
 * Feasible options in order: by the user's objective (average monthly cost over each option's own
 * period, or the monthly total), then the reliability tie-break between the top two.
 */
export function rankWithTieBreak(options: OptionResult[], objective: Persona["profile"]["objective"]): { ranked: OptionResult[]; tieBreak: { winner: string; loser: string } | null } {
  const key = keyFor(objective);
  const ranked = options.filter((o) => o.feasible).sort((a, b) => key(a) - key(b) || a.upfrontCashCents - b.upfrontCashCents);
  const [first, second] = ranked;
  if (first && second && first.reliability && second.reliability && first.catalogId !== second.catalogId && key(second) - key(first) < RELIABILITY_TIE_CENTS && moreReliable(second.reliability, first.reliability) === -1) {
    return { ranked: [second, first, ...ranked.slice(2)], tieBreak: { winner: second.optionId, loser: first.optionId } };
  }
  return { ranked, tieBreak: null };
}

export const rankOptions = (options: OptionResult[], objective: Persona["profile"]["objective"]): OptionResult[] => rankWithTieBreak(options, objective).ranked;
