import { expect, test, type Page } from "@playwright/test";
import { noOverflow } from "./helpers";

// Lease terms, reliability and the mid-lease switch (lease-terms plan).

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name, exact: true });

test("Maria's lease offers four terms, and picking one changes only that card", async ({ page }) => {
  await page.goto("/home?as=maria");
  const headline = page.getByRole("heading", { name: "Leading option: Buy out the 2024 Camry Hybrid LE" });
  await tab(page, "Next Step").click();
  await expect(headline).toBeVisible();
  await tab(page, "Compare").click();
  const card = page.locator("article.option").filter({ has: page.getByRole("group", { name: "Lease term" }) });
  for (const t of ["12 mo", "24 mo", "36 mo", "48 mo"]) await expect(card.getByRole("button", { name: new RegExp(`^${t}`) })).toBeVisible();
  await expect(card.getByText("Best")).toBeVisible();
  const before = await card.getByTestId("term-detail").textContent();
  await card.getByRole("button", { name: /^12 mo/ }).click();
  await expect(card.getByTestId("term-detail")).not.toHaveText(before!);
  await expect(card.getByText(/The recommendation uses the \d+-month term\./)).toBeVisible();
  await tab(page, "Next Step").click();
  await expect(headline).toBeVisible();
});

test("Jordan is told to switch now, with the trade-in math", async ({ page }) => {
  await page.goto("/home?as=jordan");
  await tab(page, "Next Step").click();
  await expect(page.getByRole("heading", { name: /Switch now: lease 2025 Corolla Hybrid/ })).toBeVisible();
  await tab(page, "Compare").click();
  const math = page.getByTestId("switch-math").first();
  await expect(math).toContainText("$2,500");
  await expect(math).toContainText("Saves on average");
});

test("each car shows its NHTSA record", async ({ page }) => {
  await page.goto("/home?as=jordan");
  await tab(page, "Compare").click();
  await expect(page.getByText(/NHTSA: \d+ recalls? · \d+ complaints?/).first()).toBeVisible();
  await noOverflow(page);
});
