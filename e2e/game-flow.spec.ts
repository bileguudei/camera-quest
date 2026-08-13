import { expect, type Page, test } from "@playwright/test";

test.setTimeout(180_000);

async function openGame(page: Page, playerCount: 1 | 6) {
  await page.goto("/");
  await page.getByRole("button", { name: "Тоглоом эхлүүлэх" }).click();
  await page.getByRole("radio", { name: String(playerCount), exact: true }).click();
  await expect(page.getByLabel(`Тоглогч ${playerCount}`)).toBeVisible();
  await page.getByRole("button", { name: "Камераа шалгах" }).click();
  await expect(page.getByRole("heading", { name: "Камераа шалгая" })).toBeVisible();
  await page.getByRole("button", { name: "Тоглоом эхлүүлэх" }).click();
}

async function clearTurn(page: Page) {
  await page.getByRole("button", { name: "Бэлэн", exact: true }).click();
  await expect(page.getByRole("button", { name: "Гарах", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dev tools", exact: true }).click();
  await page.getByRole("button", { name: "Success", exact: true }).click();
  await expect(page.getByRole("heading", { name: "АМЖИЛТТАЙ" })).toBeVisible();
}

async function finishFiveRounds(page: Page, playerCount: 1 | 6) {
  for (let round = 1; round <= 5; round += 1) {
    for (let player = 1; player <= playerCount; player += 1) {
      await clearTurn(page);
      const lastPlayer = player === playerCount;
      await page
        .getByRole("button", {
          name: lastPlayer ? (round === 5 ? "Дүн харах" : "Раундын дүн") : "Дараагийн тоглогч",
          exact: true,
        })
        .click();
    }

    await page
      .getByRole("button", {
        name: round === 5 ? "Ялагчийг харах" : "Дараагийн раунд",
        exact: true,
      })
      .click();
  }
}

test("one player completes all five rounds", async ({ page }) => {
  await openGame(page, 1);
  await finishFiveRounds(page, 1);
  await expect(page.getByRole("heading", { name: "Тоглоом дууслаа" })).toBeVisible();
});

test("six players complete the authoritative 30-turn flow", async ({ page }) => {
  await openGame(page, 6);
  await finishFiveRounds(page, 6);
  await expect(page.getByText("Эцсийн байр")).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(6);
});
