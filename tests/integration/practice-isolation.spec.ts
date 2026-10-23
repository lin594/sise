import { expect, test } from "@playwright/test";

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:2567";

test("compatibility practice entries always receive different rooms", async ({ request }) => {
  const [firstResponse, secondResponse] = await Promise.all([
    request.get(`${BACKEND_URL}/room-id`),
    request.get(`${BACKEND_URL}/room-id`),
  ]);
  expect(firstResponse.ok()).toBe(true);
  expect(secondResponse.ok()).toBe(true);
  expect(firstResponse.headers()["cache-control"]).toContain("no-store");
  expect(secondResponse.headers()["cache-control"]).toContain("no-store");

  const first = (await firstResponse.json()) as { roomId?: string };
  const second = (await secondResponse.json()) as { roomId?: string };
  expect(first.roomId).toBeTruthy();
  expect(second.roomId).toBeTruthy();
  expect(first.roomId).not.toBe(second.roomId);
});
