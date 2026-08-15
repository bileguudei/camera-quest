import { expect, type Page, test } from "@playwright/test";

test.setTimeout(60_000);

async function expectNoViewportOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
}

test("representative game states protect the mobile and desktop playfield", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expectNoViewportOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("01-landing.png") });

  await page.getByRole("button", { name: "Тоглоом эхлүүлэх" }).click();
  await page.getByRole("radio", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Камераа шалгах" }).click();
  await expect(page.getByRole("heading", { name: "Камераа шалгая" })).toBeVisible();
  await page.waitForTimeout(400);
  await expectNoViewportOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("02-camera-check.png") });

  await page.getByRole("button", { name: "Тоглоом эхлүүлэх" }).click();
  await page.getByRole("button", { name: "Бэлэн", exact: true }).click();
  await expect(page.getByRole("button", { name: "Гарах", exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await expectNoViewportOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("03-playing-hud.png") });

  await page.getByRole("button", { name: "Dev tools", exact: true }).click();
  await page.getByRole("button", { name: "Success", exact: true }).click();
  await expect(page.getByRole("heading", { name: "АМЖИЛТТАЙ" })).toBeVisible();
  // Wait for the verdict spring and 700 ms score CountUp to reach their stable state.
  await page.waitForTimeout(900);
  await expectNoViewportOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("04-turn-result.png") });
});
