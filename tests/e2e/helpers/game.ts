import { expect, type Page } from "@playwright/test";

/** 有鱼或坎时完成声明；两者都没有时接受服务端直接进入牌局的正常快路径。 */
export async function finishDeclarationIfNeeded(page: Page, timeout = 20_000): Promise<void> {
  const layout = page.locator("main.layout");
  const confirm = page.getByTestId("confirm-declaration");

  await expect.poll(async () => {
    if (await layout.evaluate((element) => element.classList.contains("playing")).catch(() => false)) {
      return true;
    }
    if (
      await confirm.isVisible().catch(() => false)
      && await confirm.isEnabled().catch(() => false)
    ) {
      await confirm.click();
    }
    return layout.evaluate((element) => element.classList.contains("playing")).catch(() => false);
  }, { timeout }).toBe(true);
}

/** Wait until dealing reaches either an actionable declaration, an already
 * confirmed waiting state, or the no-choice fast path into play. */
export async function waitForDeclarationOrPlaying(page: Page, timeout = 20_000): Promise<void> {
  await expect.poll(async () =>
    await page.getByTestId("confirm-declaration").isVisible().catch(() => false)
      || await page.getByTestId("declaration-status").isVisible().catch(() => false)
      || await page.locator("main.layout").evaluate((element) => element.classList.contains("playing")).catch(() => false),
    { timeout },
  ).toBe(true);
}

/**
 * Replace a random opening hand with a deterministic declaration fixture for
 * tests whose subject is the declaration UI itself.
 */
export async function stageDeclarationForTest(page: Page, timeout = 20_000): Promise<void> {
  await expect(page.getByTestId("game-board")).toBeVisible({ timeout });
  await expect.poll(() => page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: {
        setupScenario: (scenario: string) => void;
        getLastResult: () => { scenario: string; ok: boolean } | null;
      };
    }).__siseLocalTest;
    if (!bridge) return null;
    const result = bridge.getLastResult();
    if (result?.scenario !== "staged_declaration" || !result.ok) {
      bridge.setupScenario("staged_declaration");
    }
    return result;
  }),
    { timeout },
  ).toMatchObject({ scenario: "staged_declaration", ok: true });
  await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout });
}
