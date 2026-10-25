import { expect, test, type Page } from "@playwright/test";

// Ask Next Move. No provider keys in e2e, so every answer is the labeled template.

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name });
const panel = (page: Page) => page.getByRole("dialog", { name: "Ask Next Move" });

async function openAssistant(page: Page) {
  await page.goto("/home?as=maria");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
  await tab(page, "Compare").click();
  await page.getByRole("button", { name: "Ask Next Move" }).click();
  await expect(panel(page)).toBeVisible();
}

async function ask(page: Page, question: string) {
  await panel(page).getByLabel("Your question").fill(question);
  await panel(page).getByRole("button", { name: "Send" }).click();
}

test("A1 Maria asks why buy out and gets a labeled template answer with sources", async ({ page }) => {
  await openAssistant(page);
  await ask(page, "Why buy out?");
  const reply = panel(page).locator("[data-mode]").last();
  await expect(reply).toContainText(/buy ?out/i);
  await expect(reply).toContainText("Standard answer");
  await expect(reply.getByRole("button").first()).toBeVisible();
  await expect(panel(page).getByRole("button", { name: /What do I do next\?|What if gas hits \$5\?|What does it cost each month\?/ }).first()).toBeVisible();
});

test("A2 a $300 expense re-runs the math and the card says the decision changed", async ({ page }) => {
  await openAssistant(page);
  await ask(page, "What if I add a $300 expense?");
  const card = panel(page).getByTestId("assistant-whatif");
  await expect(card).toBeVisible();
  await expect(card).toContainText("The recommendation changed.");
  await expect(card).toContainText("Your screens are unchanged");
  // The main screen still shows the original scenario.
  await tab(page, "Cost").click();
  await expect(page.getByLabel("New monthly expense")).toHaveValue("0");
});

test("A3 a loan approval request is declined with no numbers", async ({ page }) => {
  await openAssistant(page);
  await ask(page, "Approve my loan");
  const reply = panel(page).locator("[data-mode]").last();
  await expect(reply).toContainText(/can't approve loans/i);
  expect(await reply.locator("p").nth(0).textContent()).not.toMatch(/\$|\d/);
});

test("A4 Esc closes, focus returns, and nothing scrolls sideways or logs errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 375, height: 700 });
  await openAssistant(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Next Move" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("A5 the assistant is hidden on Settings", async ({ page }) => {
  await page.goto("/home?as=maria");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
  await tab(page, "Settings").click();
  await expect(page.getByRole("button", { name: "Ask Next Move" })).toHaveCount(0);
});
