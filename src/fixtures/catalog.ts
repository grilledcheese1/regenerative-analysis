import type { CatalogVehicle } from "@/contracts";

// Ratings copied from fueleconomy.gov vehicle records on 2026-10-24 (ids are the record ids).
// Prices and values for these vehicles live in persona scenarios and are synthetic.
const retrievedAt = "2026-10-24T19:30:00Z";

export const CATALOG: CatalogVehicle[] = [
  { catalogId: "camry_hybrid_le_2024", make: "Toyota", model: "Camry Hybrid LE", modelYear: 2024, trim: "LE", powertrain: "hybrid", fuelEconomyId: 47092, cityMpg: 51, highwayMpg: 53, retrievedAt },
  { catalogId: "camry_hev_le_2025", make: "Toyota", model: "Camry Hybrid LE", modelYear: 2025, trim: "LE FWD", powertrain: "hybrid", fuelEconomyId: 48032, cityMpg: 53, highwayMpg: 50, retrievedAt },
  { catalogId: "corolla_hybrid_2025", make: "Toyota", model: "Corolla Hybrid", modelYear: 2025, trim: "FWD", powertrain: "hybrid", fuelEconomyId: 49139, cityMpg: 53, highwayMpg: 46, retrievedAt },
  { catalogId: "corolla_2016", make: "Toyota", model: "Corolla", modelYear: 2016, trim: "1.8 L CVT", powertrain: "gasoline", fuelEconomyId: 36800, cityMpg: 28, highwayMpg: 36, retrievedAt },
  { catalogId: "rav4_awd_2021", make: "Toyota", model: "RAV4 AWD", modelYear: 2021, trim: "2.5 L", powertrain: "gasoline", fuelEconomyId: 42968, cityMpg: 27, highwayMpg: 33, retrievedAt },
  { catalogId: "rav4_hybrid_awd_2025", make: "Toyota", model: "RAV4 Hybrid AWD", modelYear: 2025, trim: "AWD", powertrain: "hybrid", fuelEconomyId: 48937, cityMpg: 41, highwayMpg: 38, retrievedAt },
];

export const catalogVehicle = (id: string) => CATALOG.find((v) => v.catalogId === id)!;
