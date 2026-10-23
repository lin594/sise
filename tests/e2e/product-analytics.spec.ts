import { test, expect } from "@playwright/test";
import { startLobbyAction, finishDeclarationIfNeeded } from "./helpers/game";

test("browser-local practice disables gameplay analytics and unavailable collection cannot block play", async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
  });
  await page.route('**/product-events', async route => {
    bodies.push(route.request().postDataJSON());
    await route.abort('failed');
  });
  await page.goto('/');
  await startLobbyAction(page);
  await finishDeclarationIfNeeded(page);
  await expect(page.locator('main.layout')).toHaveClass(/playing/);
  await expect.poll(() => bodies.some(body => body.name === 'app_open')).toBe(true);
  expect(bodies.some(body => body.name === 'practice_start')).toBe(false);
  const allowed = new Set(['name', 'id', 'visitId', 'mode', 'outcome', 'durationMs', 'persistent']);
  for (const body of bodies) {
    expect(Object.keys(body).every(key => allowed.has(key))).toBe(true);
    expect(body.id).toMatch(/^[a-zA-Z0-9:_-]{1,160}$/);
    expect(body.visitId).toMatch(/^[a-zA-Z0-9_-]{1,80}$/);
    expect(JSON.stringify(body)).not.toMatch(/gp_[a-f0-9]{48}|pt_[a-f0-9]{48}|nickname|privateHand|https?:/);
    expect(body.name).not.toBe('round_complete');
    expect(body.name).not.toBe('round_start');
  }
});
