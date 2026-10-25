"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompareRequest, EvidenceFact, Explanation, FallbackReason, Recommendation, RecommendationRecord } from "@/contracts";
import styles from "./AiExplanation.module.css";

interface AiExplanationProps {
  request: CompareRequest;
  recommendation: Recommendation;
  evidence: EvidenceFact[];
  /** Evidence ids Claude cited, so the shell can highlight them in the evidence list. */
  onCite?: (ids: string[]) => void;
}

const REASON: Record<FallbackReason, string> = {
  not_configured: "not configured",
  timeout: "took too long",
  provider_error: "service error",
  daily_cap: "daily limit reached",
  validation_failed: "it didn't match the calculation",
};

const DEBOUNCE_MS = 800;

type View =
  | { kind: "template"; note?: string }
  | { kind: "loading" }
  | { kind: "ai"; explanation: Explanation };

/**
 * Shows the deterministic template at once, then swaps in Claude's explanation when the
 * server returns one that passed validation. The decision itself never changes here.
 */
export default function AiExplanation({ request, recommendation, evidence, onCite }: AiExplanationProps) {
  const key = JSON.stringify(request);
  const [result, setResult] = useState<{ key: string; view: View } | null>(null);
  // A result for an earlier request is stale: show "loading" until this request's result lands.
  const view: View = result?.key === key ? result.view : { kind: "loading" };
  // Parents often pass an inline callback; a ref keeps it out of the effect's dependencies.
  const citeRef = useRef(onCite);
  useEffect(() => {
    citeRef.current = onCite;
  }, [onCite]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const finish = (v: View) => {
      if (!signal.aborted) setResult({ key, view: v });
    };

    const compare = () =>
      fetch("/api/options/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: key,
        signal,
      });

    const timer = setTimeout(async () => {
      try {
        let attempt = 0;
        while (attempt < 2) {
          attempt++;
          const cRes = await compare();
          const cBody = await cRes.json();
          if (!cRes.ok) {
            finish({
              kind: "template",
              note:
                cBody.error?.code === "banking_not_loaded_resync"
                  ? "Re-sync banking to refresh the explanation."
                  : "AI explanation unavailable right now.",
            });
            return;
          }
          const rRes = await fetch("/api/recommendations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ comparisonId: cBody.comparisonId, explain: true }),
            signal,
          });
          const rBody = await rRes.json();
          if (rRes.status === 409 && rBody.error?.code === "comparison_not_found_resync") continue; // another instance; recompute once
          if (!rRes.ok) {
            finish({ kind: "template", note: "AI explanation unavailable right now." });
            return;
          }
          const record = rBody as RecommendationRecord;
          const e = record.explanation;
          // Belt and braces: never show text for a decision other than the one on screen.
          if (e.mode === "ai" && record.recommendation.nextAction === recommendation.nextAction) {
            finish({ kind: "ai", explanation: e });
            citeRef.current?.(e.citedEvidenceIds);
          } else {
            finish({
              kind: "template",
              note: `Template explanation (AI explanation unavailable: ${REASON[e.fallbackReason ?? "provider_error"]}).`,
            });
          }
          return;
        }
        finish({ kind: "template", note: "AI explanation unavailable right now." });
      } catch {
        if (!signal.aborted) finish({ kind: "template", note: "AI explanation unavailable right now." });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, recommendation.nextAction]);

  const labelById = useMemo(() => new Map(evidence.map((e) => [e.id, e.label])), [evidence]);

  return (
    <div className={styles.wrap} aria-live="polite">
      {view.kind === "ai" ? (
        <>
          <span className={styles.badge}>Explained by Claude · every number checked against the calculation</span>
          <p className={styles.summary}>{view.explanation.summary}</p>
          {view.explanation.tradeoffs.length > 0 && (
            <>
              <span className="label">Tradeoffs</span>
              <ul className={styles.list}>
                {view.explanation.tradeoffs.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {view.explanation.missingInfo.length > 0 && (
            <>
              <span className="label">Still missing</span>
              <ul className={styles.list}>
                {view.explanation.missingInfo.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.cites}>
            Based on:{" "}
            {view.explanation.citedEvidenceIds
              .map((id) => labelById.get(id))
              .filter(Boolean)
              .join(" · ") || "the comparison above"}
          </p>
        </>
      ) : (
        <p className={styles.note}>
          {view.kind === "loading"
            ? "Checking for an AI explanation…"
            : (view.note ?? "Explanation generated by a deterministic template from the calculated comparison.")}
        </p>
      )}
    </div>
  );
}
