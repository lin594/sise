import { test, expect } from "@playwright/test";
import { startLobbyAction, finishDeclarationIfNeeded } from "./helpers/game";

test("optional analytics uses only allowlisted bodies and unavailable collection cannot block play", async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/product-events', async route => {
    bodies.push(route.request().postDataJSON());
    await route.abort('failed');
  });
  await page.goto('/');
  await startLobbyAction(page);
  await finishDeclarationIfNeeded(page);
  await expect(page.locator('main.layout')).toHaveClass(/playing/);
  await expect.poll(() => bodies.some(body => body.name === 'app_open')).toBe(true);
  await expect.poll(() => bodies.some(body => body.name === 'practice_start')).toBe(true);
  const allowed = new Set(['name', 'id', 'visitId', 'mode', 'outcome', 'durationMs', 'persistent']);
  for (const body of bodies) {
    expect(Object.keys(body).every(key => allowed.has(key))).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/gp_[a-f0-9]{48}|pt_[a-f0-9]{48}|nickname|privateHand|https?:/);
    expect(body.name).not.toBe('round_complete');
    expect(body.name).not.toBe('round_start');
  }
});

test("HTTP collector rejects forged authority and sensitive payloads without echoing them", async ({ request }) => {
  const headers = { Authorization: `Bearer gp_${'d'.repeat(48)}` };
  for (const body of [{ name: 'round_complete', id: 'forged' }, { name: 'app_open', id: 'sensitive', nickname: 'private-name' }]) {
    const response = await request.post('http://127.0.0.1:2567/product-events', { headers, data: body });
    expect(response.status()).toBe(400);
    expect(await response.text()).not.toContain('private-name');
  }
  const accepted = await request.post('http://127.0.0.1:2567/product-events', { headers, data: { name: 'app_open', id: 'valid' } });
  expect(accepted.status()).toBe(202);
});
