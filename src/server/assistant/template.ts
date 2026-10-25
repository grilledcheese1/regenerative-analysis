import type { AssistantFollowUp, AssistantIntent, NextAction } from "@/contracts";
import type { AssistantFacts } from "./facts";

export interface TemplateAnswer {
  answer: string;
  citedEvidenceIds: string[];
  followUps: AssistantFollowUp[];
  declined: boolean;
}

const NEXT_STEP: Record<NextAction, string> = {
  keep_current_plan: "Keep the current car and plan. Nothing else is needed right now.",
  request_buyout_quote: "Ask for a buyout quote. The buyout price is an estimate until you have one.",
  request_payoff_quote: "Ask your lender for a payoff quote. The payoff shown is an estimate.",
  compare_confirmed_offers: "Collect confirmed offers, then compare them side by side.",
  review_insurance_program: "Review the insurance program options before you decide.",
  review_budget: "Review your budget first. No option fits it comfortably right now.",
  obtain_missing_vehicle_information: "Add the missing vehicle details so the comparison can finish.",
};

const words = (id: string) => {
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const FOLLOW: Record<AssistantIntent, AssistantFollowUp[]> = {
  explain_decision: ["What does it cost each month?", "What if gas hits $5?", "What do I do next?"],
  compare_options: ["Why this option?", "What if I drive more?", "What do I do next?"],
  what_if: ["Why this option?", "What do I do next?", "What information is missing?"],
  fees_and_terms: ["Why this option?", "What do I do next?", "What information is missing?"],
  budget: ["Why this option?", "What if I drive more?", "What do I do next?"],
  hybrid_savings: ["Why this option?", "What if gas hits $5?", "What does it cost each month?"],
  next_step: ["Why this option?", "What information is missing?", "What if gas hits $5?"],
  missing_info: ["Why this option?", "What do I do next?", "What if gas hits $5?"],
  out_of_scope: ["Why this option?", "What if gas hits $5?", "What do I do next?"],
};

/** The evidence ids that exist in these facts, in order. */
const only = (facts: AssistantFacts, ids: string[]) => {
  const known = new Set([...facts.evidence.map((e) => e.id), ...facts.options.map((o) => o.optionId)]);
  return ids.filter((id) => known.has(id));
};

const selectedLabel = (facts: AssistantFacts) => facts.options.find((o) => o.optionId === facts.decision.selectedOptionId)?.label;

/** The deterministic answer for an intent, built only from the facts. */
export function templateAnswer(intent: AssistantIntent, facts: AssistantFacts, question: string): TemplateAnswer {
  const out = (answer: string, cited: string[], declined = false): TemplateAnswer => ({
    answer,
    citedEvidenceIds: declined ? [] : cited,
    followUps: FOLLOW[intent],
    declined,
  });
  const selected = facts.decision.selectedOptionId;
  const fallbackCites = selected ? [selected] : facts.options.slice(0, 1).map((o) => o.optionId);

  switch (intent) {
    case "explain_decision": {
      const lines = [facts.decision.headline, facts.templateLines[0]].filter(Boolean).join(". ");
      return out(lines, [...fallbackCites, ...only(facts, ["vehicle_budget"])]);
    }
    case "compare_options": {
      const q = question.toLowerCase();
      const named = facts.options.filter((o) => q.includes(o.label.toLowerCase()) || o.label.toLowerCase().split(/\s+/).some((w) => w.length > 3 && q.includes(w)));
      const picked = (named.length >= 1 ? named : facts.options.filter((o) => o.feasible)).slice(0, 2);
      const list = picked.length ? picked : facts.options.slice(0, 2);
      const text = list.map((o) => `${o.label}: ${o.tradeoff} Total monthly cost ${o.totalMonthly}.`).join(" ");
      return out(text || "There are no options to compare yet.", list.map((o) => o.optionId));
    }
    case "what_if": {
      const w = facts.whatIf;
      if (!w) {
        return out(
          "I can re-run the numbers if you change the gas price (for example $5), how many miles you drive a month, or a new monthly expense. I can't model other changes yet.",
          [],
          true,
        );
      }
      const lead = `${w.changes.join(" and ")}. ${w.after.headline}.`;
      const verdict = w.decisionChanged ? "The recommendation changed." : "The recommendation did not change.";
      const touched = w.changes.flatMap((c) => (/^Gas/.test(c) ? ["gas_price"] : /miles/.test(c) ? ["monthly_miles"] : ["vehicle_budget"]));
      const cites = only(facts, [...(w.after.selectedOptionId ? [w.after.selectedOptionId] : []), ...touched]);
      return out(`${lead} ${verdict}${w.assumption ? ` ${w.assumption}` : ""}`, cites.length ? cites : fallbackCites);
    }
    case "fees_and_terms": {
      const wanted = /mileage|lease|apr|fee|term|payoff|purchase|residual|overage|maturity|loan/i;
      const items = facts.evidence.filter((e) => wanted.test(e.label) || wanted.test(e.id)).slice(0, 4);
      if (items.length === 0) return out("This comparison has no contract fees or terms to show.", fallbackCites);
      return out(`${items.map((e) => `${e.label}: ${e.display}`).join(". ")}. Contract figures are synthetic estimates, not a quote.`, items.map((e) => e.id));
    }
    case "budget": {
      if (facts.bankingAnalysisOff) {
        return out("Banking analysis is off in Settings, so I can't use your bank data to answer budget questions. Turn it on to see what you can afford.", fallbackCites);
      }
      const item = facts.evidence.find((e) => e.id === "vehicle_budget");
      const best = facts.options.find((o) => o.optionId === selected) ?? facts.options[0];
      const parts = [item && `${item.label}: ${item.display}`, best && `${best.label} has a total monthly cost of ${best.totalMonthly}`].filter(Boolean);
      return out(`${parts.join(". ")}. The budget is an estimate from simulated banking data.`, [...only(facts, ["vehicle_budget"]), ...(best ? [best.optionId] : [])]);
    }
    case "hybrid_savings": {
      const list = facts.running.slice(0, 3);
      if (list.length === 0) return out("There are no running-cost figures in this comparison.", fallbackCites);
      return out(
        `Monthly running costs (fuel, insurance and maintenance): ${list.map((r) => `${r.label} ${r.runningMonthly}`).join("; ")}. Fuel figures use the gas price and mileage on screen and are estimates.`,
        [...list.map((r) => r.optionId), ...only(facts, ["gas_price"])],
      );
    }
    case "next_step": {
      const label = selectedLabel(facts);
      const text = NEXT_STEP[facts.decision.nextAction as NextAction] ?? facts.decision.headline;
      return out(label ? `${text} Leading option: ${label}.` : text, fallbackCites);
    }
    case "missing_info": {
      const missing = facts.missingInputs;
      if (missing.length === 0) return out("Nothing else is needed from you right now.", fallbackCites);
      return out(`Still missing: ${missing.slice(0, 4).map((m) => words(m).toLowerCase()).join(", ")}.`, fallbackCites);
    }
    case "out_of_scope":
    default:
      return out(
        "I can only answer questions about this comparison: why an option leads, costs, fees, what-ifs and the next step. I can't approve loans or give credit, legal or tax advice.",
        [],
        true,
      );
  }
}
