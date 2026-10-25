import { expect, test, type Page, type Route } from "@playwright/test";

// Nessie banking (stream 2). Deterministic by default: the browser-side routes are mocked, so
// these pass with or without live Nessie keys. N5 hits the real sandbox only with E2E_LIVE=1.

const header = (page: Page) => page.getByLabel("Data sources");

async function sandboxReady(page: Page, ready: boolean) {
  await page.route("**/api/demo/customers", (r) =>
    r.fulfill({ json: { customers: ["maria", "devon", "kai"].map((id) => ({ id, summary: id, sandboxAvailable: ready })) } }),
  );
}

/** Lets fixture loads through to the real server and answers sandbox calls with `sandbox`. */
async function mockSync(page: Page, sandbox: (body: { mode: string }, route: Route) => Promise<void>) {
  await page.route("**/api/banking/nessie/sync", async (route) => {
    const body = route.request().postDataJSON() as { mode: string };
    if (body.mode === "fixture") return route.continue();
    return sandbox(body, route);
  });
}

test("N1 fixture by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
  await expect(header(page)).toContainText("Banking · fixture");
});

test("N2 sandbox sync is disabled with a reason when not configured", async ({ page }) => {
  await sandboxReady(page, false);
  await page.goto("/");
  const button = page.getByRole("button", { name: "Sync from Nessie sandbox" });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("title", /NESSIE_API_KEY and NESSIE_CUSTOMERS/);
});

test("N3 a failed sandbox read keeps the earlier data and says so", async ({ page }) => {
  await sandboxReady(page, true);
  await mockSync(page, (_b, route) =>
    route.fulfill({ status: 502, json: { error: { code: "provider_error", message: "Nessie returned HTTP 503", retryable: true, requestId: "req_x" } } }),
  );
  await page.goto("/");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
  const budget = await page.getByText(/^\$[\d,]+$/).first().textContent();
  await page.getByRole("button", { name: "Sync from Nessie sandbox" }).click();
  await expect(page.getByText("Nessie returned HTTP 503. Still showing the earlier fixture data.")).toBeVisible();
  await expect(header(page)).toContainText("Banking · fixture");
  expect(await page.getByText(/^\$[\d,]+$/).first().textContent()).toBe(budget);
});

test("N4 a failure offers the last sandbox read, which is labeled stale", async ({ page, request }) => {
  // A real fixture snapshot stands in for an earlier sandbox read.
  const fixture = await (await request.post("/api/banking/nessie/sync", { data: { personaId: "maria", mode: "fixture" } })).json();
  const earlier = { ...fixture.snapshot, mode: "sandbox", retrievedAt: "2026-10-24T19:12:00.000Z" };
  await sandboxReady(page, true);
  await mockSync(page, (body, route) =>
    body.mode === "sandbox_cached"
      ? route.fulfill({ json: { requestId: "req_y", snapshot: earlier, stale: true, staleSince: earlier.retrievedAt } })
      : route.fulfill({
          status: 502,
          json: { error: { code: "provider_error", message: "Nessie did not respond", retryable: true, requestId: "req_x" }, cachedSandboxAvailable: { retrievedAt: earlier.retrievedAt } },
        }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Sync from Nessie sandbox" }).click();
  const useCached = page.getByRole("button", { name: /Use last sandbox read/ });
  await expect(useCached).toBeVisible();
  await useCached.click();
  await expect(header(page)).toContainText("Banking · stale sandbox read");
  await expect(page.getByText(/Stale Nessie sandbox read from/)).toBeVisible();
});

test("N5 live sandbox sync (E2E_LIVE=1)", async ({ page }) => {
  test.skip(!process.env.E2E_LIVE, "set E2E_LIVE=1 with Nessie keys to run against the real sandbox");
  await page.goto("/");
  await page.getByRole("button", { name: "Sync from Nessie sandbox" }).click();
  await expect(header(page)).toContainText("Banking · Nessie sandbox", { timeout: 30_000 });
  await expect(page.getByText(/Banking loaded \(Nessie sandbox · retrieved/)).toBeVisible();
  await page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name: "Money" }).click();
  // Seeded from the fixture, so the live budget equals the fixture's $900.
  await expect(page.getByText("$900").first()).toBeVisible();
});
