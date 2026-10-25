"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { Persona } from "@/contracts";
import { catalogVehicle } from "@/fixtures/catalog";
import { PEOPLE } from "@/fixtures/personas";
import { signIn, signOut, useSignedInId } from "./auth";

const SITUATION = { lease: "Lease", loan: "Loan", owned: "Paid off" } as const;
const vehicleName = (p: Persona) => {
  const v = catalogVehicle(p.vehicle.catalogId);
  return `${v.modelYear} ${v.model}`;
};

/** Fake sign-in. Opens a list of the simulated people; choosing one "signs in" as them. No passwords, no accounts. */
export default function SignIn({ label, variant = "ghost" }: { label?: string; variant?: "ghost" | "primary" }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const signedInId = useSignedInId();
  const me = PEOPLE.find((p) => p.id === signedInId);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PEOPLE.filter((p) => `${p.profile.displayName} ${vehicleName(p)}`.toLowerCase().includes(q)) : PEOPLE;
  }, [query]);

  const choose = (id: string) => {
    signIn(id);
    dialog.current?.close();
    router.push("/home");
  };

  return (
    <>
      <span className="auth">
        {me && <span className="auth__who">Signed in as <strong>{me.profile.displayName}</strong></span>}
        <button type="button" className={`m-btn m-btn--${variant}`} onClick={() => { setQuery(""); dialog.current?.showModal(); }}>
          {label ?? (me ? "Switch person" : "Sign in")}
        </button>
        {me && (
          <button type="button" className="auth__out" onClick={() => { signOut(); router.push("/next-move"); }}>
            Sign out
          </button>
        )}
      </span>

      <dialog ref={dialog} className="m-dialog signin" aria-labelledby="signin-title">
        <h2 id="signin-title">Sign in</h2>
        <p className="m-dialog__demo">DEMO ONLY. Pick a simulated person. There are no passwords or real accounts.</p>
        <label className="signin__search">
          <span className="sr-only">Search people</span>
          <input type="search" placeholder="Search by name or car" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="signin__list">
          <AnimatePresence initial={false}>
            {shown.map((p) => (
              <motion.li key={p.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                <button type="button" className="signin__row" onClick={() => choose(p.id)} aria-current={p.id === signedInId ? "true" : undefined}>
                  <span className="signin__name">{p.profile.displayName}</span>
                  <span className="signin__meta">{vehicleName(p)}</span>
                  <span className="signin__tag">{SITUATION[p.contract.type]}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {shown.length === 0 && <li className="muted">No one matches that search.</li>}
        </ul>
        <div className="m-dialog__buttons">
          <button type="button" className="m-btn m-btn--ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
}
