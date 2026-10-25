"use client";

import { useEffect, useState } from "react";
import { clearLocalProfiles } from "../onboarding/localProfile";
import { AUTH_EVENT } from "./caseStudy";

export interface PublicAccount {
  accountId: string;
  email: string;
  name: string;
}
export type AuthResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string>; hint?: string };

const changed = () => window.dispatchEvent(new Event(AUTH_EVENT));

/** The signed-in demo account (from /api/auth/me), refreshed whenever auth changes. */
export function useAccount(): { account: PublicAccount | null; ready: boolean } {
  const [state, setState] = useState<{ account: PublicAccount | null; ready: boolean }>({ account: null, ready: false });
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d: { account: PublicAccount | null }) => live && setState({ account: d.account, ready: true }))
        .catch(() => live && setState({ account: null, ready: true }));
    void load();
    window.addEventListener(AUTH_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(AUTH_EVENT, load);
    };
  }, []);
  return state;
}

async function send(path: string, body: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      changed();
      return { ok: true };
    }
    const { error } = await res.json();
    return { ok: false, message: error?.message ?? "Something went wrong", fieldErrors: error?.fieldErrors, hint: error?.hint };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." };
  }
}

export const signUp = (input: { name: string; email: string; password: string }) => send("/api/auth/signup", input);
export const signInWithPassword = (email: string, password: string) => send("/api/auth/signin", { email, password });
export async function signOutAccount(): Promise<void> {
  await fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
  clearLocalProfiles();
  changed();
}
