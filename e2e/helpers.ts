import { expect, type Page } from "@playwright/test";

export async function openNextMove(page: Page) {
  await page.goto("/next-move");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
}

export const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name });

export async function selectPersona(page: Page, name: RegExp) {
  await page.getByLabel("Demo customer").selectOption({ label: (await page.getByLabel("Demo customer").locator("option", { hasText: name }).textContent())! });
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
}
