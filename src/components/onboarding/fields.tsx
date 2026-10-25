"use client";

import type { ReactNode } from "react";
import s from "./onboarding.module.css";

export const toCents = (dollars: string) => (dollars.trim() === "" ? NaN : Math.round(Number(dollars) * 100));
export const fmtUsd = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
      {hint && <span className={s.hint}>{hint}</span>}
      {error && <span className={s.err}>{error}</span>}
    </label>
  );
}

/** A dollars input bound to a cents value. */
export function Money({ label, cents, onCents, error, hint, name }: { label: string; cents: number; onCents: (c: number) => void; error?: string; hint?: ReactNode; name: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <span className={s.money}>
        <span aria-hidden="true">$</span>
        <input name={name} inputMode="decimal" type="number" min={0} step="1" value={Number.isFinite(cents) ? cents / 100 : ""} onChange={(e) => onCents(toCents(e.target.value))} aria-invalid={Boolean(error)} />
      </span>
    </Field>
  );
}

export function Num({ label, value, onValue, error, hint, name, min = 0, step = 1 }: { label: string; value: number; onValue: (n: number) => void; error?: string; hint?: ReactNode; name: string; min?: number; step?: number }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <input name={name} inputMode="numeric" type="number" min={min} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onValue(e.target.value === "" ? NaN : Number(e.target.value))} aria-invalid={Boolean(error)} />
    </Field>
  );
}

export function Slider({ label, value, min, max, step, onValue, format, name }: { label: string; value: number; min: number; max: number; step: number; onValue: (n: number) => void; format: (n: number) => string; name: string }) {
  return (
    <label className={s.slider}>
      <span>{label}</span>
      <output htmlFor={name}>{format(value)}</output>
      <input id={name} name={name} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onValue(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

export function Choice({ pressed, onClick, title, sub }: { pressed: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button type="button" className={s.choice} aria-pressed={pressed} onClick={onClick}>
      <strong>{title}</strong>
      {sub && <span>{sub}</span>}
    </button>
  );
}
