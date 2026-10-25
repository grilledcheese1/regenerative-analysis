"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BankingSyncState, ConsentPurpose, ConsentState, Maybe, Persona, SourceKind } from "@/contracts";
import { usd } from "@/domain/format";
import { SourceChip } from "../Evidence";

const CONSENT_ROWS: { purpose: ConsentPurpose; label: string }[] = [
  { purpose: "driving_analysis", label: "Use my imported drives for personal analysis" },
  { purpose: "banking_analysis", label: "Use banking data for affordability" },
];

function maybeText(m: Maybe<number>, fmt: (n: number) => string): string {
  return m.known ? fmt(m.value) : `unknown — ${m.reason}`;
}

function Row({ k, v, source }: { k: string; v: string; source?: SourceKind }) {
  return (
    <li>
      <span>{k}</span>
      <span className="mono">
        {v} {source && <SourceChip source={source} />}
      </span>
    </li>
  );
}

function VehicleCard({ persona }: { persona: Persona }) {
  const v = persona.vehicle;
  const c = persona.contract;
  return (
    <div className="card">
      <span className="label">Vehicle and contract</span>
      <ul className="plain">
        <Row k="Odometer" v={`${v.odometerMiles.toLocaleString()} mi (as of ${v.odometerObservedAt})`} source="user_reported" />
        <Row k="Estimated value" v={maybeText(v.estimatedValueCents, (n) => usd(n))} source={v.valuationSource} />
        {c.type === "lease" && (
          <>
            <Row k="Lease maturity" v={c.maturityDate} source="synthetic" />
            <Row k="Allowed miles" v={c.totalAllowedMiles.toLocaleString()} source="synthetic" />
            <Row k="Excess mileage rate" v={`${usd(c.excessCentsPerMile, 2)}/mi`} source="synthetic" />
            <Row k="Purchase option" v={maybeText(c.purchaseOptionCents, (n) => usd(n))} source="synthetic" />
            <Row k="Buyout quote" v={c.buyoutQuote.known ? usd(c.buyoutQuote.value.amountCents) : `unknown — ${c.buyoutQuote.reason}`} />
          </>
        )}
        {c.type === "loan" && (
          <>
            <Row k="Payoff" v={`${usd(c.payoffCents)} (${c.payoffDate})`} source="synthetic" />
            <Row k="APR" v={`${(c.aprBps / 100).toFixed(2)}%`} source="synthetic" />
            <Row k="Payment" v={`${usd(c.paymentCents)}/mo`} source="synthetic" />
            <Row k="Remaining months" v={String(c.remainingMonths)} source="synthetic" />
          </>
        )}
        {c.type === "owned" && <Row k="Contract" v="Owned outright" source="synthetic" />}
      </ul>
      <p className="muted small">Editing vehicle and contract details is planned. The demo uses synthetic contracts.</p>
    </div>
  );
}

export function SettingsScreen({
  persona,
  banking,
  onDeleted,
}: {
  persona: Persona;
  banking: BankingSyncState;
  onDeleted: () => void;
}) {
  const { bank, loading } = banking;
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [consentNote, setConsentNote] = useState<string | null>("Loading permissions…");
  const [deleted, setDeleted] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const loadConsents = useCallback(async () => {
    try {
      const res = await fetch("/api/consents");
      if (!res.ok) throw new Error(String(res.status));
      setConsent((await res.json()) as ConsentState);
      setConsentNote(null);
    } catch {
      setConsent(null);
      setConsentNote("Could not load permission settings.");
    }
  }, []);

  useEffect(() => {
    // Fetch once on mount; state is set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConsents();
  }, [loadConsents]);

  async function toggle(purpose: ConsentPurpose, granted: boolean) {
    try {
      const res = await fetch("/api/consents", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose, granted }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setConsent((await res.json()) as ConsentState);
      setConsentNote(null);
    } catch {
      setConsentNote("Could not save that permission. Nothing changed.");
    }
  }

  async function confirmDelete() {
    setDeleteError(null);
    try {
      const res = await fetch("/api/me/data", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      const stores: string[] = body.deleted ?? [];
      setDeleted(stores.length ? `Deleted: ${stores.join(", ")}` : "Nothing stored yet");
      onDeleted();
    } catch (e) {
      setDeleted(null);
      setDeleteError(`Could not delete: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      dialog.current?.close();
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="label">Settings</span>
        <h2>What this demo knows and what it may use</h2>
      </div>
      <div className="grid-2">
        <VehicleCard persona={persona} />
        <div className="card">
          <span className="label">Connections</span>
          <ul className="plain">
            <li>
              <span>Banking</span>
              <span className="mono muted">
                {bank ? `${banking.stale ? "stale sandbox read" : bank.mode === "sandbox" ? "Nessie sandbox" : "Nessie-format fixture"} · retrieved ${new Date(bank.retrievedAt).toLocaleString()}` : "not loaded"}
              </span>
            </li>
          </ul>
          <button
            className="btn"
            disabled={loading || !banking.sandboxReady}
            title={banking.sandboxReady ? "Read this customer from the Nessie sandbox" : "Set NESSIE_API_KEY and NESSIE_CUSTOMERS to enable"}
            onClick={() => banking.sync("sandbox")}
          >
            Sync
          </button>
          <ul className="plain" style={{ marginTop: "1rem" }}>
            <li>
              <span>Toyota vehicle records</span>
              <span className="chip">Planned integration</span>
            </li>
          </ul>
          <button className="btn" disabled title="Requires a verified data format and permission">
            Connect Toyota records
          </button>
          <p className="muted small">Requires a verified data format and permission.</p>
          <ul className="plain">
            <li>
              <span>Insurer sharing</span>
              <span className="chip">Planned integration</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <div className="card">
          <span className="label">Permissions</span>
          {CONSENT_ROWS.map((r) => (
            <label key={r.purpose} className="check">
              <input
                type="checkbox"
                id={`consent-${r.purpose}`}
                name={`consent-${r.purpose}`}
                checked={consent?.effective[r.purpose]?.granted ?? false}
                disabled={!consent}
                onChange={(e) => toggle(r.purpose, e.target.checked)}
              />
              {r.label}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" id="consent-insurer" name="consent-insurer" checked={false} disabled />
            Share with an insurer (planned integration: no insurer receives data from this demo)
          </label>
          {consent && (
            <p className="muted small mono">
              {CONSENT_ROWS.map((r) => {
                const e = consent.effective[r.purpose];
                return e ? `${r.purpose}: v${e.version}, ${new Date(e.at).toLocaleString()}` : `${r.purpose}: not set`;
              }).join(" · ")}
            </p>
          )}
          {consentNote && <p className="excl">{consentNote}</p>}
          <p className="muted small">
            Turning a permission off stops future use; it doesn&apos;t erase what&apos;s already here. Use Delete below for that.
          </p>
        </div>
        <div className="card">
          <span className="label">Delete my demo data</span>
          <p className="muted small">Removes imported drives, trips and banking snapshots held for this browser session.</p>
          <button className="btn" onClick={() => dialog.current?.showModal()}>
            Delete my demo data
          </button>
          {deleted && <p role="status">{deleted}</p>}
          {deleteError && <p className="excl" role="alert">{deleteError}</p>}
          <dialog ref={dialog} className="confirm" aria-labelledby="del-title">
            <h3 id="del-title">Delete demo data?</h3>
            <p>This clears what the server holds for this session and resets the app to fixture banking.</p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button className="btn" autoFocus onClick={() => dialog.current?.close()}>
                Cancel
              </button>
              <button className="btn primary" onClick={confirmDelete}>
                Confirm delete
              </button>
            </div>
          </dialog>
        </div>
      </div>
    </section>
  );
}
