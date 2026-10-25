"use client";

import type { BankingSyncState } from "@/contracts";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Banking status and the explicit mode buttons. Renders whatever useBankingSync returns. */
export default function BankingSyncBar({ bank, stale, staleSince, loading, error, sandboxReady, sync }: BankingSyncState) {
  const status = loading
    ? "Loading banking data…"
    : !bank
      ? "No banking data loaded"
      : stale
        ? `Stale Nessie sandbox read from ${time(staleSince ?? bank.retrievedAt)}`
        : bank.mode === "sandbox"
          ? `Banking loaded (Nessie sandbox · retrieved ${time(bank.retrievedAt)})`
          : "Banking loaded (fixture)";

  return (
    <div className="sync-bar">
      <span className={stale ? "excl" : "muted"}>{status}</span>
      <button className="btn" disabled={loading} onClick={() => sync("fixture")}>
        Use fixture
      </button>
      <button
        className="btn"
        disabled={loading || !sandboxReady}
        onClick={() => sync("sandbox")}
        title={sandboxReady ? "Read this customer from the Nessie sandbox" : "Set NESSIE_API_KEY and NESSIE_CUSTOMERS to enable"}
      >
        Sync from Nessie sandbox
      </button>
      {error && (
        <span className="excl" role="status">
          {error.message}. {bank ? `Still showing the earlier ${stale ? "stale sandbox" : bank.mode} data.` : ""}
        </span>
      )}
      {error?.cachedSandboxAvailable && (
        <button className="btn" disabled={loading} onClick={() => sync("sandbox_cached")}>
          Use last sandbox read ({time(error.cachedSandboxAvailable.retrievedAt)})
        </button>
      )}
    </div>
  );
}
