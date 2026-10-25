import { defineConfig, devices } from "@playwright/test";

// Runs against a production build with no provider keys, so fixture, template and
// saved-result paths are deterministic. Live-provider checks are in e2e/live.spec.ts.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NEXT_PUBLIC_MAPBOX_TOKEN: "", ANTHROPIC_API_KEY: "", NESSIE_API_KEY: "", SERPAPI_API_KEY: "" },
  },
  use: { baseURL: "http://localhost:3100" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
