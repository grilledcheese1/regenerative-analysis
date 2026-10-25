"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Persona } from "@/contracts";
import { catalogVehicle } from "@/fixtures/catalog";
import { PEOPLE } from "@/fixtures/personas";
import { openCaseStudy, useCaseStudyId } from "./caseStudy";

const SITUATION = { lease: "Lease", loan: "Loan", owned: "Paid off" } as const;
const vehicleName = (p: Persona) => {
  const v = catalogVehicle(p.vehicle.catalogId);
  return `${v.modelYear} ${v.model}`;
};

export interface CaseStudyPickerHandle {
  open(): void;
}

/** The list of simulated case studies. Choosing one opens it on /home. Not a sign-in. */
const CaseStudyPicker = forwardRef<CaseStudyPickerHandle, { trigger?: { label: string; variant: "ghost" | "primary" } }>(function CaseStudyPicker({ trigger }, ref) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const openId = useCaseStudyId();
  const [query, setQuery] = useState("");

  const show = () => {
    setQuery("");
    dialog.current?.showModal();
  };
  useImperativeHandle(ref, () => ({ open: show }));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PEOPLE.filter((p) => `${p.profile.displayName} ${vehicleName(p)}`.toLowerCase().includes(q)) : PEOPLE;
  }, [query]);

  const choose = (id: string) => {
    openCaseStudy(id);
    dialog.current?.close();
    router.push("/home");
  };

  return (
    <>
      {trigger && (
        <button type="button" className={`m-btn m-btn--${trigger.variant}`} onClick={show}>
          {trigger.label}
        </button>
      )}
      <dialog ref={dialog} className="m-dialog signin" aria-labelledby="casestudy-title">
        <h2 id="casestudy-title">Explore a case study</h2>
        <p className="m-dialog__demo">SIMULATED. Each person has a made-up contract, bank history and commute.</p>
        <label className="signin__search">
          <span className="sr-only">Search case studies</span>
          <input type="search" placeholder="Search by name or car" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="signin__list">
          <AnimatePresence initial={false}>
            {shown.map((p) => (
              <motion.li key={p.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                <button type="button" className="signin__row" onClick={() => choose(p.id)} aria-current={p.id === openId ? "true" : undefined}>
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
});

export default CaseStudyPicker;
