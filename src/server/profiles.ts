import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { OnboardingAnswers, Persona, UserBanking, UserProfile } from "@/contracts";
import { bankingSpecFromAnswers } from "@/domain/onboarding/banking";
import { buildUserPersona } from "@/domain/onboarding/persona";
import type { BankingSpec } from "@/fixtures/banking";
import { persona as fixturePersona } from "@/fixtures/personas";
import { authSecret } from "./auth/accounts";
import { currentAccount } from "./auth/session";
import { ownedStore } from "./store";

export interface StoredProfile {
  profile: UserProfile;
  persona: Persona;
  spec: BankingSpec;
}

/** One profile per account, keyed by accountId. In memory; the browser re-sends it when it's missing. */
export const userProfiles = ownedStore<StoredProfile>("user_profiles", { maxPerOwner: 1 });
const ID = "profile";

export function saveProfile(accountId: string, answers: OnboardingAnswers, banking: UserBanking): StoredProfile {
  const persona = buildUserPersona(accountId, answers);
  const stored: StoredProfile = {
    profile: { accountId, personaId: persona.id, answers, banking, updatedAt: new Date().toISOString() },
    persona,
    spec: bankingSpecFromAnswers(answers, persona),
  };
  userProfiles.put(accountId, ID, stored);
  return stored;
}

/** Tag proving this server connected `customerId` for `accountId`; profiles can't claim someone else's customer. */
export const bankingProof = (accountId: string, customerId: string) =>
  createHmac("sha256", authSecret()).update(`nessie|${accountId}|${customerId}`).digest("base64url");

/** Error message when a profile's banking claims a Nessie customer it can't prove, else null. */
export function bankingClaimError(accountId: string, b: UserBanking): string | null {
  if (b.mode === "fixture") return b.nessieCustomerId === null ? null : "Local banking can't name a Nessie customer";
  if (!b.nessieCustomerId || !b.proof) return "Connect your banking again";
  const want = Buffer.from(bankingProof(accountId, b.nessieCustomerId));
  const got = Buffer.from(b.proof);
  return want.length === got.length && timingSafeEqual(want, got) ? null : "Connect your banking again";
}

export const loadProfile = (accountId: string) => userProfiles.get(accountId, ID);
export const removeProfile = (accountId: string) => userProfiles.remove(accountId, ID);

/**
 * A case-study persona, or the signed-in account's own `u_` persona. Another account's `u_` id
 * resolves to null, exactly like an unknown id.
 */
export async function personaForRequest(id: string): Promise<{ persona: Persona; stored: StoredProfile | null } | null> {
  const fixed = fixturePersona(id);
  if (fixed) return { persona: fixed, stored: null };
  if (!id.startsWith("u_")) return null;
  const account = await currentAccount();
  if (!account || id !== `u_${account.accountId}`) return null;
  const stored = loadProfile(account.accountId);
  return stored ? { persona: stored.persona, stored } : null;
}
