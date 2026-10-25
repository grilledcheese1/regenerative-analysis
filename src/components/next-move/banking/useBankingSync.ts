"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BankingSnapshot, BankingSyncMode, BankingSyncState } from "@/contracts";

/**
 * Banking data for one demo customer. Loads `initialMode` (the fixture unless the customer connected
 * a Nessie sandbox account during onboarding) when the customer changes; a failed read keeps the
 * earlier data and says so. Never switches modes on its own.
 */
export function useBankingSync(personaId: string, initialMode: BankingSyncMode = "fixture"): BankingSyncState {
  const [sandboxIds, setSandboxIds] = useState<string[]>([]);
  // Keyed by persona so switching customers never shows the previous customer's data.
  const [loaded, setLoaded] = useState<{ personaId: string; snapshot: BankingSnapshot; mode: BankingSyncMode; stale: boolean; staleSince?: string } | null>(null);
  const [error, setError] = useState<BankingSyncState["error"]>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/demo/customers")
      .then((r) => r.json())
      .then((d: { customers: { id: string; sandboxAvailable: boolean }[] }) =>
        setSandboxIds(d.customers.filter((c) => c.sandboxAvailable).map((c) => c.id)),
      )
      .catch(() => setSandboxIds([]));
  }, []);

  const latestPersona = useRef(personaId);
  useEffect(() => {
    latestPersona.current = personaId;
  }, [personaId]);

  const syncFor = useCallback(async (id: string, m: BankingSyncMode) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/banking/nessie/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId: id, mode: m }),
      });
      const body = await res.json();
      if (latestPersona.current !== id) return; // a newer persona was selected meanwhile
      if (!res.ok) {
        // Keep whatever was shown before; never relabel a failed sandbox read as fixture data.
        setError({ ...body.error, cachedSandboxAvailable: body.cachedSandboxAvailable });
        return;
      }
      setLoaded({ personaId: id, snapshot: body.snapshot, mode: m, stale: Boolean(body.stale), staleSince: body.staleSince });
    } catch {
      setError({ code: "network", message: "Could not reach the banking route", retryable: true, requestId: "" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on persona change; the setState calls happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void syncFor(personaId, initialMode);
  }, [personaId, initialMode, syncFor]);

  const current = loaded?.personaId === personaId ? loaded : null;
  return {
    bank: current?.snapshot ?? null,
    mode: current?.mode ?? null,
    stale: current?.stale ?? false,
    staleSince: current?.staleSince,
    loading,
    error,
    sandboxReady: sandboxIds.includes(personaId),
    sync: (m) => syncFor(personaId, m),
  };
}
