import { expect, test, type Page } from "@playwright/test";

const TABS = ["Home", "Drives", "Money", "Compare", "Next Move", "Settings"];

// Shell tests (owned by the shell stream). Other streams add their own e2e/<stream>.spec.ts.

async function openNextMove(page: Page) {
  await page.goto("/next-move");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name });

async function selectPersona(page: Page, name: RegExp) {
  await page.getByLabel("Demo customer").selectOption({ label: (await page.getByLabel("Demo customer").locator("option", { hasText: name }).textContent())! });
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
}

test("Regen Coach stays at / and Next Move lives at /next-move", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Regen Coach");
  await expect(page.getByLabel("Demo customer")).toHaveCount(0);

  await page.goto("/next-move");
  await expect(page).toHaveTitle("Next Move");
  await expect(page.getByLabel("Demo customer")).toBeVisible();
});

test("Maria's journey reaches the next step with an explanation", async ({ page }) => {
  await page.goto("/next-move");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
  await page.getByRole("button", { name: "Next Move", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Leading option: Buy out the 2024 Camry Hybrid LE" })).toBeVisible();
  const cta = page.getByRole("link", { name: /Open Toyota Financial Services lease-end options/ });
  await expect(cta).toHaveAttribute("href", /^https:\/\/www\.toyotafinancial\.com\//);
  await expect(cta).toHaveAttribute("target", "_blank");
  // Without an API key the server explains with the template and says why.
  await expect(page.getByText(/Template explanation \(AI explanation unavailable/)).toBeVisible({ timeout: 15_000 });
});

test("Kai has no feasible option", async ({ page }) => {
  await page.goto("/next-move");
  await page.getByLabel("Demo customer").selectOption({ label: "Kai · financed RAV4, tight budget" });
  await page.getByRole("button", { name: "Next Move", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No option fits these constraints" })).toBeVisible();
});

test("E2 changed input changes the result (Maria)", async ({ page }) => {
  await openNextMove(page);
  await tab(page, "Next Move").click();
  const before = await page.locator("section.section h2").first().textContent();
  const stepBefore = await page.locator(".action").textContent();
  await tab(page, "Money").click();
  await page.getByLabel("New monthly expense").fill("30000");
  await tab(page, "Home").click();
  await expect(page.locator(".kv", { hasText: "Vehicle budget" })).toContainText("$600");
  await tab(page, "Next Move").click();
  const after = await page.locator("section.section h2").first().textContent();
  const stepAfter = await page.locator(".action").textContent();
  expect(`${after}|${stepAfter}`).not.toBe(`${before}|${stepBefore}`);
});

test("E3 keep preferred (Devon)", async ({ page }) => {
  await openNextMove(page);
  await selectPersona(page, /Devon/);
  await tab(page, "Next Move").click();
  await expect(page.getByText("Keep the current car")).toBeVisible();
});

test("E4 no feasible option (Kai)", async ({ page }) => {
  await openNextMove(page);
  await selectPersona(page, /Kai/);
  await tab(page, "Next Move").click();
  await expect(page.getByRole("heading", { name: "No option fits these constraints" })).toBeVisible();
  await expect(page.getByText("Review the budget").first()).toBeVisible();
});

test("E5 sliders recompute", async ({ page }) => {
  await openNextMove(page);
  await tab(page, "Compare").click();
  const total = page.locator("article.option").first().locator(".kv", { hasText: "Total monthly" });
  const before = await total.textContent();
  await page.getByLabel("Gas price").fill("450");
  await expect(total).not.toHaveText(before!);
});

test("E6 evidence visible", async ({ page }) => {
  await openNextMove(page);
  await tab(page, "Next Move").click();
  const row = page.locator(".evidence-list li", { hasText: "Monthly vehicle budget" });
  await expect(row).toContainText("Derived");
  await expect(row.locator(".ev-meta .mono").first()).not.toBeEmpty();
});

test("E7 persona switch resets", async ({ page }) => {
  await openNextMove(page);
  await tab(page, "Money").click();
  await page.getByLabel("New monthly expense").fill("30000");
  await selectPersona(page, /Devon/);
  await selectPersona(page, /Maria/);
  await tab(page, "Money").click();
  await expect(page.locator(".budget-math .total").first()).toContainText("$900");
});




test("E8 income confirmation clears the notice on every tab", async ({ page }) => {
  await openNextMove(page);
  await expect(page.getByText("Income is estimated from recurring deposits")).toBeVisible();
  await tab(page, "Money").click();
  await page.getByLabel(/Income estimate .* looks right/).check();
  for (const name of ["Home", "Compare", "Next Move"]) {
    await tab(page, name).click();
    await expect(page.getByText("Income is estimated from recurring deposits")).toHaveCount(0);
  }
});

test("E11 settings: insurer toggle disabled, consent toggles, delete keeps the app working", async ({ page }) => {
  await openNextMove(page);
  await tab(page, "Settings").click();
  await expect(page.locator("#consent-insurer")).toBeDisabled();
  const driving = page.locator("#consent-driving_analysis");
  await expect(driving).toBeEnabled();
  await driving.click();
  await expect(driving).toBeChecked();
  await expect(page.getByText(/driving_analysis: v.+/)).toBeVisible();
  await driving.click();
  await expect(driving).not.toBeChecked();
  await page.getByRole("button", { name: "Delete my demo data" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText(/Deleted: |Nothing stored yet/)).toBeVisible();
  await tab(page, "Home").click();
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
});

test("E12 no horizontal scroll on any tab (runs on desktop and mobile projects)", async ({ page }) => {
  await openNextMove(page);
  for (const name of TABS) {
    await tab(page, name).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name} overflows`).toBeLessThanOrEqual(0);
  }
});

test("E13 no console errors across all tabs; missing Mapbox token shows the static preview", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await openNextMove(page);
  for (const name of TABS) {
    await tab(page, name).click();
    if (name === "Drives") await expect(page.getByText(/Map tiles unavailable/i)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
