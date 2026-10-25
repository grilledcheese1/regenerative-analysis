"use client";

import { useSyncExternalStore } from "react";

// A fake sign-in: it only remembers which simulated customer you chose, in a cookie. No passwords, no real accounts.
const COOKIE = "nm_user";
const EVENT = "nm-auth";

function read(): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : null;
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

/** The id of the simulated customer who is "signed in", or null. */
export const useSignedInId = () => useSyncExternalStore(subscribe, read, () => null);

export function signIn(id: string) {
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}
export function signOut() {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new Event(EVENT));
}
