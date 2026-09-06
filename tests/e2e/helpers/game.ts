import { expect, type Page } from "@playwright/test";

/**
 * Complete any real declaration choice, while accepting the valid fast path
 * where a hand with no fish or hidden kan enters play without rendering the
 * declaration panel.
 */
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
