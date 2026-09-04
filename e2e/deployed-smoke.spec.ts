import { expect, test } from "@playwright/test";

/**
 * Runs against the deployed site, not a local server, and is the only test that
 * touches the real Supabase project and the real Modal endpoint.
 *
 * The rest of the suite deliberately stubs the backend out, so a deployment
 * whose Supabase project has been paused or deleted still passes every other
 * check: the bundle builds, the screens render, and the game only dies at the
 * camera check, where the player waits on a warm-up that can never succeed.
 * This spec is what notices that.
 */
test.setTimeout(120_000);

test("the deployed game reaches a startable camera check", async ({ page }) => {
  const unreachable: string[] = [];
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("supabase.co") && !url.includes("modal.run")) return;
    const reason = request.failure()?.errorText ?? "unknown";
    // The warm-up cancels itself through an AbortController whenever the effect
    // re-runs, so an aborted request is the app working, not a backend missing.
    if (reason.includes("ERR_ABORTED")) return;
    unreachable.push(`${request.method()} ${url} — ${reason}`);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Тоглоом эхлүүлэх" }).click();
  await page.getByRole("button", { name: "Камераа шалгах" }).click();
  await expect(page.getByRole("heading", { name: "Камераа шалгая" })).toBeVisible();

  const startable = page.getByRole("button", { name: "Тоглоом эхлүүлэх" });
  let ready = true;
  try {
    // Modal cold starts are real, so the wait is generous; what must not happen
    // is waiting forever, which is what a player gets when the backend is gone.
    await expect(startable).toBeEnabled({ timeout: 60_000 });
  } catch {
    ready = false;
  }

  // Report the cause rather than a bare timeout: a dead Supabase project shows
  // up here as the requests that never reached a host.
  const detail = unreachable.length
    ? `\nrequests that never reached a backend:\n${unreachable.join("\n")}`
    : `\nno request failed outright; last screen was:\n${await page.locator("main").innerText()}`;
  expect(ready, `the deployed game never became playable${detail}`).toBe(true);
  expect(unreachable, "no request to Supabase or Modal may fail").toEqual([]);
});
