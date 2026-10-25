import "server-only";
import type { BankingSnapshot, CompareRequest } from "@/contracts";
import type { BankingSpec } from "@/fixtures/banking";
import { MODEL_VERSION } from "@/contracts";
import { canonicalJson, sha256Hex } from "@/server/hash";
import { fixtureSnapshot } from "@/server/providers/nessie";
import { bankingSnapshots } from "@/server/records";

/**
 * The banking read a comparison runs on: the fixture (an onboarded user's comes from their spec), or the
 * owner's last sandbox sync. Undefined when not loaded.
 */
export function loadBank(owner: string, personaId: string, mode: CompareRequest["bankingMode"], spec?: BankingSpec): BankingSnapshot | null | undefined {
  return mode === "fixture" ? fixtureSnapshot(personaId, spec) : bankingSnapshots.get(owner, `${personaId}:sandbox`);
}

/**
 * Stable id for one request on one banking read. Fixture records are static, so their load time
 * doesn't make a new comparison; a sandbox read is identified by when it was retrieved.
 */
export function comparisonIdFor(req: CompareRequest, bank: BankingSnapshot): string {
  const bankIdentity = {
    customerId: bank.customerId,
    mode: bank.mode,
    retrievedAt: bank.mode === "fixture" ? null : bank.retrievedAt,
  };
  return "cmp_" + sha256Hex(canonicalJson({ req, bank: bankIdentity, MODEL_VERSION })).slice(0, 16);
}
