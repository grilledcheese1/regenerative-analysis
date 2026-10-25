export const env = {
  defaultGasPrice: Number(process.env.NEXT_PUBLIC_DEFAULT_GAS_PRICE ?? 3),
  defaultTripsPerDay: Number(process.env.NEXT_PUBLIC_DEFAULT_TRIPS_PER_DAY ?? 2),
};

/** Server-only values. Never import this from a client component. */
export function serverEnv() {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    openMeteoBaseUrl: process.env.OPEN_METEO_BASE_URL ?? "https://api.open-meteo.com",
    openMeteoElevationUrl:
      process.env.OPEN_METEO_ELEVATION_URL ?? "https://api.open-meteo.com/v1/elevation",
    overpassUrl: process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
  };
}
