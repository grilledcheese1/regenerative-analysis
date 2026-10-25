import { expect, test, type Page } from "@playwright/test";
import { cont, noOverflow, signUp } from "./helpers";

// Loan pre-qualification (pre-qualification plan): connect the bank, see a rate and the reasons.

async function connectWithScore(page: Page, score: string) {
  await signUp(page);
  for (let i = 0; i < 6; i++) await cont(page); // welcome → bank
  await page.getByLabel("About what's your credit score?").fill(score);
  await page.getByRole("button", { name: "Connect with Nessie" }).click();
  await expect(page.getByText("Local copy")).toBeVisible();
  return page.getByRole("region", { name: "Loan pre-qualification" });
}

test("connecting the bank shows a pre-qualified rate and its reasons", async ({ page }) => {
  const card = await connectWithScore(page, "760");
  await expect(card.getByText("Finance your next car")).toBeVisible();
  await expect(card.getByText("Pre-qualified").first()).toBeVisible();
  await expect(card.getByText(/\d+\.\d–\d+\.\d% APR/).first()).toBeVisible();
  await expect(card.getByText("Estimate, not an offer or a credit decision", { exact: false })).toBeVisible();
  await noOverflow(page);
});

test("a score under 500 is not pre-qualified, with the score as a reason", async ({ page }) => {
  const card = await connectWithScore(page, "480");
  await expect(card.getByText("Not pre-qualified").first()).toBeVisible();
  await expect(card.getByText("Credit score 480 is below 500").first()).toBeVisible();
});

test("a loan holder sees refinancing; a lease holder doesn't", async ({ page }) => {
  await page.goto("/home?as=kai");
  await page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name: "Cost" }).click();
  await expect(page.getByRole("region", { name: "Loan pre-qualification" }).getByText("Refinance your loan")).toBeVisible();

  await page.goto("/home?as=maria");
  await page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name: "Cost" }).click();
  const card = page.getByRole("region", { name: "Loan pre-qualification" });
  await expect(card.getByText("Finance your next car")).toBeVisible();
  await expect(card.getByText("Refinance your loan")).toHaveCount(0);
  await noOverflow(page);
});
