"use client";

import { useEffect, useState } from "react";
import type { DealerSearchResult } from "@/contracts";
import styles from "./Market.module.css";

export interface DealerListProps {
  near: string;
}

type State = { kind: "loading" } | { kind: "ready"; result: DealerSearchResult } | { kind: "error"; message: string };

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Nearby Toyota dealers for the "compare confirmed offers" next step. The app requests nothing from them. */
export default function DealerList({ near }: DealerListProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market/dealers", { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        setState(res.ok ? { kind: "ready", result: body as DealerSearchResult } : { kind: "error", message: body.error?.message ?? "Dealer search unavailable right now" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error", message: "Dealer search unavailable right now" });
      });
    return () => controller.abort();
  }, []);

  return (
    <section className={styles.dealers} aria-live="polite">
      <span className="label">Toyota dealers near {near.replace(/, TX$/, "")}</span>
      {state.kind === "loading" && (
        <div className={styles.skeleton} aria-busy="true">
          Finding dealers…
        </div>
      )}
      {state.kind === "error" && <p className="muted small">{state.message}.</p>}
      {state.kind === "ready" && (
        <>
          <ul className={styles.list}>
            {state.result.dealers.map((d) => (
              <li key={d.name + d.address}>
                <div className={styles.row}>
                  {d.website ? (
                    <a href={d.website} target="_blank" rel="noopener noreferrer">
                      {d.name}
                    </a>
                  ) : (
                    <span>{d.name}</span>
                  )}
                  {d.rating.known && <span className="mono">★ {d.rating.value.toFixed(1)}</span>}
                </div>
                <span className={styles.domain}>
                  {d.address}
                  {d.phone && ` · ${d.phone}`}
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.foot}>
            Contact a dealer for a written quote. This app doesn&apos;t request one for you. Results via SerpAPI (Google Maps), retrieved {when(state.result.retrievedAt)}
            {state.result.origin === "saved_fixture" ? " (saved search)" : ""}.
          </p>
        </>
      )}
    </section>
  );
}
