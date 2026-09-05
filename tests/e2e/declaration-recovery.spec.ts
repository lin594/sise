import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test("a disconnected declaration stays visible and becomes retryable after recovery", async ({ context, page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();

  const confirm = page.getByTestId("confirm-declaration");
  await expect(confirm).toBeEnabled({ timeout: 20_000 });
  const selectedFishBefore = await page.locator(".fish-option[aria-pressed='true']").count();
  const selectedKong = page.locator(".kong-choice[aria-checked='true']");
  const selectedKongCountBefore = await selectedKong.count();
  const selectedKongBefore = selectedKongCountBefore ? await selectedKong.textContent() : null;

  await context.setOffline(true);
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-state", "offline");
  await expect(confirm).toHaveCount(0);
  await expect(page.getByTestId("declaration-status")).toContainText("等待网络恢复");
  await expect(page.locator("button.fish-option, button.kong-choice")).toHaveCount(0);
  await expect(page.locator(".declare-error")).toContainText("刚才的选择还在");
  if (selectedKongCountBefore) await expect(page.getByTestId("kong-selection-summary")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("declaration-offline-568x320.png") });

  await context.setOffline(false);
  await expect(confirm).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator(".declare-error")).toHaveCount(0);
  expect(await page.locator(".fish-option[aria-pressed='true']").count()).toBe(selectedFishBefore);
  await expect(selectedKong).toHaveCount(selectedKongCountBefore);
  if (selectedKongCountBefore) expect(await selectedKong.textContent()).toBe(selectedKongBefore);

  await confirm.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
});
