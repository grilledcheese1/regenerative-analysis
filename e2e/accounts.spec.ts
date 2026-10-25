import { expect, test, type Page } from "@playwright/test";
import { finishOnboardingWithDefaults, noOverflow, signUp } from "./helpers";

// Demo accounts and the one-identity header (accounts plan).

const kaiRow = (scope: ReturnType<Page["getByRole"]>) =>
  scope.locator(".signin__row").filter({ has: scope.page().locator(".signin__name", { hasText: /^Kai$/ }) });


test("sign up, land on onboarding, sign out", async ({ page }) => {
  await signUp(page);
  await finishOnboardingWithDefaults(page);
  const me = page.getByRole("button", { name: "Felix ▾" });
  await expect(me).toBeVisible();
  await expect(page.getByText("Signed in as")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch person" })).toHaveCount(0);
  await expect(page.getByLabel("Demo customer")).toHaveCount(0);
  await noOverflow(page);
  await me.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
});

test("wrong password shows one generic message", async ({ page }) => {
  const address = await signUp(page);
  await finishOnboardingWithDefaults(page);
  await page.getByRole("button", { name: "Felix ▾" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Email").fill(address);
  await dlg.getByLabel("Password").fill("wrongpass1");
  await dlg.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(dlg.getByRole("alert")).toHaveText("Email or password is incorrect");
});

test("case study without an account", async ({ page }) => {
  await page.goto("/");
  await noOverflow(page);
  await page.getByRole("button", { name: "Explore a case study" }).click();
  await kaiRow(page.getByRole("dialog")).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByLabel("Demo customer")).toHaveValue("kai");
  await expect(page.getByRole("button", { name: "Exit case study" })).toBeVisible();
  await expect(page.getByRole("button", { name: /▾$/ })).toHaveCount(0);
  await noOverflow(page);
});

test("signing up closes an open case study", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a case study" }).click();
  await kaiRow(page.getByRole("dialog")).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Exit case study" }).click();
  await signUp(page);
  await finishOnboardingWithDefaults(page);
  await expect(page.getByLabel("Demo customer")).toHaveCount(0);
  await page.getByRole("button", { name: "Felix ▾" }).click();
  await page.getByRole("menuitem", { name: "Explore a case study" }).click();
  await kaiRow(page.getByRole("dialog", { name: "Explore a case study" })).click();
  await expect(page.getByLabel("Demo customer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Felix ▾" })).toBeVisible();
  await page.getByRole("button", { name: "Felix ▾" }).click();
  await page.getByRole("menuitem", { name: "Back to my profile" }).click();
  await expect(page.getByLabel("Demo customer")).toHaveCount(0);
});
