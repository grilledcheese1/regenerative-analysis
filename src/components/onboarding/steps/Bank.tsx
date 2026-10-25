"use client";

import { useEffect, useMemo, useState } from "react";
import type { BankingSnapshot, UserBanking } from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { localConnection } from "@/domain/onboarding/connection";
import { fmtUsd, Money, Num } from "../fields";
import s from "../onboarding.module.css";
import type { StepProps } from "./types";

export interface Connection {
  banking: UserBanking;
  snapshot: BankingSnapshot;
  budget: BudgetSnapshot;
  steps: { label: string; count: number }[];
  specKey: string;
}

const PROGRESS = ["Creating your Nessie customer", "Opening checking, savings and a card", "Adding four months of pay, bills and purchases", "Reading it back"];
const LABEL: Record<string, string> = { customers: "customer", accounts: "accounts", loans: "loan record with your credit score", deposits: "deposits", bills: "bills", purchases: "purchases", transfers: "transfers", withdrawals: "withdrawals" };

const MONEY: [keyof StepProps["a"]["money"], string][] = [
  ["takeHomeMonthlyCents", "Take-home pay (monthly)"],
  ["housingCents", "Rent or mortgage"],
  ["utilitiesCents", "Utilities"],
  ["groceriesCents", "Groceries"],
  ["diningShoppingCents", "Dining and shopping"],
  ["subscriptionsCents", "Subscriptions"],
  ["checkingCents", "Checking balance"],
  ["savingsCents", "Savings balance"],
  ["cardBalanceCents", "Credit card balance"],
];

export default function Bank({ a, set, errors, accountId, specKey, connection, onConnect }: StepProps & { accountId: string; specKey: string; connection: Connection | null; onConnect: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  // The live budget, from the same history the connection will create.
  const live = useMemo(() => (Object.values(a.money).some((v) => !Number.isFinite(v)) ? null : localConnection(accountId, a).budget), [a, accountId]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick((n) => Math.min(n + 1, PROGRESS.length - 1)), 1400);
    return () => clearInterval(t);
  }, [busy]);

  const connect = async () => {
    setBusy(true);
    setTick(0);
    setFailed(null);
    try {
      await onConnect();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn't connect");
    } finally {
      setBusy(false);
    }
  };

  const current = connection && connection.specKey === specKey ? connection : null;
  const stale = connection && !current;
  return (
    <>
      <p className={s.kicker}>Your bank</p>
      <h1 className={s.title}>Connect your banking</h1>
      <p className={s.lede}>
        Tell us roughly what comes in and goes out. We build four months of history from it and put it in a new customer in Capital One&rsquo;s Nessie sandbox, then read it back the way a bank connection would. It&rsquo;s a sandbox: no real bank account is used.
      </p>
      <div className={s.split}>
        <div className={s.grid}>
          <Num
            label="About what's your credit score?"
            name="creditScore"
            min={300}
            value={a.credit?.score ?? NaN}
            onValue={(n) => set((x) => ({ ...x, credit: { score: Number.isFinite(n) ? Math.round(n) : null } }))}
            error={errors["credit.score"]}
            hint="300–850. Leave blank if you don't know. Stored on your Nessie loan record."
          />
          {MONEY.map(([k, label]) => (
            <Money key={k} label={label} name={k} cents={a.money[k]} onCents={(c) => set((x) => ({ ...x, money: { ...x.money, [k]: c } }))} error={errors[`money.${k}`]} />
          ))}
        </div>
        <aside className={s.panel} aria-live="polite">
          <span className={s.kicker}>Your car budget</span>
          <span className={`${s.big} ${live && live.vehicleBudgetCents < 0 ? s.neg : ""}`}>{live ? `${fmtUsd(live.vehicleBudgetCents)}/mo` : "—"}</span>
          {live && (
            <ul className={s.rows}>
              <li><span>Income</span><span>{fmtUsd(live.recurringIncomeCents)}</span></li>
              <li><span>− Other spending</span><span>{fmtUsd(live.otherMonthlySpendingCents)}</span></li>
              <li><span>− Savings and cushion</span><span>{fmtUsd(live.monthlySavingsGoalCents + live.monthlyBufferCents)}</span></li>
              <li><span>= For your car</span><span>{fmtUsd(live.vehicleBudgetCents)}</span></li>
            </ul>
          )}
          <span className={s.hint}>Updates as you type. Car costs (payment, fuel, insurance) are compared per option, so they&rsquo;re not in &ldquo;other spending&rdquo;.</span>

          {busy ? (
            <ul className={s.steps}>
              {PROGRESS.map((p, i) => (
                <li key={p} data-state={i < tick ? "done" : i === tick ? "active" : "todo"}><span className={s.dot}>{i < tick ? "✓" : ""}</span>{p}</li>
              ))}
            </ul>
          ) : current ? (
            <div className={s.card}>
              <span className={s.badge}>{current.banking.mode === "sandbox" ? "Nessie sandbox" : "Local copy"}</span>
              <strong>{current.banking.mode === "sandbox" ? `Connected · customer ${current.banking.nessieCustomerId}` : "History ready"}</strong>
              <ul className={s.steps}>
                {current.steps.map((st) => (
                  <li key={st.label} data-state="done"><span className={s.dot}>✓</span>{st.count} {LABEL[st.label] ?? st.label}</li>
                ))}
              </ul>
              <div className={s.accounts}>
                {current.snapshot.accounts.map((acc) => (
                  <div key={acc.accountId}>
                    <div className={s.hint}>{acc.nickname}</div>
                    <strong>{fmtUsd(acc.type === "Credit Card" ? -acc.balanceCents : acc.balanceCents)}</strong>
                  </div>
                ))}
              </div>
              {current.banking.note && <span className={s.hint}>{current.banking.note}</span>}
            </div>
          ) : (
            <>
              {stale && <span className={s.err}>Your answers changed since you connected. Connect again to update the history.</span>}
              <button type="button" className="m-btn m-btn--primary" onClick={connect} disabled={!live}>Connect with Nessie</button>
              {failed && <span className={s.err} role="alert">{failed}</span>}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
