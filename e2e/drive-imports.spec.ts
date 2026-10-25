import { expect, test, type Page } from "@playwright/test";

// Drive imports (stream 1). Each test gets a fresh browser context, so a fresh demo owner.

async function openDrives(page: Page) {
  await page.goto("/home");
  await expect(page.locator('main[data-bank="fixture"]')).toBeVisible();
  await page.getByRole("button", { name: "Drives", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your drives" })).toBeVisible();
}

async function trySample(page: Page, file: string) {
  await page.getByText("Try a sample drive").click();
  await page.getByRole("button", { name: file }).click();
  await expect(page.getByTestId("import-preview")).toBeVisible();
}

async function importAndConfirm(page: Page, file: string) {
  await trySample(page, file);
  await page.getByLabel("I was driving (not a passenger)").check();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByTestId("import-preview")).toHaveCount(0);
}

const confirmedTrips = (page: Page) => page.getByRole("list", { name: "Confirmed trips" }).getByRole("listitem");
// The shell hides the header source tags on narrow screens, so check the tag's text, not its visibility.
const compareMiles = (page: Page) => page.locator(".slider", { hasText: "Monthly miles" }).locator(".mono");

test("E1: preview, cancel, then confirm a sample drive", async ({ page }) => {
  await openDrives(page);
  await trySample(page, "maria-commute-am.gpx");
  const preview = page.getByTestId("import-preview");
  await expect(preview.getByText(/^Route, mileage(,| and) speed/)).toBeVisible();
  await expect(preview.getByText("Synthetic sample built from a cached Austin route. Not a recorded drive.")).toBeVisible();
  await expect(page.getByText("Sample trips · synthetic")).toBeVisible();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(preview).toHaveCount(0);

  await trySample(page, "maria-commute-am.gpx");
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeDisabled(); // the driver checkbox is required
  await page.getByLabel("I was driving (not a passenger)").check();
  await confirm.click();
  await expect(confirmedTrips(page)).toHaveCount(1);
  await expect(confirmedTrips(page).first()).toContainText("3.3 mi");
});

test("E2 + E3: imported usage changes Compare, and reverting restores the persona estimate", async ({ page }) => {
  await openDrives(page);
  await importAndConfirm(page, "maria-commute-am.gpx");
  await importAndConfirm(page, "maria-commute-pm.gpx");
  await expect(confirmedTrips(page)).toHaveCount(2);

  await expect(page.getByLabel("Trips per week")).toHaveValue("10");
  const profileMiles = (await page.getByTestId("profile-monthly-miles").textContent())!.trim();
  await expect(page.getByTestId("usage-status")).toHaveText("Your comparison uses your estimate of 875 mi/mo.");
  await expect(page.getByRole("button", { name: "Use my estimate instead" })).toBeDisabled();
  await page.getByRole("button", { name: "Use for comparison" }).click();
  // Visible confirmation on the Drives tab itself, not only on Compare.
  await expect(page.getByTestId("usage-status")).toHaveText(`Your comparison now uses ${profileMiles} mi/mo from your drives.`);

  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(compareMiles(page)).toHaveText(profileMiles);

  await page.getByRole("button", { name: "Drives", exact: true }).click();
  await page.getByRole("button", { name: "Use my estimate instead" }).click();
  await expect(page.getByTestId("usage-status")).toHaveText("Your comparison uses your estimate of 875 mi/mo.");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(compareMiles(page)).toHaveText("875");
});

test("E4: an unsafe GPX upload shows the server's message and no preview", async ({ page }) => {
  await openDrives(page);
  const xxe = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><gpx><trk><trkseg><trkpt lat="30" lon="-97"><name>&xxe;</name></trkpt></trkseg></trk></gpx>`;
  await page.getByLabel("Import a drive").setInputFiles({ name: "xxe.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(xxe) });
  await expect(page.getByRole("alert").filter({ hasText: "GPX files with a DOCTYPE or entity declarations aren't accepted." })).toBeVisible();
  await expect(page.getByTestId("import-preview")).toHaveCount(0);
});

test("E5: the sparse sample supports route and mileage only, with no event count", async ({ page }) => {
  await openDrives(page);
  await trySample(page, "sparse-no-time.gpx");
  const preview = page.getByTestId("import-preview");
  await expect(preview.getByText("Route and mileage only.")).toBeVisible();
  await expect(preview.getByText("time not recorded")).toBeVisible();
  await expect(page.getByTestId("decel-events")).toHaveCount(0);
});

test("re-importing a confirmed file says it was already imported", async ({ page }) => {
  await openDrives(page);
  await importAndConfirm(page, "devon-errand.gpx");
  await trySample(page, "devon-errand.gpx");
  await expect(page.getByTestId("import-preview").getByText(/^Already imported on/)).toBeVisible();
  await expect(confirmedTrips(page)).toHaveCount(1);
});

test("an imported drive opens in the replay with a full regen analysis", async ({ page }) => {
  await openDrives(page);
  await page.getByLabel("Import a drive").setInputFiles("docs/demo/drives/demo-drive-1-commute.gpx");
  await expect(page.getByTestId("import-preview")).toBeVisible();
  await page.getByLabel("I was driving (not a passenger)").check();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  // Confirming opens the drive in the replay: the driven route, scored by the regen model.
  await expect(page.getByRole("heading", { name: /^Your drive, Oct 22, 2026/ })).toBeVisible();
  await expect(page.getByText("Your route · modeled car")).toBeVisible();
  await expect(page.locator("#drive-route")).toHaveValue(/^trip:/);
  await expect(page.getByText("Route, elevation, speeds and stops from your imported GPS file.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where the braking energy went" })).toBeVisible();

  // Switching away and back through the list works too.
  await page.locator("#drive-route").selectOption({ index: 1 });
  await expect(page.getByText("Real route · modeled car")).toBeVisible();
  await confirmedTrips(page).first().getByRole("button", { name: "Replay & analyze" }).click();
  await expect(page.getByText("Your route · modeled car")).toBeVisible();
});
