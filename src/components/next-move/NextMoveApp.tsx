"use client";

import { useCallback, useMemo, useState } from "react";
import DrivesView from "@/components/DrivesView";
import type { CompareRequest, DrivingProfile, ScenarioInputs, SourceKind } from "@/contracts";
import { runScenario } from "@/domain/recommendations/scenario";
import { catalogVehicle } from "@/fixtures/catalog";
import { PERSONAS } from "@/fixtures/personas";
import BankingSyncBar from "./banking/BankingSyncBar";
import { useBankingSync } from "./banking/useBankingSync";
import ImportDrive from "./import/ImportDrive";
import { CompareScreen, HomeScreen, MoneyScreen, NextMoveScreen } from "./screens";

const TABS = ["home", "drives", "money", "compare", "next"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { home: "Home", drives: "Drives", money: "Money", compare: "Compare", next: "Next Move" };

export default function NextMoveApp() {
  const [personaId, setPersonaId] = useState(PERSONAS[0].id);
  const persona = PERSONAS.find((p) => p.id === personaId)!;
  const vehicle = catalogVehicle(persona.vehicle.catalogId);
  const [tab, setTab] = useState<Tab>("home");
  const banking = useBankingSync(personaId);
  const { bank } = banking;

  // Scenario controls. Reset with the persona in selectPersona.
  const [extraSpendingCents, setExtraSpendingCents] = useState(0);
  const [incomeConfirmed, setIncomeConfirmed] = useState(false);
  const [gasCents, setGasCents] = useState(persona.scenario.gasCentsPerGallon);
  const [monthlyMiles, setMonthlyMiles] = useState(persona.usage.monthlyMiles);
  // Usage from imported drives, when the user chose to use it for the comparison.
  const [cityShare, setCityShare] = useState<number | null>(null);
  const [usageSource, setUsageSource] = useState<SourceKind | null>(null);
  // Evidence ids the AI explanation cited, highlighted in the evidence list.
  const [highlight, setHighlight] = useState<string[]>([]);

  const selectPersona = (id: string) => {
    const p = PERSONAS.find((x) => x.id === id)!;
    setPersonaId(id);
    setExtraSpendingCents(0);
    setIncomeConfirmed(false);
    setGasCents(p.scenario.gasCentsPerGallon);
    setMonthlyMiles(p.usage.monthlyMiles);
    setCityShare(null);
    setUsageSource(null);
    setHighlight([]);
    setTab("home");
  };

  const onProfile = useCallback(
    (p: DrivingProfile | null) => {
      setMonthlyMiles(p && p.monthlyMiles.known ? p.monthlyMiles.value : persona.usage.monthlyMiles);
      setCityShare(p && p.cityShare.known ? p.cityShare.value : null);
      setUsageSource(p ? p.source : null);
    },
    [persona],
  );

  const scenario: ScenarioInputs = useMemo(
    () => ({
      gasCentsPerGallon: gasCents,
      monthlyMiles,
      ...(cityShare !== null && { cityShare }),
      ...(usageSource && { usageSource }),
      extraMonthlySpendingCents: extraSpendingCents,
      incomeConfirmed,
    }),
    [gasCents, monthlyMiles, cityShare, usageSource, extraSpendingCents, incomeConfirmed],
  );

  const result = useMemo(() => (bank ? runScenario(persona, bank, scenario) : null), [bank, persona, scenario]);
  const budget = result?.budget ?? null;
  const comparison = result?.comparison ?? null;

  const compareRequest: CompareRequest = useMemo(
    () => ({ schemaVersion: "1.0", personaId, bankingMode: banking.mode ?? "fixture", scenario }),
    [personaId, banking.mode, scenario],
  );

  const bankingTag = banking.stale ? "stale sandbox read" : banking.mode === "sandbox" ? "Nessie sandbox" : "fixture";

  return (
    <>
      <header className="header">
        <div className="wordmark">
          <span className="dot" />
          Next<em>Move</em>
        </div>
        <select id="persona" name="persona" value={personaId} onChange={(e) => selectPersona(e.target.value)} aria-label="Demo customer">
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.summary}
            </option>
          ))}
        </select>
        <div className="modes" aria-label="Data sources">
          <span className="tag">Banking · {bankingTag}</span>
          <span className="tag">Driving · {usageSource ? "imported" : "modeled"}</span>
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
        <BankingSyncBar {...banking} />
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
              <>
                <ImportDrive key={persona.id} personaId={persona.id} vehicleLabel={`${vehicle.modelYear} ${vehicle.model}`} onProfile={onProfile} />
                <DrivesView key={`replay-${persona.id}`} initialRouteId={persona.usage.routeId} vehicleName={`${vehicle.modelYear} ${vehicle.model}`} hybrid={vehicle.powertrain === "hybrid"} />
              </>
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
            {tab === "next" && (
              <NextMoveScreen comparison={comparison} compareRequest={compareRequest} highlight={highlight} onCite={setHighlight} />
            )}
          </>
        )}
      </main>
    </>
  );
}
