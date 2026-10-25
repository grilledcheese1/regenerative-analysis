// Banking sync contracts (owned by the Nessie banking stream; frozen shape).
import type { BankingSnapshot, DataMode } from "./index";

export type BankingSyncMode = DataMode | "sandbox_cached";

export interface BankingSyncResult {
  requestId: string;
  snapshot: BankingSnapshot;
  stale: boolean; // true only when serving a cached sandbox read on purpose
  staleSince?: string; // snapshot.retrievedAt of the cached read
}

export interface BankingSyncError {
  error: { code: string; message: string; retryable: boolean; requestId: string };
  cachedSandboxAvailable?: { retrievedAt: string }; // offer, don't serve
}

/** What useBankingSync returns; BankingSyncBar renders it and the shell reads it. */
export interface BankingSyncState {
  bank: BankingSnapshot | null;
  mode: BankingSyncMode | null;
  stale: boolean;
  staleSince?: string;
  loading: boolean;
  error: (BankingSyncError["error"] & { cachedSandboxAvailable?: { retrievedAt: string } }) | null;
  sandboxReady: boolean; // from GET /api/demo/customers
  sync: (mode: BankingSyncMode) => Promise<void>;
}
