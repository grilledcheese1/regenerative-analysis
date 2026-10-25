import { expect, test } from "@playwright/test";
import { cont, finishOnboardingWithDefaults, noOverflow, signUp } from "./helpers";

// Onboarding: a new account's answers become their own profile (onboarding plan).

test("new user finishes onboarding and sees their own numbers", async ({ page }) => {
  await signUp(page);
  await noOverflow(page);
  await cont(page);

  await page.getByRole("button", { name: /2021 RAV4 AWD/ }).click();
  await noOverflow(page);
  await cont(page);

  await page.getByRole("button", { name: /^Loan/ }).click();
  await page.getByLabel("Payoff today").fill("14000");
  await page.getByLabel("Monthly payment").fill("455");
  await page.getByLabel("APR (%)").fill("7.9");
  await page.getByLabel("Payments left").fill("30");
  await noOverflow(page);
  await cont(page);

  await page.getByRole("button", { name: "Connect Toyota Insurance (simulated)" }).click();
  await expect(page.getByText("Connected · SIMULATED")).toBeVisible();
  await expect(page.getByText("Toyota Insurance (simulated)").first()).toBeVisible();
  await noOverflow(page);
  await cont(page);

  await page.getByRole("slider", { name: "Miles a month" }).fill("900");
  await noOverflow(page);
  await cont(page);
  await noOverflow(page);
  await cont(page); // goals

  await page.getByLabel("Take-home pay (monthly)").fill("4800");
  await page.getByLabel("Rent or mortgage").fill("1500");
  await expect(page.getByText("Your car budget")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("button", { name: "Connect with Nessie" }).click();
  await expect(page.getByText("Local copy")).toBeVisible();
  await expect(page.getByText("Nessie isn't configured on this server, so the same history was created locally.")).toBeVisible();
  await noOverflow(page);
  await cont(page);

  await expect(page.getByRole("heading", { name: "Here’s your profile" })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("button", { name: "Felix ▾" })).toBeVisible();
  await expect(page.getByLabel("Demo customer")).toHaveCount(0);
  await expect(page.getByText("Felix's 2021 RAV4 AWD")).toBeVisible();
  await page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name: "Cost" }).click();
  await expect(page.locator(".budget-math").first()).toContainText("$4,800");
});

test("validation blocks a past lease end date", async ({ page }) => {
  await signUp(page);
  await cont(page);
  await cont(page);
  await page.getByRole("button", { name: /^Lease/ }).click();
  await page.getByLabel("Lease ends on").fill("2026-01-01");
  await page.getByRole("navigation", { name: "Onboarding" }).getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Pick a date between today and 4 years from now")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Is your car paid off, financed, or leased?" })).toBeVisible();
});

test("reload keeps the profile", async ({ page }) => {
  await signUp(page);
  await finishOnboardingWithDefaults(page);
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Felix's 2024 Camry Hybrid LE")).toBeVisible();
});

test("a signed-in user without a profile is sent to onboarding", async ({ page }) => {
  await signUp(page);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("the story shows the user's own profile", async ({ page }) => {
  await signUp(page);
  await finishOnboardingWithDefaults(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Felix ▾" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an account" })).toHaveCount(0);
  await noOverflow(page);
});

test("deleting demo data removes the profile for good", async ({ page }) => {
  await signUp(page);
  await finishOnboardingWithDefaults(page);
  await page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Delete my demo data" }).first().click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText(/Deleted: |Nothing stored yet/)).toBeVisible();
  await page.goto("/home");
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("signing out clears the profile from this browser", async ({ page }) => {
  await signUp(page);
  await finishOnboardingWithDefaults(page);
  await page.getByRole("button", { name: "Felix ▾" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("regentic.")))).toEqual([]);
});
