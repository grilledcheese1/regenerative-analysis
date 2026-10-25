"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthDialog, { type AuthDialogHandle } from "./AuthDialog";
import CaseStudyPicker, { type CaseStudyPickerHandle } from "./CaseStudyPicker";
import { exitCaseStudy, useCaseStudyId } from "./caseStudy";
import { signOutAccount, useAccount } from "./useAccount";

/**
 * The one identity element in every header: the account menu when signed in, "Exit case study"
 * while browsing a case study without an account, otherwise "Sign in".
 */
export default function IdentityControl() {
  const router = useRouter();
  const pathname = usePathname();
  const { account, ready } = useAccount();
  const caseStudy = useCaseStudyId();
  const auth = useRef<AuthDialogHandle>(null);
  const picker = useRef<CaseStudyPickerHandle>(null);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!ready) return <span className="auth" aria-hidden="true" />;

  const onStory = pathname === "/";
  return (
    <span className="auth">
      {account ? (
        <div className="acct" ref={menu}>
          <button type="button" className="m-btn m-btn--ghost acct__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {account.name} ▾
          </button>
          {open && (
            <div className="acct__menu" role="menu">
              <Link role="menuitem" href={onStory ? "/home" : "/"} onClick={() => setOpen(false)}>{onStory ? "Details view" : "Story view"}</Link>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); picker.current?.open(); }}>Explore a case study</button>
              {caseStudy && (
                <button type="button" role="menuitem" onClick={() => { setOpen(false); exitCaseStudy(); }}>Back to my profile</button>
              )}
              <button type="button" role="menuitem" onClick={async () => { setOpen(false); exitCaseStudy(); await signOutAccount(); router.push("/"); }}>Sign out</button>
            </div>
          )}
        </div>
      ) : caseStudy ? (
        <>
          <button type="button" className="auth__out" onClick={() => { exitCaseStudy(); router.push("/"); }}>Exit case study</button>
          <button type="button" className="m-btn m-btn--ghost" onClick={() => auth.current?.open("signin")}>Sign in</button>
        </>
      ) : (
        <button type="button" className="m-btn m-btn--ghost" onClick={() => auth.current?.open("signin")}>Sign in</button>
      )}
      <AuthDialog ref={auth} />
      <CaseStudyPicker ref={picker} />
    </span>
  );
}
