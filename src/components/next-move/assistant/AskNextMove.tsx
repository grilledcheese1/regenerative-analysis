"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { AssistantAnswer, AssistantFallbackReason, CompareRequest, CompareResponse } from "@/contracts";
import styles from "./AskNextMove.module.css";
import DealerList from "../market/DealerList";
import EyeFollow from "./EyeFollow";

export type AssistantTab = "home" | "drives" | "money" | "compare" | "next" | "settings";

interface AskNextMoveProps {
  request: CompareRequest;
  tab: AssistantTab;
  /** id → label for evidence and option ids, so cited sources read as words. */
  labels: Record<string, string>;
  /** Same highlight behavior as AiExplanation: the shell lights up the cited evidence. */
  onCite: (ids: string[]) => void;
}

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer: AssistantAnswer }
  | { id: number; role: "error"; text: string };

const REASON: Record<AssistantFallbackReason, string> = {
  not_configured: "not configured",
  timeout: "took too long",
  provider_error: "service error",
  daily_cap: "daily limit reached",
  validation_failed: "it didn't match the calculation",
  rate_limited: "too many questions",
};

const PROVIDER_NAME = { meta: "Muse Spark", anthropic: "Claude" } as const;

const TAB_CHIPS: Partial<Record<AssistantTab, string>> = {
  compare: "Why is this option leading?",
  money: "How much can I afford?",
  next: "What do I do next?",
};

const MAX_HISTORY = 6;

/**
 * "Ask Next Move": a drawer where a customer asks about their own comparison. Every answer comes
 * from POST /api/assistant, which only phrases figures the domain layer calculated. What-if
 * answers live in the chat and never change the screens.
 */
export default function AskNextMove({ request, tab, labels, onCite }: AskNextMoveProps) {
  const [open, setOpen] = useState(false);
  const [dealersOpen, setDealersOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dealerBtnRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  // The comparison snapshot for the request on screen. A changed request needs a new one.
  const snapshot = useRef<{ key: string; id: string } | null>(null);
  const key = JSON.stringify(request);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const trigger = triggerRef.current;
    return () => trigger?.focus();
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  const ensureComparison = useCallback(
    async (force: boolean): Promise<string | null> => {
      if (!force && snapshot.current?.key === key) return snapshot.current.id;
      const res = await fetch("/api/options/compare", { method: "POST", headers: { "content-type": "application/json" }, body: key });
      if (!res.ok) return null;
      const body = (await res.json()) as CompareResponse;
      snapshot.current = { key, id: body.comparisonId };
      return body.comparisonId;
    },
    [key],
  );

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      const history = messages
        .filter((m): m is Extract<Message, { role: "user" | "assistant" }> => m.role !== "error")
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, text: (m.role === "user" ? m.text : m.answer.answer).slice(0, 500) }));
      setMessages((m) => [...m, { id: nextId.current++, role: "user", text: question }]);
      setDraft("");
      setBusy(true);
      setFollowUps([]);
      const fail = (text: string) => setMessages((m) => [...m, { id: nextId.current++, role: "error", text }]);
      try {
        let comparisonId = await ensureComparison(false);
        if (!comparisonId) return fail("Load banking data first, then ask again.");
        let res = await send(comparisonId, question, history);
        if (res.status === 409) {
          // The server restarted or another instance answered: calculate once more and retry.
          comparisonId = await ensureComparison(true);
          if (!comparisonId) return fail("Load banking data first, then ask again.");
          res = await send(comparisonId, question, history);
        }
        if (res.status === 429) return fail("That's a lot of questions at once. Wait a moment and try again.");
        if (!res.ok) return fail("I couldn't answer that right now. Try again in a moment.");
        const answer = (await res.json()) as AssistantAnswer;
        setMessages((m) => [...m, { id: nextId.current++, role: "assistant", answer }]);
        setFollowUps(answer.followUps);
        if (answer.citedEvidenceIds.length > 0) onCite(answer.citedEvidenceIds);
      } catch {
        fail("I couldn't reach the server. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureComparison, messages, onCite],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  // Esc closes; Tab stays inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (dealersOpen) {
        setDealersOpen(false);
        dealerBtnRef.current?.focus();
      } else setOpen(false);
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]")];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (tab === "settings") return null;

  const starters = [TAB_CHIPS[tab], "Why this option?", "What if gas hits $5?"].filter((s): s is string => Boolean(s));
  const chips = followUps.length > 0 ? followUps : [...new Set(starters)];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.fab}
        onClick={() => {
          setDealersOpen(false);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Ask Me Anything!
        <EyeFollow />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              className={styles.scrim}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={styles.panel}
              data-testid="assistant-panel"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onKeyDown={onKeyDown}
            >
              <header className={styles.head}>
                <div>
                  <div className={styles.titleRow}>
                    <h2 id={titleId} className={styles.title}>Ask Next Move</h2>
                    <button
                      ref={dealerBtnRef}
                      type="button"
                      className={styles.dealerBtn}
                      onClick={() => setDealersOpen((v) => !v)}
                      aria-expanded={dealersOpen}
                      aria-controls={`${titleId}-dealers`}
                    >
                      Contact the dealer
                    </button>
                  </div>
                  <p className={styles.sub}>AI assistant · answers use your simulated numbers · estimates, not a quote</p>
                </div>
                <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close assistant">
                  ×
                </button>
              </header>

              <div className={styles.body}>

              <div ref={logRef} className={styles.log} aria-live="polite" aria-relevant="additions">
                {messages.length === 0 && (
                  <p className={styles.empty}>Ask about your comparison: why an option leads, what it costs, or what happens if gas goes up.</p>
                )}
                {messages.map((m) =>
                  m.role === "user" ? (
                    <p key={m.id} className={styles.user}>{m.text}</p>
                  ) : m.role === "error" ? (
                    <p key={m.id} className={styles.error} role="alert">{m.text}</p>
                  ) : (
                    <AnswerBubble key={m.id} answer={m.answer} labels={labels} onCite={onCite} />
                  ),
                )}
                {busy && <p className={styles.thinking}>Checking your numbers…</p>}
              </div>

              <div className={styles.chips}>
                {chips.map((c) => (
                  <button key={c} type="button" className={styles.chip} disabled={busy} onClick={() => void ask(c)}>
                    {c}
                  </button>
                ))}
              </div>

              <form className={styles.form} onSubmit={onSubmit}>
                <label htmlFor={`${titleId}-q`} className="sr-only">Your question</label>
                <input
                  id={`${titleId}-q`}
                  ref={inputRef}
                  className={styles.input}
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask a question…"
                  autoComplete="off"
                />
                <button type="submit" className={styles.send} disabled={busy || draft.trim().length === 0}>
                  Send
                </button>
              </form>

              <AnimatePresence>
                {dealersOpen && (
                  <motion.div
                    key="dealers"
                    id={`${titleId}-dealers`}
                    role="region"
                    aria-label="Toyota dealerships near you"
                    className={styles.dealerSheet}
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20, transition: { duration: 0.16, ease: "easeIn" } }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    <div className={styles.dealerHead}>
                      <strong>Contact a dealer</strong>
                      <button type="button" className={styles.dealerClose} onClick={() => setDealersOpen(false)}>
                        ← Back to chat
                      </button>
                    </div>
                    <DealerList near="Austin, TX" />
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function send(comparisonId: string, question: string, history: { role: "user" | "assistant"; text: string }[]) {
  return fetch("/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: "1.0", comparisonId, question, history }),
  });
}

function AnswerBubble({ answer, labels, onCite }: { answer: AssistantAnswer; labels: Record<string, string>; onCite: (ids: string[]) => void }) {
  const badge =
    answer.mode === "ai" && answer.provider
      ? `${PROVIDER_NAME[answer.provider]} · checked against your numbers`
      : `Standard answer${answer.fallbackReason ? ` (AI unavailable: ${REASON[answer.fallbackReason]})` : ""}`;
  const cites = answer.citedEvidenceIds.filter((id) => labels[id]);
  return (
    <div className={styles.bubble} data-mode={answer.mode}>
      <span className={styles.badge}>{badge}</span>
      <p className={styles.answer}>{answer.answer}</p>
      {answer.whatIf && (
        <div className={styles.whatif} data-testid="assistant-whatif">
          <span className={styles.whatifLabel}>What-if</span>
          <p className={styles.whatifHead}>{answer.whatIf.headline}</p>
          <p className={styles.whatifVerdict}>{answer.whatIf.decisionChanged ? "The recommendation changed." : "The recommendation did not change."}</p>
          <p className={styles.whatifNote}>Only in this chat. Your screens are unchanged.</p>
        </div>
      )}
      {cites.length > 0 && (
        <p className={styles.cites}>
          Based on:{" "}
          {cites.map((id) => (
            <button key={id} type="button" className={styles.cite} onClick={() => onCite([id])}>
              {labels[id]}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
