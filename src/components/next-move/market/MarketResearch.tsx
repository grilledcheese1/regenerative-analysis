"use client";

import { useState } from "react";
import type { MarketSearchResult } from "@/contracts";
import { usd } from "@/domain/format";
import styles from "./Market.module.css";

export interface MarketResearchProps {
  catalogId: string;
  label: string;
}

type State = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; result: MarketSearchResult } | { kind: "error"; message: string };

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Source-linked public listings for one candidate vehicle, inside its Compare card. Loads only
 * when opened, so browsing Compare spends no search credits. Research only: never feeds the comparison.
 */
export default function MarketResearch({ catalogId, label }: MarketResearchProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const load = async () => {
    if (state.kind !== "idle" && state.kind !== "error") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/market/search?catalogId=${encodeURIComponent(catalogId)}`);
      const body = await res.json();
      if (!res.ok) setState({ kind: "error", message: body.error?.message ?? "Market search unavailable right now" });
      else setState({ kind: "ready", result: body as MarketSearchResult });
    } catch {
      setState({ kind: "error", message: "Market search unavailable right now" });
    }
  };

  return (
    <details className={styles.details} onToggle={(e) => (e.currentTarget.open ? void load() : undefined)}>
      <summary>See listings</summary>
      <div className={styles.body} aria-live="polite">
        <div className={styles.head}>
          <span>Public listings for {label}</span>
          <span className="tag">External · advertised</span>
        </div>
        {state.kind === "loading" && (
          <div className={styles.skeleton} aria-busy="true">
            Searching public listings…
          </div>
        )}
        {state.kind === "error" && <p className="muted small">{state.message}.</p>}
        {state.kind === "ready" && <Listings result={state.result} />}
      </div>
    </details>
  );
}

function Listings({ result }: { result: MarketSearchResult }) {
  const r = result.advertisedRange;
  return (
    <>
      <p className={styles.range}>
        {r.known ? `Advertised ${usd(r.value.lowCents)}–${usd(r.value.highCents)} across ${r.value.count} listings` : "Not enough prices to show a range"}
        {result.origin === "saved_fixture" && <span className={styles.badge}>Saved search from {when(result.retrievedAt)}</span>}
      </p>
      {result.listings.length === 0 ? (
        <p className="muted small">No listings found.</p>
      ) : (
        <ul className={styles.list}>
          {result.listings.map((l) => (
            <li key={l.url}>
              <div className={styles.row}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.title}
                </a>
                <span className="mono">{l.advertisedPriceCents.known ? usd(l.advertisedPriceCents.value) : "no price shown"}</span>
              </div>
              <span className={styles.domain}>{l.domain}</span>
              {l.snippet && <p className={styles.snippet}>{l.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.foot}>
        Results via SerpAPI (Google), retrieved {when(result.retrievedAt)}. {result.disclaimer} The comparison above uses its own synthetic
        scenario price.
      </p>
    </>
  );
}
