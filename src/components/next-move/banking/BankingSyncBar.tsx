"use client";

import type { BankingSyncState } from "@/contracts";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Bank-data status, shown only when the person needs to know something: the first load, a failed
 * refresh, or an older read being shown. Day-to-day connection controls live in Settings.
 */
export default function BankingSyncBar({ bank, mode, stale, staleSince, loading, error, sync }: BankingSyncState) {
  if (loading && !bank) {
    return (
      <div className="sync-bar">
        <span className="muted" role="status">Loading your bank data…</span>
      </div>
    );
  }
  if (!error && !stale) return null;

  const retry = mode === "sandbox" || mode === "sandbox_cached" ? "sandbox" : "fixture";
  return (
    <div className="sync-bar" role="status">
      <span className="excl">
        {error
          ? `We couldn't refresh your bank data (${error.message}).${bank ? " Showing what we had." : ""}`
          : `Showing your bank data from ${time(staleSince ?? bank!.retrievedAt)}.`}
      </span>
      {error && (
        <button className="btn" disabled={loading} onClick={() => sync(retry)}>
          Try again
        </button>
      )}
      {error?.cachedSandboxAvailable && (
        <button className="btn" disabled={loading} onClick={() => sync("sandbox_cached")}>
          Use the last read ({time(error.cachedSandboxAvailable.retrievedAt)})
        </button>
      )}
      {error && !bank && (
        <button className="btn" disabled={loading} onClick={() => sync("fixture")}>
          Use the simulated history
        </button>
      )}
    </div>
  );
}
