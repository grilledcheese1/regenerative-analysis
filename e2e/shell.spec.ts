import { expect, test } from "@playwright/test";

// Shell smoke tests (owned by the shell stream). Other streams add their own e2e/<stream>.spec.ts.

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
