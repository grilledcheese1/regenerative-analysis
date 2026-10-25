"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OnboardingAnswers, UserBanking } from "@/contracts";
import { bankingSpecFromAnswers } from "@/domain/onboarding/banking";
import { localConnection } from "@/domain/onboarding/connection";
import { buildUserPersona } from "@/domain/onboarding/persona";
import { validateAnswers } from "@/domain/onboarding/validate";
import { useAccount } from "../auth/useAccount";
import s from "./onboarding.module.css";
import Bank, { type Connection } from "./steps/Bank";
import Car from "./steps/Car";
import Contract from "./steps/Contract";
import Driving from "./steps/Driving";
import Goals from "./steps/Goals";
import Insurance from "./steps/Insurance";
import Review from "./steps/Review";
import Welcome from "./steps/Welcome";
import { DRAFT_KEY as DRAFT } from "./localProfile";
import { useMyProfile } from "./useMyProfile";

const STEPS = ["welcome", "car", "contract", "insurance", "driving", "goals", "bank", "review"] as const;
type Step = (typeof STEPS)[number];
// Which answer sections each step validates before Continue.
const CHECKS: Partial<Record<Step, (keyof OnboardingAnswers)[]>> = {
  car: ["car"],
  contract: ["contract"],
  insurance: ["insurance"],
  driving: ["driving"],
  goals: ["goals"],
  bank: ["money", "credit"],
};

const defaults = (name: string): OnboardingAnswers => ({
  name,
  car: { catalogId: "camry_hybrid_le_2024", odometerMiles: 30000, estimatedValueCents: 2400000 },
  contract: { type: "owned" },
  money: { takeHomeMonthlyCents: 500000, housingCents: 150000, utilitiesCents: 15000, groceriesCents: 50000, diningShoppingCents: 30000, subscriptionsCents: 5000, checkingCents: 300000, savingsCents: 500000, cardBalanceCents: 30000 },
  driving: { monthlyMiles: 800, cityShare: 0.5, source: "user_reported" },
  insurance: { monthlyCents: 15000, source: "user_reported", policy: null },
  credit: { score: null },
  goals: { monthlySavingsGoalCents: 30000, monthlyBufferCents: 15000, protectedCashReserveCents: 300000, objective: "preserve_cash_then_minimize_cost" },
});

interface Draft {
  accountId: string;
  answers: OnboardingAnswers;
  step: Step;
  connection: Connection | null;
}
const readDraft = (accountId: string): Draft | null => {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as Draft | null;
    return d?.accountId === accountId ? d : null;
  } catch {
    return null;
  }
};

/** The onboarding wizard. Its answers become the user's own profile. */
export default function Onboarding({ edit }: { edit: boolean }) {
  const router = useRouter();
  const { account, ready } = useAccount();
  const mine = useMyProfile();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dir, setDir] = useState(1);
  const [importing, setImporting] = useState<"off" | "saving" | "on">("off");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !account) router.replace("/");
  }, [ready, account, router]);

  // Start from: a draft in this tab, else (editing) the saved profile, else defaults.
  useEffect(() => {
    if (!account || draft) return;
    const saved = readDraft(account.accountId);
    if (!saved && edit && mine.status === "loading") return;
    const fromProfile = edit && mine.profile;
    const initial: Draft = saved ?? { accountId: account.accountId, answers: fromProfile ? mine.profile!.answers : defaults(account.name), step: fromProfile ? "review" : "welcome", connection: null };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time initialization once the account and profile are known
    setDraft(initial);
  }, [account, draft, edit, mine.status, mine.profile]);

  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify(draft));
    } catch {
      // Storage unavailable: the draft lives only in memory.
    }
  }, [draft]);

  const accountId = account?.accountId ?? "";
  const specKey = useMemo(() => {
    if (!draft) return "";
    try {
      return JSON.stringify(bankingSpecFromAnswers(draft.answers, buildUserPersona(accountId, draft.answers)));
    } catch {
      return "";
    }
  }, [draft, accountId]);

  // Editing: the saved profile's banking counts as connected until an answer that feeds it changes.
  // Rebuilt locally: re-running the connection would seed another Nessie customer.
  useEffect(() => {
    if (!draft || draft.connection || !edit || !mine.profile || draft.answers !== mine.profile.answers) return;
    const p = mine.profile;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived once from the saved profile
    setDraft((d) => (d ? { ...d, connection: { ...localConnection(p.accountId, p.answers), banking: p.banking, specKey } } : d));
  }, [draft, edit, mine.profile, specKey]);

  const set = useCallback((update: (a: OnboardingAnswers) => OnboardingAnswers) => setDraft((d) => (d ? { ...d, answers: update(d.answers) } : d)), []);

  if (!draft || !account) return null;
  const a = draft.answers;
  const index = STEPS.indexOf(draft.step);
  const connected = draft.connection?.specKey === specKey;

  const goTo = (step: Step) => {
    setDir(STEPS.indexOf(step) >= index ? 1 : -1);
    setErrors({});
    setDraft((d) => (d ? { ...d, step } : d));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => {
    const keys = CHECKS[draft.step];
    if (keys) {
      const e = validateAnswers(Object.fromEntries(keys.map((k) => [k, a[k]])) as Partial<OnboardingAnswers>);
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    goTo(STEPS[index + 1]);
  };

  const ensureDraftProfile = async () => {
    setImporting("saving");
    const banking: UserBanking = mine.profile?.banking ?? { mode: "fixture", nessieCustomerId: null, connectedAt: new Date().toISOString(), note: "Not connected yet" };
    try {
      await mine.save(a, banking);
      setImporting("on");
    } catch {
      setImporting("off");
    }
  };

  const connect = async () => {
    const res = await fetch("/api/onboarding/connect-bank", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: a }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error?.message ?? "Couldn't connect");
    setDraft((d) => (d ? { ...d, connection: { ...body, specKey } } : d));
  };

  const finish = async () => {
    if (!draft.connection) return;
    setSaving(true);
    setSaveError(null);
    try {
      await mine.save(a, draft.connection.banking);
      sessionStorage.removeItem(DRAFT);
      router.push("/home");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save");
      setSaving(false);
    }
  };

  const props = { a, set, errors };
  return (
    <>
      <header className="header">
        <div className="wordmark">
          <Image src="/regentic-logo.png" alt="" width={310} height={286} className="wordmark__logo" priority />
          <span>Regen<em>tic</em></span>
        </div>
        <span className="muted small" style={{ marginLeft: "auto" }}>Step {index + 1} of {STEPS.length}</span>
      </header>
      <main className={s.page}>
        <ol className={s.rail} aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((st, i) => (
            <li key={st} data-done={i < index} data-current={i === index} />
          ))}
        </ol>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={draft.step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.24, ease: "easeOut" } }}
            exit={{ opacity: 0, x: dir * -24, transition: { duration: 0.14, ease: "easeIn" } }}
          >
            {draft.step === "welcome" && <Welcome name={a.name} />}
            {draft.step === "car" && <Car {...props} />}
            {draft.step === "contract" && <Contract {...props} />}
            {draft.step === "insurance" && <Insurance {...props} />}
            {draft.step === "driving" && <Driving {...props} personaId={`u_${accountId}`} importing={importing} onImport={ensureDraftProfile} />}
            {draft.step === "goals" && <Goals {...props} />}
            {draft.step === "bank" && <Bank {...props} accountId={accountId} specKey={specKey} connection={draft.connection} onConnect={connect} />}
            {draft.step === "review" && draft.connection && <Review a={a} connection={draft.connection} goTo={(st) => goTo(st as Step)} />}
          </motion.div>
        </AnimatePresence>
        <nav className={s.nav} aria-label="Onboarding">
          {index > 0 ? (
            <button type="button" className="m-btn m-btn--ghost" onClick={() => goTo(STEPS[index - 1])}>Back</button>
          ) : (
            <span />
          )}
          {draft.step === "review" ? (
            <button type="button" className="m-btn m-btn--primary" onClick={finish} disabled={saving || !connected}>
              {saving ? "Saving…" : "Finish"}
            </button>
          ) : (
            <button type="button" className="m-btn m-btn--primary" onClick={next} disabled={draft.step === "bank" && !connected}>
              {draft.step === "welcome" ? "Let's go" : "Continue"}
            </button>
          )}
        </nav>
        {draft.step === "review" && !connected && <p className={s.err}>Your answers changed since you connected your bank. Go back to Bank and connect again.</p>}
        {saveError && <p className={s.err} role="alert">{saveError}</p>}
      </main>
    </>
  );
}
