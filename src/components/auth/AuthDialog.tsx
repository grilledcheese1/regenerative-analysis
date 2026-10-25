"use client";

import { useRouter } from "next/navigation";
import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent } from "react";
import { exitCaseStudy } from "./caseStudy";
import { signInWithPassword, signUp, type AuthResult } from "./useAccount";

export type AuthMode = "signup" | "signin";
export interface AuthDialogHandle {
  open(mode: AuthMode): void;
}

/** Create-account and sign-in forms for demo accounts. */
const AuthDialog = forwardRef<AuthDialogHandle>(function AuthDialog(_, ref) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>("signup");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Extract<AuthResult, { ok: false }> | null>(null);

  useImperativeHandle(ref, () => ({
    open(m) {
      setMode(m);
      setResult(null);
      dialog.current?.showModal();
    },
  }));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    setBusy(true);
    const r = mode === "signup" ? await signUp({ name: String(f.get("name") ?? ""), email, password }) : await signInWithPassword(email, password);
    setBusy(false);
    if (!r.ok) return setResult(r);
    exitCaseStudy();
    dialog.current?.close();
    router.push(mode === "signup" ? "/onboarding" : "/home");
  };

  const err = (field: string) => result?.fieldErrors?.[field];
  const switchTo = (m: AuthMode) => {
    setMode(m);
    setResult(null);
  };

  return (
    <dialog ref={dialog} className="m-dialog authdlg" aria-labelledby="auth-title">
      <div className="authdlg__tabs" role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => switchTo("signup")}>Create account</button>
        <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => switchTo("signin")}>Sign in</button>
      </div>
      <h2 id="auth-title" className="sr-only">{mode === "signup" ? "Create account" : "Sign in"}</h2>
      <form key={mode} className="authdlg__form" onSubmit={submit} noValidate>
        {mode === "signup" && (
          <label>
            <span>Name</span>
            <input name="name" autoComplete="given-name" required maxLength={60} aria-invalid={Boolean(err("name"))} />
            {err("name") && <small className="authdlg__err">{err("name")}</small>}
          </label>
        )}
        <label>
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required aria-invalid={Boolean(err("email"))} />
          {err("email") && <small className="authdlg__err">{err("email")}</small>}
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} aria-invalid={Boolean(err("password"))} />
          {err("password") && <small className="authdlg__err">{err("password")}</small>}
        </label>
        {mode === "signup" && <p className="m-dialog__demo">Demo accounts live on this server and in this browser. Don&rsquo;t reuse a real password.</p>}
        {result && !result.fieldErrors && <p className="authdlg__err" role="alert">{result.message}</p>}
        {result?.hint && <p className="muted small">{result.hint}</p>}
        <div className="m-dialog__buttons">
          <button type="submit" className="m-btn m-btn--primary" disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
          <button type="button" className="m-btn m-btn--ghost" onClick={() => dialog.current?.close()}>Cancel</button>
        </div>
      </form>
    </dialog>
  );
});

export default AuthDialog;
