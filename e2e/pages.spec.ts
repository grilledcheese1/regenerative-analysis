import { expect, test } from "@playwright/test";

test("E0 pages stay separate", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Demo customer")).toHaveCount(0);
  await page.goto("/next-move");
  await expect(page).toHaveTitle(/Next Move/);
  await expect(page.getByLabel("Demo customer")).toBeVisible();
});
