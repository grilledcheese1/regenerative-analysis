"use client";

import { useMemo, useState } from "react";
import type { CompareRequest, ScenarioInputs } from "@/contracts";
import { runScenario } from "@/domain/recommendations/scenario";
import { catalogVehicle } from "@/fixtures/catalog";
import { persona as findPersona } from "@/fixtures/personas";
import BankingSyncBar from "../next-move/banking/BankingSyncBar";
import { useBankingSync } from "../next-move/banking/useBankingSync";
import Commute from "./Commute";
import { useDrive } from "./drive";
import { MotionProvider } from "./motion";
import Options from "./Options";
import Plan from "./Plan";
import SectionRail from "./SectionRail";
import Stand from "./Stand";
import Value from "./Value";

const SECTIONS = [
  { id: "stand", label: "Where you stand" },
  { id: "commute", label: "Your commute" },
  { id: "options", label: "Your options" },
  { id: "value", label: "What a hybrid does" },
  { id: "plan", label: "Your next move" },
];

/** The scroll story for one simulated person. Gas price, miles and income confirmation are shared by every slide. */
export default function Story({ personaId }: { personaId: string }) {
  const persona = findPersona(personaId)!;
  const vehicle = catalogVehicle(persona.vehicle.catalogId);
  const banking = useBankingSync(personaId);
  const { bank } = banking;
  const drive = useDrive(persona);

  const [gasCents, setGasCents] = useState(persona.scenario.gasCentsPerGallon);
  const [monthlyMiles, setMonthlyMiles] = useState(persona.usage.monthlyMiles);
  const [incomeConfirmed, setIncomeConfirmed] = useState(false);

  const scenario: ScenarioInputs = useMemo(
    () => ({ gasCentsPerGallon: gasCents, monthlyMiles, extraMonthlySpendingCents: 0, incomeConfirmed }),
    [gasCents, monthlyMiles, incomeConfirmed],
  );
  const result = useMemo(() => (bank ? runScenario(persona, bank, scenario) : null), [bank, persona, scenario]);
  const compareRequest: CompareRequest = useMemo(
    () => ({ schemaVersion: "1.0", personaId, bankingMode: banking.mode ?? "fixture", scenario }),
    [personaId, banking.mode, scenario],
  );

  return (
    <MotionProvider>
      <SectionRail sections={SECTIONS} />
      <div className="story">
        <BankingSyncBar {...banking} />
        {!result ? (
          <p className="lede" role="status">Loading banking data to build the story…</p>
        ) : (
          <>
            <Stand persona={persona} vehicle={vehicle} budget={result.budget} comparison={result.comparison} incomeConfirmed={incomeConfirmed} onIncomeConfirmed={setIncomeConfirmed} />
            <Commute persona={persona} drive={drive} hybrid={vehicle.powertrain === "hybrid"} />
            <Options comparison={result.comparison} gasCents={gasCents} onGas={setGasCents} monthlyMiles={monthlyMiles} onMiles={setMonthlyMiles} />
            <Value persona={persona} vehicle={vehicle} drive={drive} gasCents={gasCents} monthlyMiles={monthlyMiles} />
            <Plan comparison={result.comparison} compareRequest={compareRequest} />
          </>
        )}
      </div>
    </MotionProvider>
  );
}
