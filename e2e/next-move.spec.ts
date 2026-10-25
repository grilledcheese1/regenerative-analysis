import { expect, test } from "@playwright/test";
import { openNextMove, selectPersona, tab } from "./helpers";

test.describe("Next Move journeys", () => {
  test("E1 main journey (Maria)", async ({ page }) => {
    await openNextMove(page);
    await tab(page, "Money").click();
    await expect(page.locator(".budget-math .total").first()).toContainText("$900");
    await page.getByLabel(/Income estimate .* looks right/).check();
    await expect(page.getByText("Income is estimated from recurring deposits")).toHaveCount(0);
    await tab(page, "Compare").click();
    await expect(page.locator("article.option")).toHaveCount(3);
    await expect(page.locator("article.option").first()).toContainText(/Leading/i);
    await tab(page, "Next Move").click();
    await expect(page.getByRole("heading", { name: "Leading option: Buy out the 2024 Camry Hybrid LE" })).toBeVisible();
    await expect(page.getByText("needs information")).toBeVisible();
    const link = page.getByRole("link", { name: /Open Toyota Financial Services lease-end options/ });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", /^https:\/\/www\.toyotafinancial\.com\//);
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

  test("E11 settings: insurer toggle disabled, delete keeps the app working", async ({ page }) => {
    await openNextMove(page);
    await tab(page, "Settings").click();
    await expect(page.locator("#consent-insurer")).toBeDisabled();
    await page.getByRole("button", { name: "Delete my demo data" }).first().click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(/Deleted:|Could not delete/)).toBeVisible();
    await tab(page, "Home").click();
    await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
  });

  test("E12 no horizontal scroll on any tab", async ({ page }) => {
    await openNextMove(page);
    for (const name of ["Home", "Drives", "Money", "Compare", "Next Move", "Settings"]) {
      await tab(page, name).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} overflows`).toBeLessThanOrEqual(0);
    }
  });

  test("E13 missing Mapbox token: static preview, no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await openNextMove(page);
    await tab(page, "Drives").click();
    await expect(page.getByText(/Map tiles unavailable/i)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
