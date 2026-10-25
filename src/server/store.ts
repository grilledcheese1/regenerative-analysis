import "server-only";

// Owner-scoped in-memory records. Kept on globalThis so dev HMR doesn't wipe them. Vercel
// instances don't share memory, so routes treat a missing record as "re-send your inputs".

export interface OwnedStore<T> {
  get(owner: string, id: string): T | undefined; // undefined for other owners: callers return 404
  put(owner: string, id: string, value: T): void;
  list(owner: string): T[]; // newest first
  remove(owner: string, id: string): boolean;
}

interface Entry {
  v: unknown;
  at: number;
}

type Stores = Map<string, Map<string, Map<string, Entry>>>; // store → owner → id → entry

const g = globalThis as typeof globalThis & { __nmStores?: Stores; __nmClock?: number };
const stores: Stores = (g.__nmStores ??= new Map());

// Strictly increasing so "newest first" holds even within one millisecond.
const tick = () => (g.__nmClock = Math.max(Date.now(), (g.__nmClock ?? 0) + 1));

export function ownedStore<T>(name: string, opts: { maxPerOwner?: number } = {}): OwnedStore<T> {
  if (!stores.has(name)) stores.set(name, new Map());
  const byOwner = stores.get(name)!;
  const ownerMap = (owner: string) => {
    let m = byOwner.get(owner);
    if (!m) byOwner.set(owner, (m = new Map()));
    return m;
  };

  return {
    get: (owner, id) => byOwner.get(owner)?.get(id)?.v as T | undefined,
    put(owner, id, value) {
      const m = ownerMap(owner);
      m.delete(id); // re-insert so insertion order tracks recency
      m.set(id, { v: value, at: tick() });
      if (opts.maxPerOwner && m.size > opts.maxPerOwner) {
        const oldest = [...m.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        m.delete(oldest[0]);
      }
    },
    list(owner) {
      const m = byOwner.get(owner);
      if (!m) return [];
      return [...m.values()].sort((a, b) => b.at - a.at).map((e) => e.v as T);
    },
    remove: (owner, id) => byOwner.get(owner)?.delete(id) ?? false,
  };
}

/** Removes every record the owner has in every registered store. */
export function deleteOwnerData(owner: string): { stores: string[] } {
  const cleared: string[] = [];
  for (const [name, byOwner] of stores) {
    if (byOwner.delete(owner)) cleared.push(name);
  }
  return { stores: cleared.sort() };
}
