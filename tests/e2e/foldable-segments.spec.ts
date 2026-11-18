import { expect, test, type Page } from "@playwright/test";
import { finishDeclarationIfNeeded, startLobbyAction } from "./helpers/game";

test.use({ hasTouch: true, isMobile: true });

async function enterDecision(page: Page): Promise<void> {
  await page.goto("/?new=1&e2eDebug=1");
  await startLobbyAction(page);
  await finishDeclarationIfNeeded(page);
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario("chi_local_upper"));
  await expect(page.getByTestId("pending-card")).toBeVisible();
  await expect(page.getByTestId("action-chi")).toBeEnabled();
}

test("a masked browser viewport uses its larger pane for both the card and the action", async ({ page }) => {
  await page.setViewportSize({ width: 716, height: 800 });
  await enterDecision(page);
  const cdp = await page.context().newCDPSession(page);
  const metrics = { width: 716, height: 800, screenWidth: 716, screenHeight: 800, deviceScaleFactor: 1, mobile: true };
  try {
    const layout = page.locator("main.layout");
    await expect(layout).not.toHaveClass(/\bhinge-safe-viewport\b/);
    await cdp.send("Emulation.setDeviceMetricsOverride", { ...metrics,
      displayFeature: { orientation: "vertical", offset: 340, maskLength: 26 },
    });
    await expect.poll(() => page.evaluate(() => (window as any).viewport.segments.map(
      (r: DOMRect) => [r.left, r.width],
    ))).toEqual([[0, 340], [366, 350]]);
    await expect(layout).toHaveClass(/\bhinge-safe-viewport\b/);
    await expect(layout).toHaveAttribute("data-effective-viewport", "800x350");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
    const hingeRight = 366;
    for (const target of [layout, page.getByTestId("pending-card").locator(".response-card-face"), page.getByTestId("action-chi")]) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(hingeRight - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(717);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(801);
    }
    await page.getByTestId("action-chi").click({ trial: true });

    await cdp.send("Emulation.setDeviceMetricsOverride", { ...metrics,
      displayFeature: { orientation: "vertical", offset: 340, maskLength: 0 },
    });
    await expect(layout).not.toHaveClass(/\bhinge-safe-viewport\b/);
    await expect(layout).toHaveAttribute("data-effective-viewport", "716x800");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "false");

    await cdp.send("Emulation.setDeviceMetricsOverride", { ...metrics,
      displayFeature: { orientation: "horizontal", offset: 370, maskLength: 24 },
    });
    await expect(layout).toHaveAttribute("data-effective-viewport", "716x406");
    for (const target of [page.getByTestId("pending-card"), page.getByTestId("action-chi")]) {
      const box = await target.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(393);
      expect(box!.y + box!.height).toBeLessThanOrEqual(801);
    }
    await page.getByTestId("action-chi").tap();
    await expect(page.getByTestId("discard-confirm")).toBeVisible();
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.detach();
  }
});
