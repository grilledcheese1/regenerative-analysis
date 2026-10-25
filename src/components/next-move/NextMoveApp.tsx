"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import IdentityControl from "@/components/auth/IdentityControl";
import { openCaseStudy, useCaseStudyId } from "@/components/auth/caseStudy";
import { useAccount } from "@/components/auth/useAccount";
import DrivesView from "@/components/DrivesView";
import { MotionProvider } from "@/components/story/motion";
import { ScrollProgress } from "@/components/story/SectionRail";
import type { CompareRequest, DrivingProfile, ScenarioInputs, SourceKind } from "@/contracts";
import { runScenario } from "@/domain/recommendations/scenario";
import { catalogVehicle } from "@/fixtures/catalog";
import type { Persona, UserBanking } from "@/contracts";
import BankingSyncBar from "./banking/BankingSyncBar";
import { useBankingSync } from "./banking/useBankingSync";
import ImportDrive from "./import/ImportDrive";
import { CompareScreen, HomeScreen, MoneyScreen, NextMoveScreen } from "./screens";
import { SettingsScreen } from "./settings/SettingsScreen";

// Horizontal travel of the tab slide, in px. Reduced-motion users get a plain fade (MotionConfig below).
const SLIDE_PX = 40;
// Old screen slides out the way it came, then the new one slides in from the other side (mode="wait").
const SCREEN: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * SLIDE_PX }),
  center: { opacity: 1, x: 0, transition: { duration: 0.26, ease: "easeOut" } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -SLIDE_PX, transition: { duration: 0.16, ease: "easeIn" } }),
};
const TABS = ["home", "drives", "money", "compare", "next", "settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { home: "Home", drives: "Drives", money: "Cost", compare: "Compare", next: "Next Step", settings: "Settings" };

/** The tabbed screens over `people`: every case study, or just the signed-in user's own profile. */
export default function NextMoveApp({ people, initialPersonaId, userBanking = null }: { people: Persona[]; initialPersonaId?: string; userBanking?: UserBanking | null }) {
  const findPersona = (id: string) => people.find((p) => p.id === id);
  const [personaId, setPersonaId] = useState(initialPersonaId && findPersona(initialPersonaId) ? initialPersonaId : people[0].id);
  const persona = findPersona(personaId) ?? people[0];
  const { account } = useAccount();
  const caseStudyId = useCaseStudyId();
  // One identity at a time: the case-study picker shows only when browsing case studies.
  const showPicker = people.length > 1 && (!account || Boolean(caseStudyId));
  const vehicle = catalogVehicle(persona.vehicle.catalogId);
  const [nav, setNav] = useState<{ tab: Tab; dir: 1 | -1 }>({ tab: "home", dir: 1 });
  const tab = nav.tab;
  // Slide direction follows tab order: later tabs enter from the right, earlier ones from the left.
  const setTab = useCallback((t: Tab) => setNav((n) => ({ tab: t, dir: TABS.indexOf(t) < TABS.indexOf(n.tab) ? -1 : 1 })), []);
  const banking = useBankingSync(persona.id, userBanking?.mode ?? "fixture");
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

  return (
    <MotionProvider>
      <ScrollProgress />
      <header className="header">
        <button type="button" className="wordmark" onClick={() => setTab("home")} aria-label="Regentic home" style={{ background: "none", border: 0, padding: 0, color: "inherit", cursor: "pointer" }}>
          <Image src="/regentic-logo.png" alt="" width={310} height={286} className="wordmark__logo" priority />
          <span>Regen<em>tic</em></span>
        </button>
        {showPicker && (
          <select
            id="persona"
            name="persona"
            value={personaId}
            onChange={(e) => {
              openCaseStudy(e.target.value);
              selectPersona(e.target.value);
            }}
            aria-label="Demo customer"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.summary}
              </option>
            ))}
          </select>
        )}
        {!account && <Link href="/" className="linkish">Story view</Link>}
        <IdentityControl />
      </header>
      <nav className="tabs" aria-label="Screens">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)} aria-current={t === tab ? "page" : undefined}>
            {TAB_LABEL[t]}
            {t === tab && <motion.span layoutId="tab-underline" className="tab-underline" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </button>
        ))}
      </nav>
      <main>
        <BankingSyncBar {...banking} />
        <AnimatePresence mode="wait" initial={false} custom={nav.dir}>
        <motion.div key={tab} custom={nav.dir} variants={SCREEN} initial="enter" animate="center" exit="exit">
        {tab === "settings" ? (
          <SettingsScreen
            persona={persona}
            banking={banking}
            userBanking={persona.id.startsWith("u_") ? userBanking : null}
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
                <button className="linkish" onClick={() => setTab("money")}>Confirm it on Cost</button>
              </p>
            )}
            {tab === "home" && (
              <HomeScreen persona={persona} vehicle={vehicle} budget={budget} comparison={comparison} onReview={() => setTab("next")} onGo={setTab} />
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
        </motion.div>
        </AnimatePresence>
      </main>
    </MotionProvider>
  );
}
