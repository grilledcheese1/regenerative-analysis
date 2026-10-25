import { test } from "@playwright/test";

// Live-provider checks (Nessie, Claude, SerpAPI). Skipped unless E2E_LIVE=1 and keys are set.
test.skip(!process.env.E2E_LIVE, "set E2E_LIVE=1 with provider keys to run");

test("placeholder: live Nessie sync", async () => {
  test.fixme(true, "add once banking sync bar from workstream B lands");
});
