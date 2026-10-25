// Builds src/fixtures/people.generated.json: 26 more people to sign in as, in the exact shape of the three curated
// personas (src/fixtures/personas.ts), plus a synthetic Nessie-format banking history for each.
//
// Everything here is SYNTHETIC. Each person comes from simulated_user_data/ and is run through fixed rules, so the
// file is the same every time. The app never reads simulated_user_data at runtime.
// Each person's real car is mapped to the nearest of the six catalog vehicles (which carry real fueleconomy.gov
// ratings), and the person's summary says so.
//
// Run: node scripts/build-people.ts
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CandidateTerms, Persona } from "../src/contracts/index.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const sim = (rel: string) => path.join(ROOT, "simulated_user_data", rel);
const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

const DEMO_AS_OF = "2026-10-24";
const known = <T>(value: T) => ({ known: true as const, value });
const unknown = (reason: string) => ({ known: false as const, reason });
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const dollars = (n: number) => Math.round(n * 100);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

interface Vehicle {
  id: string; make: string; model: string; body: string; powertrain: "ice" | "hybrid" | "phev" | "bev";
  msrpUsd: number; insuranceBaseUsdPerYear: number; maintenanceUsdPerYear: number;
}
interface Region { id: string; name: string; gasUsdPerGal: number; insuranceFactor: number }
interface User {
  userId: string; alias: string; archetype: string; regionId: string;
  commute: { oneWayKm: number; workDaysPerWeek: number; roadMix: { urban: number; suburban: number; highway: number } };
  vehicle: { vehicleId: string; modelYear: number; ageYears: number; odometerKm: number; estimatedValueUsd: number };
  income: { band: "low" | "mid" | "high"; householdUsd: number };
  finance: { fuelBudgetUsdPerMonth: number; insuranceUserFactor: number; loan?: { lender: string; aprPct: number; monthsRemaining: number; monthlyPaymentUsd: number; balanceUsd: number } };
}

const vehicles = read<{ vehicles: Vehicle[] }>(sim("reference/vehicles.json")).vehicles;
const regionList = read<{ regions?: Region[] } | Region[]>(sim("reference/regions.json"));
const regions: Region[] = Array.isArray(regionList) ? regionList : (regionList.regions ?? []);
const HILLY = new Set(["seattle_wa", "san_francisco_ca", "pittsburgh_pa", "denver_co"]);

/** The nearest catalog vehicle, so fuel and running costs use real ratings. */
function catalogFor(v: Vehicle): string {
  const hybridLike = v.powertrain !== "ice";
  const big = v.body === "suv" || v.body === "truck" || v.body === "minivan";
  if (hybridLike) return big ? "rav4_hybrid_awd_2025" : v.body === "hatchback" ? "corolla_hybrid_2025" : "camry_hybrid_le_2024";
  return big ? "rav4_awd_2021" : "corolla_2016";
}

// Synthetic sticker prices (cents) for the candidate replacements, in the same range as the curated personas.
const CATALOG_NAME: Record<string, string> = {
  camry_hybrid_le_2024: "2024 Camry Hybrid LE",
  corolla_hybrid_2025: "2025 Corolla Hybrid",
  rav4_hybrid_awd_2025: "2025 RAV4 Hybrid AWD",
  corolla_2016: "2016 Corolla",
  rav4_awd_2021: "2021 RAV4 AWD",
};

const PRICE: Record<string, { cents: number; label: string }> = {
  camry_hev_le_2025: { cents: 3000000, label: "Camry Hybrid LE" },
  corolla_hybrid_2025: { cents: 2680000, label: "Corolla Hybrid" },
  rav4_hybrid_awd_2025: { cents: 3900000, label: "RAV4 Hybrid AWD" },
};

function candidate(catalogId: string, how: "lease" | "finance" | "cash", insuranceCents: number): CandidateTerms {
  const price = PRICE[catalogId].cents;
  const base = { catalogId, insuranceMonthlyCents: insuranceCents, maintenanceMonthlyCents: 2500 };
  if (how === "lease") {
    return { ...base, acquisition: "lease", priceCents: price, residualCents: roundTo(price * 0.6, 10000), moneyFactor: 0.002, leaseTermMonths: 36, dueAtSigningCents: roundTo(price * 0.05, 5000), endValueCents: 0 };
  }
  return { ...base, acquisition: how, priceCents: price, dueAtSigningCents: how === "cash" ? 0 : roundTo(price * 0.08, 10000), endValueCents: roundTo(price * 0.63, 10000) };
}

interface Spec {
  checking: number; savings: number; cardBalance: number;
  monthly: { income: [number, number]; bills: [string, number, number][]; purchases: [string, number, number][]; card: [string, number, number][]; savingsTransfer: number };
}

const personas: Persona[] = [];
const bankingSpecs: Record<string, Spec> = {};
const styles: Record<string, "smooth" | "mixed" | "aggressive"> = {};
const usedNames = new Set(["Maria", "Devon", "Kai"]);

for (const file of readdirSync(sim("users")).filter((f) => /^user_\d+\.json$/.test(f)).sort()) {
  const u = read<User>(sim(`users/${file}`));
  const num = Number(u.userId.slice(5));
  const rand = rng(num * 7919);
  const veh = vehicles.find((v) => v.id === u.vehicle.vehicleId)!;
  const region = regions.find((r) => r.id === u.regionId)!;
  const id = `user-${u.userId.slice(5)}`;

  const first = u.alias.split(" (")[0];
  const city = region.name.split(",")[0];
  const name = usedNames.has(first) ? `${first} (${city})` : first;
  usedNames.add(name);

  // --- Money: take-home from household income. Rates follow the curated personas (savings goal about 9.5%, buffer about 4.8%).
  const net = Math.round((u.income.householdUsd / 12) * 0.78);
  const objective = u.income.band === "low" ? "lowest_monthly" : u.income.band === "high" ? "minimize_cost" : "preserve_cash_then_minimize_cost";
  const profile = {
    ownerId: `demo_${id}`,
    displayName: name,
    timeZone: "America/Chicago",
    monthlySavingsGoalCents: dollars(roundTo(net * 0.095, 25)),
    monthlyBufferCents: dollars(roundTo(net * 0.048, 25)),
    protectedCashReserveCents: dollars(roundTo(net * 1.4, 100)),
    otherCommittedUpfrontCashCents: 0,
    manualObligations: [] as { label: string; monthlyCents: number }[],
    objective: objective as Persona["profile"]["objective"],
  };

  // --- Driving: miles from the commute plus a little leisure driving.
  const mix = u.commute.roadMix;
  const monthlyMiles = Math.max(250, roundTo((u.commute.oneWayKm * 0.6214 * 2 * u.commute.workDaysPerWeek * 4.33) + 150, 25));
  const cityShare = Math.min(0.95, Math.round((mix.urban + mix.suburban * 0.5) * 100) / 100);
  const routeId = u.archetype === "mountain" || HILLY.has(u.regionId) ? "hills" : u.archetype === "stop_and_go" || mix.urban > 0.55 ? "downtown" : "mixed";

  // --- Contract: a loan if they have one, owned outright if the car is old, otherwise a lease about to end.
  const loan = u.finance.loan;
  const kind: "loan" | "owned" | "lease" = loan ? "loan" : u.vehicle.ageYears >= 7 ? "owned" : "lease";
  const catalogId = catalogFor(veh);
  const preferSuv = veh.body === "suv" || veh.body === "truck" || veh.body === "minivan";
  const primary = preferSuv ? "rav4_hybrid_awd_2025" : "camry_hev_le_2025";
  const alt = preferSuv ? "camry_hev_le_2025" : "corolla_hybrid_2025";

  const insuranceMonthly = Math.round((veh.insuranceBaseUsdPerYear * u.finance.insuranceUserFactor * region.insuranceFactor) / 12);
  const maintenanceMonthly = Math.round(veh.maintenanceUsdPerYear / 12);
  const replacementIns = Math.round((1625 * u.finance.insuranceUserFactor * region.insuranceFactor) / 12) * 100;

  let contract: Persona["contract"];
  let odometerMiles = Math.round(u.vehicle.odometerKm * 0.6214);
  let valueCents = dollars(u.vehicle.estimatedValueUsd);
  let actionDate = "2026-11-01";
  let situation: string;
  let summaryTail: string;
  const candidates: CandidateTerms[] = [];
  let refinance: Persona["scenario"]["refinance"];
  const aprBps = u.income.band === "high" ? 599 : u.income.band === "mid" ? 699 : 1090;

  if (kind === "lease") {
    const months = 2 + Math.floor(rand() * 5);
    const allowance = [10000, 12000, 15000][Math.floor(rand() * 3)];
    const maturity = new Date(Date.UTC(2026, 9 + months, 24)).toISOString().slice(0, 10);
    const residual = roundTo(veh.msrpUsd * 0.62, 50);
    odometerMiles = Math.round((monthlyMiles * 12 * (36 - months)) / 12);
    valueCents = dollars(Math.round(residual * (0.9 + rand() * 0.2)));
    actionDate = maturity;
    const over = Math.max(0, odometerMiles + monthlyMiles * months - allowance * 3);
    contract = {
      type: "lease",
      maturityDate: maturity,
      paymentCents: dollars(Math.round(veh.msrpUsd * 0.0115)),
      totalAllowedMiles: allowance * 3,
      excessCentsPerMile: veh.msrpUsd > 45000 ? 20 : 15,
      dispositionFeeCents: known(35000),
      purchaseOptionCents: known(dollars(residual)),
      buyoutQuote: unknown("No out-the-door buyout quote requested yet"),
    };
    situation = `Lease matures ${maturity}${over > 0 ? ` and the driving pace puts the car about ${over.toLocaleString("en-US")} miles over the allowance.` : " and mileage is within the allowance."}`;
    summaryTail = `lease ending in ${months} months`;
    candidates.push(candidate(primary, "lease", replacementIns), candidate(alt, "finance", replacementIns));
  } else if (kind === "loan") {
    contract = {
      type: "loan",
      payoffCents: dollars(loan!.balanceUsd),
      payoffDate: DEMO_AS_OF,
      aprBps: Math.round(loan!.aprPct * 100),
      paymentCents: dollars(loan!.monthlyPaymentUsd),
      remainingMonths: loan!.monthsRemaining,
    };
    situation = `Owes about ${usd(loan!.balanceUsd)} on a car worth about ${usd(u.vehicle.estimatedValueUsd)}, with ${loan!.monthsRemaining} payments left.`;
    summaryTail = `loan, ${loan!.monthsRemaining} payments left`;
    candidates.push(candidate(primary, "finance", replacementIns));
    if (loan!.aprPct >= 7) refinance = { aprBps: Math.max(499, Math.round(loan!.aprPct * 100) - 150), termMonths: 60, feeCents: 25000 };
  } else {
    contract = { type: "owned" };
    situation = "Owns the car outright and wonders whether a hybrid would pay for itself in fuel.";
    summaryTail = "paid off";
    candidates.push(candidate(primary, "finance", replacementIns), candidate(primary, "cash", replacementIns));
  }

  // Show a believable model year: a lease about to end is on a car two or three years old, and EVs are recent.
  const shownYear = kind === "lease" ? 2022 + Math.floor(rand() * 3) : veh.powertrain === "bev" ? Math.max(2022, Math.min(2025, u.vehicle.modelYear)) : Math.min(2025, u.vehicle.modelYear);
  const carName = `${veh.make} ${veh.model}`;
  const persona: Persona = {
    id,
    summary: `${name} · ${shownYear} ${carName}, ${summaryTail}`,
    situation: `${situation} Illustrative: this person's ${carName} is modeled as a ${CATALOG_NAME[catalogId]} for fuel and running costs.`,
    profile,
    vehicle: {
      vehicleId: `vehicle_${id}`,
      catalogId,
      odometerMiles,
      odometerObservedAt: "2026-10-20",
      estimatedValueCents: known(valueCents),
      valuationSource: "synthetic",
    },
    contract,
    usage: { monthlyMiles, cityShare, source: "synthetic", routeId },
    costs: { insuranceMonthlyCents: insuranceMonthly * 100, maintenanceMonthlyCents: maintenanceMonthly * 100 },
    scenario: {
      actionDate,
      horizonMonths: 36,
      gasCentsPerGallon: roundTo(region.gasUsdPerGal * 100, 10),
      financeAprBps: aprBps,
      financeTermMonths: u.income.band === "low" ? 72 : 60,
      currentVehicleEndValueCents: roundTo(valueCents * (veh.powertrain === "ice" ? 0.62 : 0.68), 10000),
      candidates,
      ...(refinance ? { refinance } : {}),
    },
  };
  personas.push(persona);

  // --- A synthetic Nessie-format bank history that reproduces the same income and spending ratios as the curated personas.
  const half = Math.round(net / 2);
  const rentRatio = 0.26 + rand() * 0.08;
  const rent = roundTo(net * rentRatio, 5);
  const autoPayment = kind === "lease" ? ["Auto lease payment", Math.round(veh.msrpUsd * 0.0115), 24] : kind === "loan" ? ["Auto loan payment", loan!.monthlyPaymentUsd, 15] : null;
  const fuel = u.finance.fuelBudgetUsdPerMonth;
  styles[id] = (u as unknown as { driver: { style: "smooth" | "mixed" | "aggressive" } }).driver.style;
  bankingSpecs[id] = {
    checking: roundTo(net * 0.9, 50),
    savings: roundTo(net * 2.4, 50),
    cardBalance: roundTo(net * 0.07, 10),
    monthly: {
      income: [half, net - half],
      bills: [
        [kind === "owned" ? "Mortgage payment" : "Apartment rent", rent, 1],
        ["Electric utility", roundTo(net * 0.028, 5), 12],
        ["Internet service", 65, 14],
        ...(autoPayment ? [autoPayment as [string, number, number]] : []),
        ["Auto insurance premium", insuranceMonthly, 5],
      ],
      purchases: [
        ["Grocery market", roundTo(net * 0.052, 5), 6],
        ["Grocery market", roundTo(net * 0.052, 5), 20],
        ["Taco restaurant", roundTo(net * 0.022, 5), 9],
        ["Coffee cafe", roundTo(net * 0.02, 5), 23],
        ["Streaming subscription", roundTo(net * 0.016, 5), 3],
        ["Gas station", Math.round(fuel / 2), 8],
        ["Gas station", Math.round(fuel / 2), 22],
      ],
      card: [["Home goods store", roundTo(net * 0.06, 5), 17]],
      savingsTransfer: roundTo(net * 0.095, 25),
    },
  };
}

writeFileSync(path.join(ROOT, "src/fixtures/people.generated.json"), JSON.stringify({ note: "Generated by scripts/build-people.ts from simulated_user_data. SYNTHETIC. Do not edit by hand.", personas, bankingSpecs, styles }, null, 1) + "\n");
const kinds = personas.reduce<Record<string, number>>((a, p) => ((a[p.contract.type] = (a[p.contract.type] ?? 0) + 1), a), {});
console.log(`${personas.length} people: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")}`);
for (const p of personas) console.log(`${p.id.padEnd(9)} ${p.summary}`);
