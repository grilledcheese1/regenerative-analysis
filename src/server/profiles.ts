import "server-only";
import type { OnboardingAnswers, Persona, UserBanking, UserProfile } from "@/contracts";
import { bankingSpecFromAnswers } from "@/domain/onboarding/banking";
import { buildUserPersona } from "@/domain/onboarding/persona";
import type { BankingSpec } from "@/fixtures/banking";
import { persona as fixturePersona } from "@/fixtures/personas";
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
