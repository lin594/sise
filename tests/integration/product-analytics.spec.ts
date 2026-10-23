import { expect, test } from "@playwright/test";

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
