import { expect, test } from "@playwright/test";

test("Mimic Rush runs from the landing door through twelve close-up challenges", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("link", { name: /Mimic Rush/ }).click();
  await expect(page).toHaveURL(/\/pose-party$/);
  await expect(page.getByRole("heading", { name: /MIMIC RUSH/ })).toBeVisible();

  await page.goto("/pose-party?demo=1");
  await expect(page.getByText(/Нүүр, мөр л хангалттай/)).toBeVisible();
  await expect(page.getByText(/12 fusion challenge · combo оноо/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Mimic Rush эхлүүлэх/ })).toBeVisible();
  await expect(page.getByText(/ARENA MIX|MIMIC CLASSIC|HEAD MOTION RUSH/)).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("01-mimic-intro.png") });

  await page.getByRole("button", { name: /Mimic Rush эхлүүлэх/ }).click();
  await expect(page.getByRole("heading", { name: "ИНЭЭ + ЗҮҮН ИРМЭЛТ" })).toBeVisible({
    timeout: 8_000,
  });
  const cameraBox = await page.locator("section").locator(":scope > div").first().boundingBox();
  expect(cameraBox?.height ?? 0).toBeGreaterThan(600);
  await page.waitForTimeout(180);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("02-mimic-face-round.png") });

  await expect(page.getByRole("heading", { name: "ИНЭЭ + ЗҮҮН ХАЗАЙЛТ" })).toBeVisible({
    // Four browser workers can throttle demo timers heavily on a laptop.
    timeout: 60_000,
  });
  await expect(page.getByText("FACE + HEAD FUSION")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("03-mimic-motion-fusion.png") });

  await expect(page.getByText("MIMIC RUSH ДУУСЛАА")).toBeVisible({ timeout: 75_000 });
  // Four parallel browser workers can delay demo timers past an individual
  // seven-second round. Completion and a twelve-round result are invariant;
  // the focused Mimic run separately confirms the all-success 12/12 path.
  await expect(page.getByText(/\d+\/12 challenge/)).toBeVisible();
  await expect(page.getByText(/Best combo x\d+/)).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByText(/CROWN/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("04-mimic-result.png") });

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1);
});
