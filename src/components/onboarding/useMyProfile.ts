"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OnboardingAnswers, Persona, UserBanking, UserProfile } from "@/contracts";
import { buildUserPersona } from "@/domain/onboarding/persona";
import { useAccount } from "../auth/useAccount";
import { PROFILE_PREFIX } from "./localProfile";

export type ProfileStatus = "signed_out" | "loading" | "none" | "ready";
const key = (accountId: string) => `${PROFILE_PREFIX}${accountId}`;

function readLocal(accountId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(key(accountId));
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}
function writeLocal(p: UserProfile) {
  try {
    localStorage.setItem(key(p.accountId), JSON.stringify(p));
  } catch {
    // Private mode or full storage: the server copy still works this session.
  }
}

async function put(answers: OnboardingAnswers, banking: UserBanking): Promise<UserProfile> {
  const res = await fetch("/api/me/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers, banking }) });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body?.error?.message ?? "Couldn't save your profile"), { fieldErrors: body?.error?.fieldErrors });
  return body.profile as UserProfile;
}

/**
 * The signed-in account's onboarding profile. The server copy is in memory, so when it's missing
 * (restart, another instance) and this browser has one, it's re-sent before reporting "ready".
 */
export function useMyProfile(): { status: ProfileStatus; profile: UserProfile | null; persona: Persona | null; save(answers: OnboardingAnswers, banking: UserBanking): Promise<UserProfile> } {
  const { account, ready } = useAccount();
  const [loaded, setLoaded] = useState<{ accountId: string; profile: UserProfile | null } | null>(null);
  const accountId = account?.accountId ?? null;

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    (async () => {
      let profile: UserProfile | null = null;
      try {
        const res = await fetch("/api/me/profile");
        if (res.ok) profile = (await res.json()).profile;
        else if (res.status === 404) {
          const local = readLocal(accountId);
          if (local) profile = await put(local.answers, local.banking).catch(() => local);
        }
      } catch {
        profile = readLocal(accountId);
      }
      if (profile) writeLocal(profile);
      if (live) setLoaded({ accountId, profile });
    })();
    return () => {
      live = false;
    };
  }, [accountId]);

  const save = useCallback(async (answers: OnboardingAnswers, banking: UserBanking) => {
    const profile = await put(answers, banking);
    writeLocal(profile);
    setLoaded({ accountId: profile.accountId, profile });
    return profile;
  }, []);

  const current = loaded && loaded.accountId === accountId ? loaded.profile : null;
  const persona = useMemo(() => (current ? buildUserPersona(current.accountId, current.answers) : null), [current]);
  const status: ProfileStatus = !ready ? "loading" : !accountId ? "signed_out" : !loaded || loaded.accountId !== accountId ? "loading" : current ? "ready" : "none";
  return { status, profile: current, persona, save };
}
