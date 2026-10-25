import { defineConfig, devices } from "@playwright/test";

// One spec file per workstream in e2e/ (e2e/<stream>.spec.ts), so streams never edit each other's tests.
// Runs against a production build with no provider keys by default: fixture banking, template
// explanations and saved market results keep the specs deterministic.
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
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
