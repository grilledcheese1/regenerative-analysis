// Server-side env access for scripts and API routes. Never import from client code.
export const mapboxToken = () => process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
export const anthropicKey = () => process.env.ANTHROPIC_API_KEY ?? "";
export const coachModel = () => process.env.COACH_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
export const overpassUrl = () => process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
export const openMeteoBase = () => process.env.OPEN_METEO_BASE_URL ?? "https://api.open-meteo.com";
export const openMeteoElevationUrl = () =>
  process.env.OPEN_METEO_ELEVATION_URL ?? "https://api.open-meteo.com/v1/elevation";
