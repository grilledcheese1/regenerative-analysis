import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (tag: string) => `felix+${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

export async function signUp(page: Page, address = uniqueEmail("su")) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Name").fill("Felix");
  await dlg.getByLabel("Email").fill(address);
  await dlg.getByLabel("Password").fill("password123");
  await dlg.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(page).toHaveURL(/\/onboarding$/);
  return address;
}

/** Clicks Continue and waits for the next step, so a click never lands during the step change. */
export async function cont(page: Page) {
  const label = page.getByText(/^Step \d of 8$/);
  const before = await label.textContent();
  await page.getByRole("navigation", { name: "Onboarding" }).getByRole("button", { name: /^(Continue|Let's go)$/ }).click();
  await expect(label).not.toHaveText(before ?? "");
}

/** Clicks through onboarding with the defaults and lands on /home. */
export async function finishOnboardingWithDefaults(page: Page) {
  await cont(page); // welcome
  for (let i = 0; i < 5; i++) await cont(page); // car, contract, insurance, driving, goals
  await page.getByRole("button", { name: "Connect with Nessie" }).click();
  await expect(page.getByText("Local copy")).toBeVisible();
  await cont(page);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

export const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
