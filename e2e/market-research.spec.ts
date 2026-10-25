import { expect, test, type Page } from "@playwright/test";

// Market research (stream 3). Browser-side routes are mocked, so these never spend SerpAPI credits.

const listing = (i: number, price: number | null) => ({
  title: `2025 Toyota Corolla Hybrid listing ${i}`,
  url: `https://dealer${i}.example.com/car`,
  domain: `dealer${i}.example.com`,
  snippet: `Listing snippet ${i}`,
  advertisedPriceCents: price === null ? { known: false, reason: "no_plausible_price" } : { known: true, value: price * 100 },
  position: i,
});

const result = (origin: "live" | "saved_fixture") => ({
  requestId: "req_m",
  catalogId: "corolla_hybrid_2025",
  query: "2025 Toyota Corolla Hybrid for sale",
  provider: "serpapi_google",
  retrievedAt: "2026-10-24T20:00:00.000Z",
  origin,
  listings: [listing(1, 21_808), listing(2, 23_825), listing(3, null), listing(4, 24_954)],
  advertisedRange: { known: true, value: { lowCents: 2_180_800, highCents: 2_495_400, count: 3 } },
  disclaimer: "Advertised prices from public listings. Not a quote, offer, or valuation.",
});

async function openCompare(page: Page) {
  await page.goto("/home");
  await expect(page.getByText("Banking loaded (fixture)")).toBeVisible();
  await page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name: "Compare" }).click();
}

test("R1 listings open inside a new-vehicle card, with safe links and advertised labels", async ({ page }) => {
  await page.route("**/api/market/search**", (r) => r.fulfill({ json: result("live") }));
  await openCompare(page);
  const panel = page.getByText("See listings").first();
  await panel.click();
  await expect(page.getByText("Advertised $21,808–$24,954 across 3 listings")).toBeVisible();
  const link = page.getByRole("link", { name: "2025 Toyota Corolla Hybrid listing 1" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(page.getByText("no price shown")).toBeVisible();
  await expect(page.getByText("External · advertised").first()).toBeVisible();
  await expect(page.getByText(/Not a quote, offer, or valuation/)).toBeVisible();
});

test("R2 saved results are labeled with their date", async ({ page }) => {
  await page.route("**/api/market/search**", (r) => r.fulfill({ json: result("saved_fixture") }));
  await openCompare(page);
  await page.getByText("See listings").first().click();
  await expect(page.getByText(/Saved search from/)).toBeVisible();
});

test("R3 unavailable search says so and leaves the card intact", async ({ page }) => {
  await page.route("**/api/market/search**", (r) =>
    r.fulfill({ status: 503, json: { error: { code: "market_unavailable", message: "Market search unavailable right now", retryable: false, requestId: "x" } } }),
  );
  await openCompare(page);
  await page.getByText("See listings").first().click();
  await expect(page.getByText("Market search unavailable right now.")).toBeVisible();
  await expect(page.getByText("Economic cost").first()).toBeVisible();
});

test("R4 closed by default: browsing Compare makes no market requests and doesn't change card height", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/market/**", (r) => {
    requests++;
    return r.fulfill({ json: result("live") });
  });
  await openCompare(page);
  const card = page.locator("article.option").filter({ has: page.getByText("See listings") }).first();
  const before = (await card.boundingBox())!.height;
  await page.waitForTimeout(300);
  expect(requests).toBe(0);
  expect((await card.boundingBox())!.height).toBe(before);
});

test("R5 dealers appear with Maria's buyout-quote next step", async ({ page }) => {
  await page.route("**/api/market/dealers", (r) =>
    r.fulfill({
      json: {
        requestId: "req_d",
        provider: "serpapi_google_maps",
        retrievedAt: "2026-10-24T20:00:00.000Z",
        origin: "live",
        dealers: [{ name: "Round Rock Toyota", address: "2307 N Interstate Hwy 35, Round Rock, TX", rating: { known: true, value: 4.6 }, website: "https://www.roundrocktoyota.com/", phone: "(512) 488-4877" }],
      },
    }),
  );
  await page.goto("/home");
  await page.getByRole("navigation", { name: "Screens" }).getByRole("button", { name: "Next Step", exact: true }).click();
  await expect(page.getByText("Toyota dealers near Austin")).toBeVisible();
  await expect(page.getByRole("link", { name: "Round Rock Toyota" })).toHaveAttribute("rel", /noopener/);
  await expect(page.getByText(/doesn't request one for you/)).toBeVisible();
});
