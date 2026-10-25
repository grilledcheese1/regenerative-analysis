"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import SignIn from "@/components/auth/SignIn";
import DrivesView from "@/components/DrivesView";
import type { CompareRequest, DrivingProfile, ScenarioInputs, SourceKind } from "@/contracts";
import { runScenario } from "@/domain/recommendations/scenario";
import { catalogVehicle } from "@/fixtures/catalog";
import { PEOPLE, persona as findPersona } from "@/fixtures/personas";
import BankingSyncBar from "./banking/BankingSyncBar";
import { useBankingSync } from "./banking/useBankingSync";
import ImportDrive from "./import/ImportDrive";
import "./nextmove.css";
import { CompareScreen, HomeScreen, MoneyScreen, NextMoveScreen } from "./screens";
import { SettingsScreen } from "./settings/SettingsScreen";
import Icon, { type IconName } from "./ui/Icon";

const TABS = ["home", "drives", "money", "compare", "next", "settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { home: "Home", drives: "Drives", money: "Money", compare: "Compare", next: "Next Move", settings: "Settings" };
const TAB_ICON: Record<Tab, IconName> = { home: "home", drives: "car", money: "money", compare: "bars", next: "pointer", settings: "gear" };

// Light is the default; the choice lives in localStorage and is read as an external store so SSR never mismatches.
type NmTheme = "light" | "dark";
const themeListeners = new Set<() => void>();
const readTheme = (): NmTheme => {
  try {
    return localStorage.getItem("nm-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};
const writeTheme = (t: NmTheme) => {
  try {
    localStorage.setItem("nm-theme", t);
  } catch {}
  themeListeners.forEach((l) => l());
};
const subscribeTheme = (l: () => void) => {
  themeListeners.add(l);
  return () => themeListeners.delete(l);
};

export default function NextMoveApp({ initialPersonaId }: { initialPersonaId?: string }) {
  const [personaId, setPersonaId] = useState(initialPersonaId && findPersona(initialPersonaId) ? initialPersonaId : PEOPLE[0].id);
  const persona = findPersona(personaId)!;
  const vehicle = catalogVehicle(persona.vehicle.catalogId);
  const [tab, setTab] = useState<Tab>("home");
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as NmTheme);
  const banking = useBankingSync(personaId);
  const { bank } = banking;
  const [dataKey, setDataKey] = useState(0); // bumped by "Delete my demo data" to remount data-holding children

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
    const p = findPersona(id)!;
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

  // Paint the page behind the app in the same theme, and switch themes without every color transition firing at once.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("nm-page");
    root.dataset.nmTheme = theme;
    return () => {
      root.classList.remove("nm-page");
      delete root.dataset.nmTheme;
    };
  }, [theme]);
  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add("nm-no-transition");
    writeTheme(theme === "dark" ? "light" : "dark");
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("nm-no-transition")));
  };

  const bankingTag = banking.stale ? "stale sandbox read" : banking.mode === "sandbox" ? "Nessie sandbox" : "fixture";

  return (
    <div className="nm" data-nm-theme={theme}>
      <header className="header nm-header">
        <div className="wordmark">
          <span className="dot" />
          Next<em>Move</em>
        </div>
        <label className="nm-select">
          <Icon name="car" size={20} />
          <select id="persona" name="persona" value={personaId} onChange={(e) => selectPersona(e.target.value)} aria-label="Demo customer">
            {PEOPLE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.summary}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={16} className="nm-select__chev" />
        </label>
        <div className="modes" aria-label="Data sources">
          <span className="tag">Banking · {bankingTag}</span>
          <span className="tag">Driving · {usageSource ? "imported" : "modeled"}</span>
          <span className="tag">Offers · synthetic</span>
        </div>
        <div className="nm-header__end">
          <Link href="/next-move" className="nm-link">Story view</Link>
          <SignIn />
          <button type="button" className="nm-iconbtn" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <Link href="/" className="nm-back">
            <Icon name="back" size={18} />
            Regen Coach
          </Link>
        </div>
      </header>
      <nav className="tabs nm-tabs" aria-label="Screens">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)} aria-current={t === tab ? "page" : undefined}>
            <Icon name={TAB_ICON[t]} size={20} />
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>
      <main className="nm-main">
        <BankingSyncBar {...banking} />
        {tab === "settings" ? (
          <SettingsScreen
            persona={persona}
            banking={banking}
            onDeleted={() => {
              onProfile(null);
              setDataKey((k) => k + 1);
              setHighlight([]);
              void banking.sync("fixture");
            }}
          />
        ) : !budget || !comparison || !bank ? (
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
                <ImportDrive key={`${persona.id}-${dataKey}`} personaId={persona.id} vehicleLabel={`${vehicle.modelYear} ${vehicle.model}`} onProfile={onProfile} />
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
    </div>
  );
}
