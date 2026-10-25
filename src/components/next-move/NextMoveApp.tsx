"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DrivesView from "@/components/DrivesView";
import type { BankingSnapshot, DataMode } from "@/contracts";
import { buildBudget } from "@/domain/finance/budget";
import { compareOptions } from "@/domain/recommendations/compare";
import { catalogVehicle, CATALOG } from "@/fixtures/catalog";
import { DEMO_AS_OF, PERSONAS } from "@/fixtures/personas";
import { CompareScreen, HomeScreen, MoneyScreen, NextMoveScreen } from "./screens";

const TABS = ["home", "drives", "money", "compare", "next"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { home: "Home", drives: "Drives", money: "Money", compare: "Compare", next: "Next Move" };

interface SyncError {
  code: string;
  message: string;
  retryable: boolean;
}

export default function NextMoveApp() {
  const [personaId, setPersonaId] = useState(PERSONAS[0].id);
  const persona = PERSONAS.find((p) => p.id === personaId)!;
  const vehicle = catalogVehicle(persona.vehicle.catalogId);
  const [tab, setTab] = useState<Tab>("home");
  const [sandboxIds, setSandboxIds] = useState<string[]>([]);
  const [mode, setMode] = useState<DataMode>("fixture");
  const [bank, setBank] = useState<BankingSnapshot | null>(null);
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const [loading, setLoading] = useState(false);

  // Scenario controls. Reset with the persona by keying them on it below.
  const [extraSpendingCents, setExtraSpendingCents] = useState(0);
  const [incomeConfirmed, setIncomeConfirmed] = useState(false);
  const [gasCents, setGasCents] = useState(persona.scenario.gasCentsPerGallon);
  const [monthlyMiles, setMonthlyMiles] = useState(persona.usage.monthlyMiles);

  useEffect(() => {
    fetch("/api/demo/customers")
      .then((r) => r.json())
      .then((d: { customers: { id: string; sandboxAvailable: boolean }[] }) =>
        setSandboxIds(d.customers.filter((c) => c.sandboxAvailable).map((c) => c.id)),
      )
      .catch(() => setSandboxIds([]));
  }, []);

  const latestPersona = useRef(personaId);
  useEffect(() => {
    latestPersona.current = personaId;
  }, [personaId]);

  const sync = useCallback(async (id: string, m: DataMode) => {
    setLoading(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/banking/nessie/sync", { method: "POST", body: JSON.stringify({ personaId: id, mode: m }) });
      const body = await res.json();
      if (latestPersona.current !== id) return; // a newer persona was selected meanwhile
      if (!res.ok) {
        // Keep whatever was shown before; never relabel a failed sandbox read as fixture data.
        setSyncError(body.error);
        return;
      }
      setBank(body.snapshot);
      setMode(m);
    } catch {
      setSyncError({ code: "network", message: "Could not reach the banking route", retryable: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on persona change; the setState calls happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync(personaId, "fixture");
  }, [personaId, sync]);

  const selectPersona = (id: string) => {
    const p = PERSONAS.find((x) => x.id === id)!;
    setPersonaId(id);
    setBank(null);
    setExtraSpendingCents(0);
    setIncomeConfirmed(false);
    setGasCents(p.scenario.gasCentsPerGallon);
    setMonthlyMiles(p.usage.monthlyMiles);
    setTab("home");
  };

  const budget = useMemo(() => {
    if (!bank) return null;
    const manual = extraSpendingCents ? [{ label: "New monthly expense", monthlyCents: extraSpendingCents }] : [];
    return buildBudget(bank, { ...persona.profile, manualObligations: [...persona.profile.manualObligations, ...manual] }, DEMO_AS_OF);
  }, [bank, persona, extraSpendingCents]);

  const comparison = useMemo(
    () =>
      budget
        ? compareOptions({ persona, budget, catalog: CATALOG, asOf: DEMO_AS_OF, overrides: { gasCentsPerGallon: gasCents, monthlyMiles } })
        : null,
    [budget, persona, gasCents, monthlyMiles],
  );

  const sandboxReady = sandboxIds.includes(personaId);

  return (
    <>
      <header className="header">
        <div className="wordmark">
          <span className="dot" />
          Next<em>Move</em>
        </div>
        <select value={personaId} onChange={(e) => selectPersona(e.target.value)} aria-label="Demo customer">
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.summary}
            </option>
          ))}
        </select>
        <div className="modes" aria-label="Data sources">
          <span className="tag">Banking · {mode === "sandbox" ? "Nessie sandbox" : "fixture"}</span>
          <span className="tag">Driving · modeled</span>
          <span className="tag">Offers · synthetic</span>
        </div>
      </header>
      <nav className="tabs" aria-label="Screens">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)} aria-current={t === tab ? "page" : undefined}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>
      <main>
        <div className="sync-bar">
          <span className="muted">
            {loading ? "Loading banking data…" : bank ? `Banking loaded (${bank.mode})` : "No banking data loaded"}
          </span>
          <button className="btn" disabled={loading} onClick={() => sync(personaId, "fixture")}>
            Use fixture
          </button>
          <button
            className="btn"
            disabled={loading || !sandboxReady}
            onClick={() => sync(personaId, "sandbox")}
            title={sandboxReady ? "Read this customer from the Nessie sandbox" : "Set NESSIE_API_KEY and NESSIE_CUSTOMERS to enable"}
          >
            Sync from Nessie sandbox
          </button>
          {syncError && (
            <span className="excl">
              {syncError.message}. {bank ? `Still showing the earlier ${bank.mode} data.` : ""}
            </span>
          )}
        </div>
        {!budget || !comparison || !bank ? (
          <p className="lede">Load banking data to calculate the budget and options.</p>
        ) : (
          <>
            {!incomeConfirmed && tab !== "drives" && (
              <p className="notice">
                Income is estimated from recurring deposits and not yet confirmed.{" "}
                <button className="linkish" onClick={() => setTab("money")}>Confirm it on Money</button>
              </p>
            )}
            {tab === "home" && (
              <HomeScreen persona={persona} vehicle={vehicle} budget={budget} comparison={comparison} onReview={() => setTab("next")} />
            )}
            {tab === "drives" && (
              <DrivesView key={persona.id} initialRouteId={persona.usage.routeId} vehicleName={`${vehicle.modelYear} ${vehicle.model}`} hybrid={vehicle.powertrain === "hybrid"} />
            )}
            {tab === "money" && (
              <MoneyScreen
                bank={bank}
                budget={budget}
                extraSpendingCents={extraSpendingCents}
                setExtraSpendingCents={setExtraSpendingCents}
                incomeConfirmed={incomeConfirmed}
                setIncomeConfirmed={setIncomeConfirmed}
              />
            )}
            {tab === "compare" && (
              <CompareScreen comparison={comparison} gasCents={gasCents} setGasCents={setGasCents} monthlyMiles={monthlyMiles} setMonthlyMiles={setMonthlyMiles} />
            )}
            {tab === "next" && <NextMoveScreen comparison={comparison} />}
          </>
        )}
      </main>
    </>
  );
}
