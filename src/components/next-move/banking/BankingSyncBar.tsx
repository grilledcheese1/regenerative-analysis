"use client";

import type { BankingSyncState } from "@/contracts";

/** Banking status and the explicit mode buttons. Renders whatever useBankingSync returns. */
export default function BankingSyncBar({ bank, loading, error, sandboxReady, sync }: BankingSyncState) {
  return (
    <div className="sync-bar">
      <span className="muted">
        {loading ? "Loading banking data…" : bank ? `Banking loaded (${bank.mode})` : "No banking data loaded"}
      </span>
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
        <span className="excl">
          {error.message}. {bank ? `Still showing the earlier ${bank.mode} data.` : ""}
        </span>
      )}
    </div>
  );
}
