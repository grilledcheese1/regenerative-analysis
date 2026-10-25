import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { BankingSnapshot, UserBanking } from "@/contracts";
import { buildBudget } from "@/domain/finance/budget";
import { bankingSpecFromAnswers } from "@/domain/onboarding/banking";
import { buildUserPersona } from "@/domain/onboarding/persona";
import { validateAnswers } from "@/domain/onboarding/validate";
import { nessieBundlesFromSpec } from "@/fixtures/banking";
import { DEMO_AS_OF } from "@/fixtures/personas";
import { currentAccount } from "@/server/auth/session";
import { apiError, newRequestId } from "@/server/http";
import { AnswersSchema } from "@/server/onboarding/schema";
import { fetchCustomer, fixtureSnapshot } from "@/server/providers/nessie";
import { planBundles, planCounts, writePlan } from "@/server/providers/nessie-seed";
import { bankingProof } from "@/server/profiles";
import { fieldErrors } from "@/server/records";

const Body = z.object({ answers: AnswersSchema });
const BUDGET_MS = 45_000;
const STEP_ORDER = ["customers", "accounts", "loans", "deposits", "bills", "purchases", "transfers", "withdrawals"];

class TookTooLong extends Error {}
const within = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new TookTooLong("it took longer than 45 seconds")), ms))]);

/**
 * "Connect your banking": seeds a new Nessie sandbox customer with a bank history built from the
 * user's answers, then reads it back. Without a key, or when Nessie fails at any point, it uses the
 * same history locally and says why. It never returns a half-seeded customer id.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const account = await currentAccount();
  if (!account) return apiError(401, "signed_out", "Sign in first", false, requestId);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", "Check your answers", false, requestId, fieldErrors(parsed.error.issues));
  const errors = validateAnswers(parsed.data.answers);
  if (Object.keys(errors).length) return apiError(400, "invalid_request", "Check your answers", false, requestId, errors);

  const answers = parsed.data.answers;
  const persona = buildUserPersona(account.accountId, answers);
  const spec = bankingSpecFromAnswers(answers, persona);
  const bundles = nessieBundlesFromSpec(persona.id, spec);
  const plan = planBundles(persona.id, bundles, { first_name: answers.name.split(" ")[0] || "Regentic", last_name: `Regentic-${randomBytes(3).toString("hex")}` });
  const steps = Object.entries(planCounts(plan))
    .sort((a, b) => STEP_ORDER.indexOf(a[0]) - STEP_ORDER.indexOf(b[0]))
    .map(([label, count]) => ({ label, count }));
  const now = new Date().toISOString();

  const local = (note: string) => {
    const snapshot = fixtureSnapshot(persona.id, spec)!;
    return respond({ mode: "fixture", nessieCustomerId: null, connectedAt: now, note }, snapshot);
  };
  const respond = (banking: UserBanking, snapshot: BankingSnapshot) =>
    Response.json({ requestId, banking, snapshot, budget: buildBudget(snapshot, persona.profile, DEMO_AS_OF), steps });

  if (!process.env.NESSIE_API_KEY) return local("Nessie isn't configured on this server, so the same history was created locally.");

  const started = Date.now();
  try {
    const { snapshot, customerId } = await within(
      (async () => {
        const { customerId } = await writePlan(plan);
        return { customerId, snapshot: await fetchCustomer(customerId) };
      })(),
      BUDGET_MS,
    );
    log({ requestId, outcome: "ok", ms: Date.now() - started });
    return respond({ mode: "sandbox", nessieCustomerId: customerId, connectedAt: now, note: null, proof: bankingProof(account.accountId, customerId) }, snapshot);
  } catch (e) {
    const reason = e instanceof Error ? e.message.replace(/\.$/, "") : "unknown error";
    log({ requestId, outcome: "fallback", ms: Date.now() - started });
    return local(`Couldn't finish connecting to Nessie: ${reason}. Using the same history locally.`);
  }
}

// Codes and timings only: never balances, names or the API key.
const log = (line: Record<string, unknown>) => console.info(JSON.stringify({ at: "onboarding_connect_bank", ...line }));
