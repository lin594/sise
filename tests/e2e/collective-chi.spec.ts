import { expect, test, type Page } from '@playwright/test';
import { openGameAs, startLobbyAction, finishDeclarationIfNeeded } from './helpers/game';

async function inject(page: Page, scenario: string) {
  await page.evaluate(scenario => (window as any).__siseLocalTest.setupScenario(scenario), scenario);
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getLastResult())).toMatchObject({ scenario, ok: true });
}

for (const outcome of ['pass', 'peng', 'only-chi', 'delayed-hand', 'disconnect'] as const) {
  test(`confirmed collective chi respects ${outcome} and consumes each card once`, async ({ browser }) => {
    const hostContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const guestContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    try {
      await openGameAs(host, '/?e2eDebug=1', '先选吃');
      await host.getByTestId('mode-friends').click();
      await expect.poll(() => host.url()).toContain('roomId=');
      await openGameAs(guest, host.url(), '全局响应');
      await guest.getByTestId('claim-seat-1').click();
      await host.getByTestId('fill-bots').click();
      await guest.getByTestId('lobby-ready').click();
      await startLobbyAction(host);
      await Promise.all([finishDeclarationIfNeeded(host), finishDeclarationIfNeeded(guest)]);
      await inject(host, outcome === 'only-chi' ? 'chi_collective_only' : 'chi_collective_confirm');
      await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'collective');
      await expect(host.getByTestId('action-chi')).toBeEnabled();
      await expect(host.getByTestId('action-guidance')).toContainText('可以提前吃');
      await expect(host.getByTestId('action-guidance')).toContainText('确认即放弃本轮胡、开、碰');
      await expect(host.getByTestId('action-chi')).toHaveAttribute('aria-label', /提前吃/);
      if (outcome === 'only-chi') {
        await expect(host.getByTestId('action-peng')).toHaveCount(0);
      } else {
        await expect(host.getByTestId('action-peng')).toBeEnabled();
        await expect(guest.getByTestId('action-peng')).toBeEnabled();
      }
      // Competing actions do not imply a choice: compose the eat explicitly.
      if (outcome !== 'only-chi') {
        await host.getByTestId('hand-card-confirm-ma').click();
        await host.getByTestId('hand-card-confirm-pao').click();
      }
      await expect(host.getByTestId('hand-card-confirm-ma')).toHaveAttribute('aria-pressed', 'true');
      if (outcome === 'pass') {
        await host.getByTestId('clear-chi-draft').click();
        await expect(host.getByTestId('hand-card-confirm-ma')).toHaveAttribute('aria-pressed', 'false');
        await expect(host.getByTestId('action-peng')).toBeEnabled();
        await expect.poll(() => host.evaluate(() => (window as any).__siseLocalTest.getDeferredChiDebug().intent)).toBeNull();
        await host.getByTestId('chi-choices').locator('[data-kind="jmp"]').click();
        await expect(host.getByTestId('action-peng')).toBeEnabled();
      }
      await host.getByTestId('action-chi').click();
      if (outcome !== 'only-chi') {
        await expect(host.getByTestId('decision-status')).toContainText('已确认吃，等待本牌轮到你');
        await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'collective');
        await expect(host.getByTestId('action-peng')).toHaveCount(0);
        await expect(host.getByTestId('clear-chi-draft')).toHaveCount(0);
        if (outcome === 'disconnect') {
          await hostContext.setOffline(true);
          await expect(host.locator('main.layout')).toHaveAttribute('data-connection-state', 'offline');
          await expect.poll(() => host.evaluate(() => (window as any).__siseLocalTest.getDeferredChiDebug().intent)).toBeNull();
          await hostContext.setOffline(false);
          await expect(host.locator('main.layout')).toHaveAttribute('data-connection-state', /^(connected|restored)$/);
        }
        if (outcome === 'delayed-hand') await host.evaluate(() => (window as any).__siseLocalTest.setPrivateHandReadyOverride(false));
        await guest.getByTestId(`action-${outcome === 'delayed-hand' || outcome === 'disconnect' ? 'pass' : outcome}`).click();
        if (outcome === 'disconnect') {
          await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'local_upper', { timeout: 15_000 });
          await expect(host.getByTestId('action-chi')).toBeEnabled();
          await expect(host.getByTestId('hand-card-confirm-ma')).toBeVisible();
          await expect.poll(() => host.evaluate(() => (window as any).__siseLocalTest.getDeferredChiDebug().intent)).toBeNull();
          for (const id of ['confirm-ma', 'confirm-pao']) {
            const card = host.getByTestId(`hand-card-${id}`);
            if (await card.getAttribute('aria-pressed') !== 'true') await card.click();
          }
          await host.getByTestId('action-chi').click();
        }
        if (outcome === 'delayed-hand') {
          await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'local_upper');
          await expect(host.getByTestId('hand-card-confirm-ma')).toBeVisible();
          await host.evaluate(() => (window as any).__siseLocalTest.setPrivateHandReadyOverride(true));
        }
      }
      const consumed = () => host.evaluate(() => {
        const state = (window as any).__siseLocalTest.getRoomState();
        const cards = state.players.flatMap((p: any) => p.exposedArea ?? []);
        return ['confirm-target', 'confirm-ma', 'confirm-pao'].map(id => cards.filter((c: any) => c.id === id).length);
      });
      await expect(host.getByTestId('decision-status')).toContainText(outcome === 'peng' ? '全局响应碰了' : '已吃进', { timeout: 15_000 });
      await expect.poll(consumed, { timeout: 15_000 }).toEqual(outcome === 'peng' ? [1, 0, 0] : [1, 1, 1]);
      await expect(host.getByTestId('decision-status').filter({ hasText: '已确认吃，等待本牌轮到你' })).toHaveCount(0);
      await host.waitForTimeout(350);
      expect(await consumed()).toEqual(outcome === 'peng' ? [1, 0, 0] : [1, 1, 1]);
    } catch (error) {
      const diagnostic = await host.evaluate(() => {
        const bridge = (window as any).__siseLocalTest;
        const state = bridge.getRoomState();
        return { debug: bridge.getDeferredChiDebug(), timer: bridge.getDecisionTimer(), phase: state.responsePhase, current: state.currentPlayerId, action: state.lastAction, target: state.responseCard };
      });
      console.log(JSON.stringify(diagnostic));
      await test.info().attach('deferred-chi-state', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
      throw error;
    } finally {
      await guestContext.close(); await hostContext.close();
    }
  });
}

test('drawn red horse offers downstream Chi/Peng/Pass together and applies Chi after the shared privacy floor', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const guestContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  try {
    await openGameAs(host, '/?e2eDebug=1', '截图复现');
    await host.getByTestId('mode-friends').click();
    await expect.poll(() => host.url()).toContain('roomId=');
    await openGameAs(guest, host.url(), '旁观响应');
    await guest.getByTestId('claim-seat-1').click();
    await host.getByTestId('fill-bots').click();
    await guest.getByTestId('lobby-ready').click();
    await startLobbyAction(host);
    await Promise.all([finishDeclarationIfNeeded(host), finishDeclarationIfNeeded(guest)]);

    await inject(host, 'chi_draw_downstream_confirm');
    await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'collective');
    await expect(host.getByTestId('action-peng')).toBeEnabled();
    await expect(host.getByTestId('action-chi')).toBeEnabled();
    await expect(host.getByTestId('action-pass')).toBeEnabled();
    await expect(host.getByTestId('action-guidance')).toContainText('可以提前吃');
    await expect(host.getByTestId('action-guidance')).toContainText('当前可选择碰、吃或过');
    await expect(host.getByTestId('action-chi')).toHaveAttribute('aria-label', /确认即放弃本轮胡、开、碰/);

    await host.getByTestId('hand-card-draw-red-ju').click();
    await host.getByTestId('hand-card-draw-red-pao').click();
    await expect(host.getByTestId('hand-card-draw-red-ju')).toHaveAttribute('aria-pressed', 'true');
    await expect(host.getByTestId('hand-card-draw-red-pao')).toHaveAttribute('aria-pressed', 'true');

    const clickedAt = Date.now();
    await host.getByTestId('action-chi').click();
    await expect(host.getByTestId('decision-status')).toContainText('已确认吃，等待本牌轮到你');

    const consumed = () => host.evaluate(() => {
      const state = (window as any).__siseLocalTest.getRoomState();
      const cards = state.players.flatMap((p: any) => p.exposedArea ?? []);
      return ['draw-red-ma-target', 'draw-red-ju', 'draw-red-pao'].map(id =>
        cards.filter((card: any) => card.id === id).length);
    });
    await expect.poll(consumed, { timeout: 5_000 }).toEqual([1, 1, 1]);
    expect(Date.now() - clickedAt).toBeLessThan(5_000);
    await expect(host.getByTestId('decision-status').filter({ hasText: '已确认吃，等待本牌轮到你' })).toHaveCount(0);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test('a drawn general accepts one deferred Chi and resolves after the shared privacy floor', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const guestContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  try {
    await openGameAs(host, '/?e2eDebug=1', '白将提前吃');
    await host.getByTestId('mode-friends').click();
    await expect.poll(() => host.url()).toContain('roomId=');
    await openGameAs(guest, host.url(), '隐私窗口牌友');
    await guest.getByTestId('claim-seat-1').click();
    await host.getByTestId('fill-bots').click();
    await guest.getByTestId('lobby-ready').click();
    await startLobbyAction(host);
    await Promise.all([finishDeclarationIfNeeded(host), finishDeclarationIfNeeded(guest)]);

    await inject(host, 'chi_draw_special_confirm');
    await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'collective');
    await expect(host.getByTestId('action-chi')).toBeEnabled();
    await expect(host.getByTestId('action-pass')).toHaveCount(0);
    await expect(host.getByTestId('action-guidance')).toContainText('可以提前吃');
    await expect.poll(() => host.evaluate(() =>
      (window as any).__siseLocalTest.getDecisionTimer().totalMs,
    )).toBe(3_000);

    for (const id of ['special-owner-white-shi', 'special-owner-white-xiang']) {
      const card = host.getByTestId(`hand-card-${id}`);
      if (await card.getAttribute('aria-pressed') !== 'true') await card.click();
    }
    await expect(host.getByTestId('hand-card-special-owner-white-shi')).toHaveAttribute('aria-pressed', 'true');
    await expect(host.getByTestId('hand-card-special-owner-white-xiang')).toHaveAttribute('aria-pressed', 'true');

    const privacyEndsAt = await host.evaluate(() =>
      Number((window as any).__siseLocalTest.getDecisionTimer().endsAt ?? 0),
    );
    await host.getByTestId('action-chi').click();
    await expect(host.getByTestId('decision-status')).toContainText('已确认吃，等待本牌轮到你');
    await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'collective');

    const consumed = () => host.evaluate(() => {
      const state = (window as any).__siseLocalTest.getRoomState();
      const cards = state.players.flatMap((player: any) => player.exposedArea ?? []);
      return ['special-white-jiang-target', 'special-owner-white-shi', 'special-owner-white-xiang'].map(id =>
        cards.filter((card: any) => card.id === id).length);
    });
    expect(await consumed()).toEqual([0, 0, 0]);
    await expect.poll(consumed, { timeout: 8_000 }).toEqual([1, 1, 1]);
    expect(Date.now()).toBeGreaterThanOrEqual(privacyEndsAt - 250);
    await expect.poll(() => host.evaluate(() =>
      (window as any).__siseLocalTest.getDeferredChiDebug().intent,
    )).toBeNull();
    await expect(host.getByTestId('discard-confirm')).toBeVisible();
    await host.waitForTimeout(350);
    expect(await consumed()).toEqual([1, 1, 1]);
  } finally {
    await guestContext.close(); await hostContext.close();
  }
});

for (const interceptor of ['kai', 'hu'] as const) {
  test(`a competing ${interceptor} clears a confirmed deferred Chi before the next decision`, async ({ browser }) => {
    const hostContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const guestContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    try {
      await openGameAs(host, '/?e2eDebug=1', `预选吃-${interceptor}`);
      await host.getByTestId('mode-friends').click();
      await expect.poll(() => host.url()).toContain('roomId=');
      await openGameAs(guest, host.url(), `抢牌-${interceptor}`);
      await guest.getByTestId('claim-seat-1').click();
      await host.getByTestId('fill-bots').click();
      await guest.getByTestId('lobby-ready').click();
      await startLobbyAction(host);
      await Promise.all([finishDeclarationIfNeeded(host), finishDeclarationIfNeeded(guest)]);

      await inject(host, `chi_collective_intercept_${interceptor}`);
      await expect(host.getByTestId('action-chi')).toBeEnabled();
      await host.getByTestId('hand-card-confirm-ma').click();
      await host.getByTestId('hand-card-confirm-pao').click();
      await host.getByTestId('action-chi').click();
      await expect(host.getByTestId('decision-status')).toContainText('已确认吃，等待本牌轮到你');

      await expect(guest.getByTestId(`action-${interceptor}`)).toBeEnabled();
      await guest.getByTestId(`action-${interceptor}`).click();
      await expect(host.getByTestId('decision-status')).toContainText(`抢牌-${interceptor}${interceptor === 'hu' ? '胡' : '开'}了`);
      await expect.poll(() => host.evaluate(() => (window as any).__siseLocalTest.getDeferredChiDebug().intent)).toBeNull();
      await expect(host.getByTestId('decision-status').filter({ hasText: '已确认吃，等待本牌轮到你' })).toHaveCount(0);
      await host.waitForTimeout(350);
      const deferredCardsConsumed = await host.evaluate(() => {
        const state = (window as any).__siseLocalTest.getRoomState();
        return state.players
          .flatMap((player: any) => player.exposedArea ?? [])
          .some((card: any) => card.id === 'confirm-ma' || card.id === 'confirm-pao');
      });
      expect(deferredCardsConsumed).toBe(false);
    } finally {
      await guestContext.close();
      await hostContext.close();
    }
  });
}

test('the drawer taking a drawn card by Chi clears the downstream deferred Chi', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const ownerContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const host = await hostContext.newPage(), owner = await ownerContext.newPage();
  try {
    await openGameAs(host, '/?e2eDebug=1', '下游预选吃');
    await host.getByTestId('mode-friends').click();
    await expect.poll(() => host.url()).toContain('roomId=');
    await openGameAs(owner, host.url(), '抓牌者');
    await owner.getByTestId('claim-seat-3').click();
    await host.getByTestId('fill-bots').click();
    await owner.getByTestId('lobby-ready').click();
    await startLobbyAction(host);
    await Promise.all([finishDeclarationIfNeeded(host), finishDeclarationIfNeeded(owner)]);

    await inject(host, 'chi_draw_upstream_confirm');
    await expect(host.getByTestId('action-chi')).toBeEnabled();
    await host.getByTestId('hand-card-draw-red-ju').click();
    await host.getByTestId('hand-card-draw-red-pao').click();
    await host.getByTestId('action-chi').click();
    await expect(host.getByTestId('decision-status')).toContainText('已确认吃，等待本牌轮到你');

    await expect(owner.getByTestId('action-chi')).toBeEnabled();
    await owner.getByTestId('action-chi').click();
    await expect(host.getByTestId('decision-status')).toContainText('抓牌者吃了');
    await expect.poll(() => host.evaluate(() => (window as any).__siseLocalTest.getDeferredChiDebug().intent), { timeout: 10_000 }).toBeNull();
    await expect(host.getByTestId('decision-status').filter({ hasText: '已确认吃，等待本牌轮到你' })).toHaveCount(0);
    await host.waitForTimeout(350);
    const downstreamCardsConsumed = await host.evaluate(() => {
      const state = (window as any).__siseLocalTest.getRoomState();
      return state.players
        .flatMap((player: any) => player.exposedArea ?? [])
        .some((card: any) => card.id === 'draw-red-ju' || card.id === 'draw-red-pao');
    });
    expect(downstreamCardsConsumed).toBe(false);
  } finally {
    await ownerContext.close();
    await hostContext.close();
  }
});

test('one online human does not need to click a preview before the upstream bot eats', async ({ page }, info) => {
  await openGameAs(page, '/?e2eDebug=1', '联网预选验收');
  await startLobbyAction(page);
  await finishDeclarationIfNeeded(page);
  await inject(page, 'chi_preview_bot');
  await expect.poll(() => page.evaluate(() => {
    const state = (window as any).__siseLocalTest.getRoomState();
    return state.players.flatMap((player: any) => player.exposedArea ?? [])
      .filter((card: any) => card.id === 'preview-bot-draw').length;
  }), { timeout: 5_000 }).toBe(1);
  const state = await page.evaluate(() => (window as any).__siseLocalTest.getRoomState());
  expect(state.roomId).not.toBe('offline-practice');
  expect(state.players.filter((player: any) => player.isBot)).toHaveLength(3);
  for (const id of ['preview-human-shi', 'preview-human-spare', 'preview-human-xiang']) {
    await expect(page.getByTestId(`hand-card-${id}`)).toBeVisible();
  }
  await expect(page.locator('.hand-card')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('online-bot-without-preview-click.png') });
});

for (const change of ['new-card', 'new-round', 'reload'] as const) {
  test(`confirmed Grab expires on ${change}`, async ({ page }) => {
    await openGameAs(page, '/?e2eDebug=1', '抓牌预选清理');
    await startLobbyAction(page);
    await finishDeclarationIfNeeded(page);
    await inject(page, 'chi_collective_confirm');
    await page.getByTestId('action-deferred-pass').click();
    await expect(page.getByTestId('decision-status')).toContainText('已确认抓');
    await expect(page.getByTestId('action-peng')).toHaveCount(0);
    if (change === 'reload') {
      await page.reload();
      await expect(page.getByTestId('game-board')).toBeVisible();
    } else {
      await page.evaluate(change => {
        const bridge = (window as any).__siseLocalTest;
        const state = bridge.getRoomState();
        const patch = change === 'new-round' ? { completedRounds: state.completedRounds + 1 }
          : { responseCard: { ...state.responseCard, id: 'replacement-preview-target' } };
        bridge.applyRoomSnapshot({ ...patch, stateRevision: state.stateRevision + 100 }, 'explicit');
      }, change);
    }
    await expect(page.getByTestId('decision-status').filter({ hasText: '已确认抓' })).toHaveCount(0);
  });
}

test('a local Grab preselection draws exactly once after the real local phase unlocks', async ({ browser }, info) => {
  const hostContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const guestContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  try {
    await openGameAs(host, '/?e2eDebug=1', '提前抓验收');
    await host.getByTestId('mode-friends').click();
    await expect.poll(() => host.url()).toContain('roomId=');
    await openGameAs(guest, host.url(), '全局响应');
    await guest.getByTestId('claim-seat-1').click();
    await host.getByTestId('fill-bots').click();
    await guest.getByTestId('lobby-ready').click();
    await startLobbyAction(host);
    await Promise.all([finishDeclarationIfNeeded(host), finishDeclarationIfNeeded(guest)]);
    await inject(host, 'chi_collective_confirm');
    const before = await host.evaluate(() => (window as any).__siseLocalTest.getRoomState());
    await host.getByTestId('action-deferred-pass').click();
    await expect(host.getByTestId('decision-status')).toContainText('已确认抓');
    await expect(host.getByTestId('action-peng')).toHaveCount(0);
    await guest.getByTestId('action-pass').click();
    const draws = (state: any) => state.tableTransitions.filter((event: any) => event.kind === 'draw' &&
      !before.tableTransitions.some((old: any) => old.id === event.id) && event.action === `${before.hostPlayerId} ZHUA`);
    await expect.poll(async () => draws(await host.evaluate(() => (window as any).__siseLocalTest.getRoomState())).length,
      { timeout: 7_000 }).toBe(1);
    const after = await host.evaluate(() => (window as any).__siseLocalTest.getRoomState());
    expect(draws(after)).toHaveLength(1);
    expect(after.deckCount).toBe(before.deckCount - 1);
    expect(draws(after)[0].moves[0].card.id).not.toBe('confirm-target');
    await expect(host.getByTestId('hand-card-confirm-target')).toHaveCount(0);
    for (const id of ['confirm-ma', 'confirm-pao']) await expect(host.getByTestId(`hand-card-${id}`)).toBeVisible();
    await expect(host.getByTestId('decision-status').filter({ hasText: '已确认抓' })).toHaveCount(0);
    await host.screenshot({ path: info.outputPath('grab-one-new-card.png') });
  } finally {
    await guestContext.close(); await hostContext.close();
  }
});
