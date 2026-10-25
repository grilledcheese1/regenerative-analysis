"use client";

import { useSyncExternalStore } from "react";

// Which simulated case study is open, remembered in a cookie. Not an account: no passwords. Real demo accounts are in useAccount.ts.
const COOKIE = "nm_user";
export const AUTH_EVENT = "nm-auth";

function read(): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : null;
}
const subscribe = (cb: () => void) => {
  window.addEventListener(AUTH_EVENT, cb);
  return () => window.removeEventListener(AUTH_EVENT, cb);
};

/** The id of the open case study, or null. */
export const useCaseStudyId = () => useSyncExternalStore(subscribe, read, () => null);

export function openCaseStudy(id: string) {
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  window.dispatchEvent(new Event(AUTH_EVENT));
}
export function exitCaseStudy() {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new Event(AUTH_EVENT));
}
