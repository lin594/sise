import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type PresentationEvent = {
  name: "dealer-back" | "dealer-face" | "deal" | "declaration";
  handCount: number;
  cardLabel?: string;
};

type FourPlayerTable = {
  contexts: BrowserContext[];
  pages: Page[];
};

const PLAYER_NAMES = ["四人甲", "四人乙", "四人丙", "四人丁"];
const VIEWPORTS = [
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
];

async function createFourPages(browser: Browser): Promise<FourPlayerTable> {
  const contexts = await Promise.all(VIEWPORTS.map((viewport, index) => browser.newContext({
    viewport,
    ...(index === 0 ? { hasTouch: true, isMobile: true } : {}),
  })));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  return { contexts, pages };
}

async function closeFourPages(table: FourPlayerTable): Promise<void> {
  await Promise.all(table.contexts.map((context) => context.close()));
}

async function enterModeLobby(page: Page, name: string): Promise<void> {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("nickname-input").fill(name);
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

async function observeRoundPresentation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trackingWindow = window as Window & {
      __siseRoundPresentationEvents?: PresentationEvent[];
      __siseRoundPresentationObserver?: MutationObserver;
    };
    trackingWindow.__siseRoundPresentationEvents = [];
    const scan = () => {
      const events = trackingWindow.__siseRoundPresentationEvents!;
      const record = (event: PresentationEvent) => {
        if (!events.some((entry) => entry.name === event.name)) events.push(event);
      };
      const handCount = document.querySelectorAll("[data-testid^='hand-card-']").length;
      if (document.querySelector("[data-testid='dealer-reveal-back']")) {
        record({ name: "dealer-back", handCount });
      }
      const dealerFace = document.querySelector<HTMLElement>(
        "[data-testid='dealer-reveal-card'] [role='img']",
      );
      if (dealerFace) {
        record({ name: "dealer-face", handCount, cardLabel: dealerFace.getAttribute("aria-label") ?? "" });
      }
      if (document.querySelector(".deal-overlay")) record({ name: "deal", handCount });
      if (document.querySelector("[data-testid='confirm-declaration']")) {
        record({ name: "declaration", handCount });
      }
    };
    trackingWindow.__siseRoundPresentationObserver?.disconnect();
    trackingWindow.__siseRoundPresentationObserver = new MutationObserver(scan);
    trackingWindow.__siseRoundPresentationObserver.observe(document.body, { childList: true, subtree: true });
    scan();
  });
}

async function readPresentationEvents(page: Page): Promise<PresentationEvent[]> {
  return page.evaluate(() =>
    (window as Window & { __siseRoundPresentationEvents?: PresentationEvent[] })
      .__siseRoundPresentationEvents ?? [],
  );
}

async function expectCompleteRoundPresentation(pages: Page[]): Promise<void> {
  await Promise.all(pages.map(async (page) => {
    await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
    await expect.poll(async () => (await readPresentationEvents(page)).map((event) => event.name))
      .toEqual(["dealer-back", "dealer-face", "deal", "declaration"]);
    const events = await readPresentationEvents(page);
    expect(events.find((event) => event.name === "dealer-back")?.handCount).toBe(0);
    expect(events.find((event) => event.name === "dealer-face")?.handCount).toBe(0);
    expect(events.find((event) => event.name === "dealer-face")?.cardLabel).toMatch(/^[红黄绿白].+|^金条.+/);
    await expect(page.getByTestId("dealer-card")).toHaveCount(1);
  }));

  const dealerSnapshots = await Promise.all(pages.map((page) => page.evaluate(() => {
    const state = (window as Window & {
      __siseLocalTest?: {
        getRoomState: () => {
          dealerId: string;
          dealerPickerId?: string;
          dealerCard?: { id: string; color: string };
          players?: Array<{ clientId: string; seatIndex: number; handCount: number }>;
        } | null;
      };
    }).__siseLocalTest?.getRoomState();
    const mark = document.querySelector<HTMLElement>("[data-testid='dealer-card']");
    const players = [...(state?.players ?? [])].sort((left, right) => left.seatIndex - right.seatIndex);
    const order = players.map((player) => player.clientId);
    const pickerIndex = order.indexOf(state?.dealerPickerId ?? "");
    const colorOffset = ({ yellow: 0, red: 1, gold: 1, green: 2, white: 3 } as Record<string, number>)[
      state?.dealerCard?.color ?? ""
    ] ?? 0;
    return {
      dealerId: state?.dealerId ?? "",
      dealerPickerId: state?.dealerPickerId ?? "",
      dealerCardId: state?.dealerCard?.id ?? "",
      markedPlayerId: mark?.closest<HTMLElement>("[data-player-id]")?.dataset.playerId ?? "",
      ruleDealerId: pickerIndex >= 0 ? order[(pickerIndex + colorOffset) % order.length] ?? "" : "",
      handCounts: players.map((player) => ({ id: player.clientId, count: player.handCount })),
    };
  })));
  expect(dealerSnapshots.every((snapshot) => snapshot.dealerId.length > 0)).toBe(true);
  expect(dealerSnapshots.every((snapshot) => snapshot.dealerPickerId.length > 0)).toBe(true);
  expect(new Set(dealerSnapshots.map((snapshot) => snapshot.dealerId)).size).toBe(1);
  expect(new Set(dealerSnapshots.map((snapshot) => snapshot.dealerPickerId)).size).toBe(1);
  expect(new Set(dealerSnapshots.map((snapshot) => snapshot.dealerCardId)).size).toBe(1);
  expect(dealerSnapshots.every((snapshot) => snapshot.markedPlayerId === snapshot.dealerId)).toBe(true);
  expect(dealerSnapshots.every((snapshot) => snapshot.ruleDealerId === snapshot.dealerId)).toBe(true);
  expect(dealerSnapshots.every((snapshot) => snapshot.handCounts.length === 4)).toBe(true);
  expect(dealerSnapshots.every((snapshot) => snapshot.handCounts.every((player) =>
    player.count === (player.id === snapshot.dealerId ? 21 : 20),
  ))).toBe(true);
}

async function seatFourFriends(pages: Page[]): Promise<void> {
  const [host, ...guests] = pages;
  await enterModeLobby(host!, PLAYER_NAMES[0]!);
  await host!.getByTestId("mode-friends").click();
  await host!.getByTestId("lobby-start").click();
  await expect(host!.getByTestId("seat-grid")).toBeVisible();
  const invitation = host!.url();

  await Promise.all(guests.map(async (guest, index) => {
    await guest.goto(invitation);
    await guest.getByTestId("nickname-input").fill(PLAYER_NAMES[index + 1]!);
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId(`claim-seat-${index + 1}`).click();
    await expect(guest.getByTestId(`seat-${index + 1}`)).toContainText("你");
    await guest.getByTestId("lobby-ready").click();
    await expect(guest.getByTestId("lobby-ready")).toHaveAttribute("aria-pressed", "true");
  }));
  await expect(host!.getByTestId("lobby-start")).toBeEnabled();
}

async function joinFourPlayerQuickMatch(pages: Page[]): Promise<void> {
  await Promise.all(pages.map((page, index) => enterModeLobby(page, PLAYER_NAMES[index]!)));
  await Promise.all(pages.map(observeRoundPresentation));
  await Promise.all(pages.map((page) => page.getByTestId("mode-quick_match").click()));
  for (const page of pages) {
    await page.getByTestId("lobby-start").click();
  }
  await Promise.all(pages.map((page) => expect(page.getByTestId("match-human-count")).toHaveText("真人 4 / 4")));
}

async function expectCrowdedActionDock(page: Page): Promise<void> {
  const metrics = await page.getByTestId("action-row").evaluate((row) => {
    const rowRect = row.getBoundingClientRect();
    const controls = Array.from(row.querySelectorAll<HTMLElement>("button"));
    const rects = controls.map((control) => control.getBoundingClientRect());
    return {
      controlCount: controls.length,
      rows: new Set(controls.map((control) => Math.round(control.offsetTop))).size,
      rowRect: { left: rowRect.left, top: rowRect.top, right: rowRect.right, bottom: rowRect.bottom },
      controlRects: rects.map((rect) => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      })),
      noHorizontalOverflow: row.scrollWidth <= row.clientWidth + 1,
      allContained: rects.every((rect) =>
        rect.left >= rowRect.left - 0.5 && rect.right <= rowRect.right + 0.5 &&
        rect.top >= rowRect.top - 0.5 && rect.bottom <= rowRect.bottom + 0.5),
      allReachable: rects.every((rect, index) => {
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === controls[index] || controls[index]!.contains(hit);
      }),
      minimumWidth: Math.min(...rects.map((rect) => rect.width)),
      minimumHeight: Math.min(...rects.map((rect) => rect.height)),
    };
  });
  expect(metrics.controlCount).toBeGreaterThanOrEqual(5);
  expect(metrics.rows).toBe(2);
  expect(metrics.noHorizontalOverflow).toBe(true);
  expect(metrics.allContained, JSON.stringify(metrics)).toBe(true);
  expect(metrics.allReachable).toBe(true);
  expect(metrics.minimumWidth).toBeGreaterThanOrEqual(40);
  expect(metrics.minimumHeight).toBeGreaterThanOrEqual(40);
}

test("four real friends keep every crowded action reachable after wrapping", async ({ browser }) => {
  test.setTimeout(120_000);
  const table = await createFourPages(browser);
  const [host] = table.pages;
  try {
    await seatFourFriends(table.pages);
    await Promise.all(table.pages.map(observeRoundPresentation));
    await host!.getByTestId("lobby-start").click();
    await expectCompleteRoundPresentation(table.pages);
    await Promise.all(table.pages.map((page) => page.getByTestId("confirm-declaration").click()));
    await Promise.all(table.pages.map((page) => expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/)));

    await expect.poll(() => host!.evaluate(() => {
      const bridge = (window as Window & {
        __siseLocalTest?: {
          setupScenario: (scenario: string) => void;
          getLastResult: () => { scenario: string; ok: boolean } | null;
        };
      }).__siseLocalTest;
      const result = bridge?.getLastResult();
      if (result?.scenario !== "crowded_collective_actions" || !result.ok) {
        bridge?.setupScenario("crowded_collective_actions");
      }
      return result;
    })).toMatchObject({ scenario: "crowded_collective_actions", ok: true });

    await expect(host!.getByTestId("action-kai")).toBeEnabled();
    await expect(host!.getByTestId("action-peng")).toBeEnabled();
    await expect(host!.getByTestId("action-deferred-pass")).toBeEnabled();
    await expect(host!.getByTestId("action-deferred-pass")).toHaveText("抓");
    await expectCrowdedActionDock(host!);
    await host!.setViewportSize({ width: 320, height: 568 });
    await expect(host!.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    await expectCrowdedActionDock(host!);
    for (const button of await host!.locator(".action-dock button:enabled").all()) {
      await button.click({ trial: true });
    }
  } finally {
    await closeFourPages(table);
  }
});

test("four real quick-match players share one complete dealer-card presentation", async ({ browser }) => {
  test.setTimeout(120_000);
  const table = await createFourPages(browser);
  try {
    await joinFourPlayerQuickMatch(table.pages);
    const roomIds = await Promise.all(table.pages.map((page) =>
      page.evaluate(() => localStorage.getItem("four_room_id")),
    ));
    expect(roomIds[0]).toBeTruthy();
    expect(new Set(roomIds).size).toBe(1);
    await expectCompleteRoundPresentation(table.pages);
    await Promise.all(table.pages.map((page) => expect(page.locator(".player-card .bot-seat-badge")).toHaveCount(0)));
  } finally {
    await closeFourPages(table);
  }
});
