import type { OptionResult, Persona } from "@/contracts";

/** Feasible options only, ordered by the user's stated objective. */
export function rankOptions(options: OptionResult[], objective: Persona["profile"]["objective"]): OptionResult[] {
  const key = (o: OptionResult) => (objective === "lowest_monthly" ? o.totalMonthlyCents : o.economicCostCents);
  return options.filter((o) => o.feasible).sort((a, b) => key(a) - key(b) || a.upfrontCashCents - b.upfrontCashCents);
}
