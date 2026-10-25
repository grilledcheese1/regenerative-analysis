"use client";

// The browser's copies of onboarding data: the saved profile per account, and the in-progress draft.
export const PROFILE_PREFIX = "regentic.profile.";
export const DRAFT_KEY = "regentic.onboarding.draft";

/** Forgets this browser's copy of every profile and the onboarding draft (sign-out, delete my data). */
export function clearLocalProfiles() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PROFILE_PREFIX)) localStorage.removeItem(k);
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
