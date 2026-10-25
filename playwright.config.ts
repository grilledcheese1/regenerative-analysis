import { defineConfig, devices } from "@playwright/test";

// One spec file per workstream in e2e/ (e2e/<stream>.spec.ts), so streams never edit each other's tests.
// Runs against a production build with no provider keys by default: fixture banking, template
// explanations, saved market results and the static map keep the specs deterministic, and no run
// spends SerpAPI or Anthropic credits. Set E2E_LIVE=1 to keep the keys from .env.local for live specs.
// (An empty variable in the environment wins over .env files, and NEXT_PUBLIC_* is fixed at build time.)
const PROVIDER_KEYS = ["ANTHROPIC_API_KEY", "SERPAPI_API_KEY", "NESSIE_API_KEY", "NESSIE_CUSTOMERS", "NEXT_PUBLIC_MAPBOX_TOKEN"];
const serverEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
);
if (!process.env.E2E_LIVE) for (const k of PROVIDER_KEYS) serverEnv[k] = "";
// The production server refuses to sign demo-account sessions without a secret.
serverEnv.AUTH_SECRET ||= "e2e-only-auth-secret";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100/next-move",
    env: serverEnv,
    // A server left running from an E2E_LIVE run would carry keys, so only reuse one deliberately.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
