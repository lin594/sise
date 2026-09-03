import { expect, test, type Page } from "@playwright/test";

async function preparePracticeEntry(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill(name);
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

test("compatibility practice entries always receive different rooms", async ({ request }) => {
  const [firstResponse, secondResponse] = await Promise.all([
    request.get("http://127.0.0.1:2567/room-id"),
    request.get("http://127.0.0.1:2567/room-id"),
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

test("two simultaneous single-player sessions never see each other", async ({ browser }) => {
  const firstContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const secondContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await Promise.all([
      preparePracticeEntry(first, "练习甲"),
      preparePracticeEntry(second, "练习乙"),
    ]);
    await Promise.all([
      first.getByTestId("lobby-start").click(),
      second.getByTestId("lobby-start").click(),
    ]);
    await Promise.all([
      expect(first.getByTestId("game-board")).toBeVisible({ timeout: 20_000 }),
      expect(second.getByTestId("game-board")).toBeVisible({ timeout: 20_000 }),
    ]);

    const [firstRoomId, secondRoomId] = await Promise.all([
      first.evaluate(() => localStorage.getItem("four_room_id")),
      second.evaluate(() => localStorage.getItem("four_room_id")),
    ]);
    expect(firstRoomId).toBeTruthy();
    expect(secondRoomId).toBeTruthy();
    expect(firstRoomId).not.toBe(secondRoomId);
    await expect(first.locator(".player-card .bot-seat-badge")).toHaveCount(3);
    await expect(second.locator(".player-card .bot-seat-badge")).toHaveCount(3);
    await expect(first.getByText("练习乙", { exact: true })).toHaveCount(0);
    await expect(second.getByText("练习甲", { exact: true })).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("an occupied practice room rejects a new identity but still restores its owner", async ({ browser, request }) => {
  const createResponse = await request.post("http://127.0.0.1:2567/rooms", {
    data: { mode: "practice" },
  });
  expect(createResponse.ok()).toBe(true);
  const created = (await createResponse.json()) as { roomId?: string };
  expect(created.roomId).toBeTruthy();

  const ownerContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const visitorContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const owner = await ownerContext.newPage();
  const visitor = await visitorContext.newPage();
  const roomUrl = `/?roomId=${encodeURIComponent(created.roomId!)}`;

  try {
    await owner.goto(roomUrl);
    await owner.getByTestId("nickname-input").fill("练习主人");
    await owner.getByTestId("login-submit").click();
    await expect(owner.getByTestId("seat-grid")).toBeVisible();
    const originalSeatId = await owner.evaluate(() =>
      document.querySelector<HTMLElement>("[data-testid='seat-grid'] [data-testid^='seat-']")
        ?.getAttribute("data-testid"),
    );
    expect(originalSeatId).toBeTruthy();

    await visitor.goto(roomUrl);
    await visitor.getByTestId("nickname-input").fill("陌生访客");
    await visitor.getByTestId("login-submit").click();
    await expect(visitor.locator("main.layout")).toHaveAttribute("data-connection-state", "closed", {
      timeout: 10_000,
    });
    await expect(
      visitor.getByTestId("resume-session-screen").getByText("这是单人练习房，已有玩家在练习。请返回首页重新开始。"),
    ).toBeVisible();
    await expect(visitor.getByText("这是单人练习房，已有玩家在练习。请返回首页重新开始。")).toHaveCount(1);
    await expect(visitor.getByRole("button", { name: "返回首页" })).toBeVisible();

    await owner.reload();
    await expect(owner.getByTestId("seat-grid")).toBeVisible({ timeout: 10_000 });
    await expect(owner.getByText("练习主人", { exact: true })).toBeVisible();
    await expect(owner.locator("main.layout")).toHaveAttribute("data-connection-state", /connected|restored/);
    expect(await owner.evaluate(() => localStorage.getItem("four_room_id"))).toBe(created.roomId);
  } finally {
    await ownerContext.close();
    await visitorContext.close();
  }
});
