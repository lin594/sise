import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

test("multiple meld choices keep focus inside a safely cancellable dialog", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();

  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setPrivateHandReadyOverride: (ready: boolean | null) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setPrivateHandReadyOverride(false);
  });
  await expect(declaration).toBeDisabled();
  await expect(page.getByText("正在同步完整手牌", { exact: true })).toBeVisible();
  await expect(page.locator(".declare-panel")).toBeFocused();
  await page.evaluate(() => {
    (window as Window & {
      __siseLocalTest?: { setPrivateHandReadyOverride: (ready: boolean | null) => void };
    }).__siseLocalTest?.setPrivateHandReadyOverride(null);
  });
  await expect(declaration).toBeEnabled();
  await expect(declaration).toBeFocused();
  await expect(page.getByText("正在同步完整手牌", { exact: true })).toHaveCount(0);
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
  await expect(page.getByTestId("confirm-declaration")).toHaveCount(0);

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("chi_local_upper");
  });
  await expect.poll(() =>
    page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: {
          getLastResult: () => {
            scenario: string;
            ok: boolean;
            actions?: Array<{ action: string; enabled: boolean; deferred?: boolean }>;
          } | null;
        };
      }).__siseLocalTest?.getLastResult() ?? null,
    ),
  ).toMatchObject({
    scenario: "chi_local_upper",
    ok: true,
    actions: expect.arrayContaining([
      expect.objectContaining({ action: "chi", enabled: true }),
    ]),
  });

  const chiButton = page.getByTestId("action-chi");
  await expect(chiButton).toBeEnabled();
  await chiButton.click();

  const dialog = page.getByTestId("candidate-panel");
  const options = page.getByTestId("candidate-option");
  const cancel = page.getByTestId("candidate-cancel");
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleName("吃候选牌组");
  await expect(dialog).toHaveAccessibleDescription(/单独收下/);
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(options.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(chiButton).toBeFocused();
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-response-phase", "local_upper");

  await chiButton.click();
  await expect(options.first()).toBeFocused();
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(chiButton).toBeFocused();
});
