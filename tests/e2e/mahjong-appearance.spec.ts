import { expect, test, type Page } from '@playwright/test';
import { resolveTableLayout, normalizeTableLayout } from '../../client/src/utils/appearance';
import { startLobbyAction } from './helpers/game';
import { revealSetting } from './helpers/settings';

test.use({ hasTouch: true });

test('adaptive respects both dimensions, exact boundaries and explicit preferences', () => {
  for (const [width, height, expected] of [
    [568, 320, 'compact'], [639, 440, 'compact'], [960, 349, 'compact'],
    [640, 350, 'mahjong'], [667, 375, 'mahjong'], [844, 390, 'mahjong'],
    [932, 430, 'mahjong'], [959, 440, 'mahjong'], [960, 439, 'mahjong'],
    [960, 440, 'classic'], [1024, 768, 'classic'], [1280, 720, 'classic'], [1440, 900, 'classic'],
  ] as const) {
    expect(resolveTableLayout('adaptive', width, height)).toBe(expected);
    for (const layout of ['compact', 'mahjong', 'classic'] as const) {
      expect(resolveTableLayout(layout, width, height)).toBe(layout);
      expect(normalizeTableLayout(layout)).toBe(layout);
    }
  }
  expect(normalizeTableLayout(undefined)).toBe('adaptive');
  expect(normalizeTableLayout('obsolete')).toBe('adaptive');
});

async function start(page: Page, tableLayout = 'mahjong', mode = 'long', reduceMotion = true) {
  await page.addInitScript(prefs => { if (!localStorage.getItem('sise_game_display_preferences_v2')) localStorage.setItem('sise_game_display_preferences_v2', JSON.stringify(prefs)); },
    { tableLayout, ownCards: mode, tableCards: mode, handLayout: 'single', reduceMotion });
  await page.goto('/?new=1&e2eDebug=1');
  await startLobbyAction(page);
  await expect(page.getByTestId('game-board')).toBeVisible();
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('readable_exposed_groups'));
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getLastResult())).toMatchObject({ ok: true });
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getRoomState()?.lastAction))
    .toMatch(/^DEBUG: readable_exposed_groups#/);
  await expect(page.locator('.hand-card[data-card-id^="readable-hand-"]')).toHaveCount(1);
}

async function crowd(page: Page) {
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const deck = ['red', 'yellow', 'green', 'white'].flatMap(color =>
      ['jiang', 'shi', 'xiang', 'ju', 'ma', 'pao', 'zu'].flatMap(type =>
        Array.from({ length: 4 }, (_, i) => ({ id: `mahjong-${color}-${type}-${i}`, color, type }))));
    const take = (n: number) => deck.splice(0, n);
    const privateHand = take(21);
    const players = state.players.map((p: any) => ({ ...p, declaredKongs: 0, pendingFishGroupSizes: [], fishArea: [],
      handCount: p.isBot ? 0 : 21, discardPile: take(15), exposedArea: take(p.isBot ? 6 : 12),
      exposedGroupSizes: p.isBot ? [3, 3] : [3, 3, 3, 3], exposedGroupKinds: p.isBot ? ['chi', 'chi'] : ['chi', 'chi', 'chi', 'chi'] }));
    bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 100, privateHand, players }, 'explicit');
  });
  await expect(page.locator('.hand-card')).toHaveCount(21);
  await expect(page.locator('.discard-token')).toHaveCount(60);
  await expect(page.getByTestId('game-board')).toHaveAttribute('data-geometry-busy', 'false');
}

test('adaptive changes on resize and rotation while saved mahjong stays fixed', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await start(page, 'adaptive');
  for (const [width, height, layout] of [[568, 320, 'compact'], [667, 375, 'mahjong'], [390, 844, 'mahjong'], [1024, 768, 'classic']] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout', layout);
    await page.getByTestId('game-settings').click();
    await revealSetting(page, 'layout-adaptive');
    await expect(page.getByTestId('layout-adaptive')).toContainText({ compact: '紧凑布局', mahjong: '麻将布局', classic: '经典布局' }[layout]);
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  }
  await page.getByTestId('game-settings').click();
  await revealSetting(page, 'layout-mahjong');
  await page.getByTestId('layout-mahjong').click();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout', 'mahjong');
  await page.reload();
  await expect(page.locator('main.layout')).toHaveAttribute('data-table-layout', 'mahjong');
});

for (const mode of ['long', 'large']) test(`mahjong ${mode} keeps crowded rivers central and cards accessible`, async ({ page }, info) => {
  await start(page, 'mahjong', mode);
  await crowd(page);
  for (const [width, height] of [[568, 320], [667, 375], [844, 390], [932, 430], [390, 844], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const geometry = await page.getByTestId('game-board').evaluate(board => {
      const bounds = board.getBoundingClientRect();
      const table = board.querySelector<HTMLElement>('.table')!;
      const flows = [...board.querySelectorAll<HTMLElement>('.flow-card')];
      const within = (a: DOMRect, b: DOMRect) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      const overlaps = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const regions = [...flows, ...board.querySelectorAll<HTMLElement>('.player-card, .self-groups-card, .center')];
      return {
        contained: regions.every(el => within(el.getBoundingClientRect(), bounds)),
        noOverlap: regions.every((el, i) => regions.slice(i + 1).every(other => !overlaps(el.getBoundingClientRect(), other.getBoundingClientRect()))),
        tableFits: table.scrollHeight <= table.clientHeight + 1,
        handsVisible: [...board.querySelectorAll<HTMLElement>('.hand-card')].every(el => within(el.getBoundingClientRect(), board.querySelector('.hand')!.getBoundingClientRect())),
        sides: flows.map(el => el.dataset.flowSide).sort(),
        angles: Object.fromEntries(flows.map(el => [el.dataset.flowSide, getComputedStyle(el.querySelector('.discard-token')!).rotate])),
        flowCount: flows.map(el => el.querySelectorAll('.discard-token').length),
      };
    });
    expect(geometry, `${width}x${height}`).toMatchObject({ contained: true, noOverlap: true, tableFits: true, handsVisible: true,
      sides: ['bottom', 'left', 'right', 'top'], angles: { bottom: '0deg', left: '90deg', right: '-90deg', top: '180deg' }, flowCount: [15, 15, 15, 15] });
    // Every river can expose its final card without scrolling the whole table.
    for (const flow of await page.locator('.flow-card').all()) {
      await flow.locator('.discard-strip').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const visible = await flow.evaluate(el => {
        const strip = el.querySelector('.discard-strip')!.getBoundingClientRect();
        const last = el.querySelector('.discard-token:last-child')!.getBoundingClientRect();
        return last.left >= strip.left - 1 && last.right <= strip.right + 1 && last.top >= strip.top - 1 && last.bottom <= strip.bottom + 1;
      });
      expect(visible).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`mahjong-${mode}-${width}x${height}.png`) });
  }
});

test('rotated river flights land on the exact face and defer layout changes until finished', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await start(page, 'mahjong', 'long', false);
  for (const side of ['left', 'top', 'right']) {
    const playerId = await page.getByTestId(`player-${side}`).getAttribute('data-player-id');
    const card = { id: `flight-to-${side}`, color: 'white', type: 'ma', source: 'deck' };
    await page.evaluate(card => {
      const bridge = (window as any).__siseLocalTest;
      const state = bridge.getRoomState();
      bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 100, responsePhase: 'local_draw',
        responseCard: card, targetCard: card, publicDiscardPile: [], tableTransitions: [],
        tablePresentationVersion: 1, previousPlayerId: '', pollOriginPlayerId: '', lastAction: 'MAHJONG_FLIGHT_FIXTURE' }, 'explicit');
    }, card);
    await expect(page.locator(`.response-card-face[data-face-id="${card.id}"]`)).toBeVisible();
    await page.evaluate(({ card, playerId }) => {
      const bridge = (window as any).__siseLocalTest;
      const state = bridge.getRoomState();
      const now = Date.now();
      bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 1, responseCard: null, targetCard: null,
        players: state.players.map((p: any) => p.clientId === playerId ? { ...p, discardPile: [...p.discardPile, card] } : p),
        serverNow: now, tableTransitions: [{ id: state.stateRevision + 1, round: state.completedRounds + 1,
          kind: 'discard', startsAt: now, endsAt: now + 3000,
          moves: [{ card, from: { zone: 'center' }, to: { zone: 'flow', playerId } }] }] }, 'explicit');
    }, { card, playerId });
    const flight = page.locator(`[data-transition-card-id="${card.id}"]`);
    await expect(flight).toHaveAttribute('data-transition-stage', 'landed');
    const match = await page.evaluate(id => {
      const face = document.querySelector<HTMLElement>(`[data-transition-card-id="${id}"] .card`)!;
      const landing = document.querySelector<HTMLElement>(`.flow-card [data-face-id="${id}"]`)!;
      const a = face.getBoundingClientRect(), b = landing.getBoundingClientRect();
      return { delta: Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height)),
        transform: getComputedStyle(face).transform };
    }, card.id);
    expect(match.delta).toBeLessThanOrEqual(1);
    expect(match.transform).not.toBe('none');
    if (side === 'right') {
      await page.getByTestId('game-settings').click();
      await revealSetting(page, 'layout-classic');
      await page.getByTestId('layout-classic').click();
      await expect(page.getByTestId('game-board')).toHaveAttribute('data-layout-pending', 'true');
      await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout', 'mahjong');
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    }
    await expect(flight).toHaveCount(0);
    await expect(page.locator(`.flow-card [data-face-id="${card.id}"]`)).toBeVisible();
  }
  await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout', 'classic');
});

test('empty rivers, changed seat direction and new cards retain the correct owner and scroll access', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await start(page);
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 100, responseCard: null, targetCard: null,
      publicDiscardPile: [], previousPlayerId: '', pollOriginPlayerId: '', lastAction: 'EMPTY_RIVERS',
      players: state.players.map((p: any) => ({ ...p, discardPile: [] })) }, 'explicit');
  });
  await expect(page.locator('.flow-empty')).toHaveCount(4);
  await expect(page.locator('.discard-token')).toHaveCount(0);
  await crowd(page);
  for (const direction of ['clockwise', 'counterclockwise']) {
    await page.getByTestId('game-settings').click();
    await revealSetting(page, `seat-direction-${direction}`);
    await page.getByTestId(`seat-direction-${direction}`).click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    const ownership = await page.evaluate(() => {
      const state = (window as any).__siseLocalTest.getRoomState();
      return [...document.querySelectorAll<HTMLElement>('.flow-card')].every(lane => {
        const firstId = lane.querySelector<HTMLElement>('.discard-token')!.dataset.faceId;
        const owner = state.players.find((p: any) => p.discardPile.some((c: any) => c.id === firstId));
        const sourceSeat = document.querySelector<HTMLElement>(`[data-testid="player-${lane.dataset.flowSide}"]`);
        const receiver = state.players.find((p: any) => p.clientId === lane.dataset.flowReceiverId);
        return (!sourceSeat || sourceSeat.dataset.playerId === owner.clientId)
          && receiver.seatIndex === (owner.seatIndex + 1) % 4;
      });
    });
    expect(ownership).toBe(true);
  }
  const strip = page.locator('[data-flow-side="bottom"] .discard-strip');
  await strip.evaluate(el => { el.scrollTop = 0; });
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const firstId = document.querySelector<HTMLElement>('[data-flow-side="bottom"] .discard-token')!.dataset.faceId;
    bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 1, players: state.players.map((p: any) =>
      p.discardPile.some((c: any) => c.id === firstId)
        ? { ...p, discardPile: [...p.discardPile, { id: 'newest-river-card', color: 'white', type: 'zu' }] } : p) }, 'explicit');
  });
  await expect(page.locator('.discard-token')).toHaveCount(61);
  await expect.poll(() => strip.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(2);
  await strip.evaluate(el => { el.scrollTop = 0; });
  await expect.poll(() => strip.evaluate(el => el.scrollTop)).toBe(0);
});

async function manyMelds(page: Page, side: string, groupCount = 12) {
  await page.evaluate(({ side, groupCount }) => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const target = side === 'self' ? state.players.find((p: any) => !p.isBot).clientId
      : document.querySelector<HTMLElement>(`[data-testid="player-${side}"]`)!.dataset.playerId;
    // Twelve-group overview: 21 in hand + 40 in rivers + 36 stressed meld cards
    // + nine other meld cards = 106. The 28-group overflow fixture uses a smaller
    // hand and rivers (108 total), always within the 112-card physical deck.
    const deck = ['red', 'yellow', 'green', 'white'].flatMap(color =>
      ['jiang', 'shi', 'xiang', 'ju', 'ma', 'pao', 'zu'].flatMap(type =>
        Array.from({ length: 4 }, (_, i) => ({ id: `many-${color}-${type}-${i}`, color, type }))));
    const take = (n: number) => deck.splice(0, n);
    const privateHand = take(groupCount > 12 ? 3 : 21);
    bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 100, phase: 'playing',
      lastAction: 'MANY_MELDS_FIXTURE', tableTransitions: [], privateHand,
      players: state.players.map((p: any) => {
        const count = p.clientId === target ? groupCount : 1;
        return { ...p, handCount: p.isBot ? 0 : privateHand.length, declaredKongs: 0, fishArea: [], pendingFishGroupSizes: [],
          discardPile: take(groupCount > 12 ? 3 : 10), exposedArea: take(count * 3), exposedGroupSizes: Array(count).fill(3), exposedGroupKinds: Array(count).fill('chi') };
      }) }, 'explicit');
  }, { side, groupCount });
  const area = page.locator(side === 'self' ? '.self-groups-card .group-block-list' : `.player-${side} .group-block-list`);
  await expect(area.locator('.group-block')).toHaveCount(groupCount);
  await expect(page.getByTestId('game-board')).toHaveAttribute('data-geometry-busy', 'false');
  await expect(page.locator('.deal-overlay')).toHaveCount(0);
  return area;
}

for (const mode of ['long', 'large']) test(`twelve eats at every seat are completely visible without scrolling in ${mode} mode`, async ({ page }, info) => {
  await start(page, 'mahjong', mode);
  for (const side of ['self', 'left', 'top', 'right']) {
    const area = await manyMelds(page, side);
    for (const [width, height] of [[640, 350], [667, 375], [390, 844], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      // The viewport debounce is followed by layout/ResizeObserver frames.
      // WebKit on CI can still report pre-resize used sizes after a timer alone.
      await page.waitForTimeout(220);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
      const overview = await area.evaluate(el => {
        const b = el.getBoundingClientRect();
        return { overflow: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
          cards: [...el.querySelectorAll('.mini-card')].map(card => {
            const r = card.getBoundingClientRect();
            return { visible: r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
              font: parseFloat(getComputedStyle(card).fontSize) };
          }) };
      });
      if (overview.overflow || overview.cards.some(card => !card.visible)) {
        console.log('meld overview geometry', JSON.stringify(await area.evaluate(el => ({
          cardStyles: [...el.querySelectorAll<HTMLElement>('.mini-card')].slice(0, 3).map(card => ({ inline: card.getAttribute('style'), scale: getComputedStyle(card).getPropertyValue('--meld-scale'), width: getComputedStyle(card).width, minWidth: getComputedStyle(card).minWidth, minHeight: getComputedStyle(card).minHeight, height: getComputedStyle(card).height, font: getComputedStyle(card).fontSize, animation: getComputedStyle(card).animationName })), inline: el.getAttribute('style'), viewport: [el.clientWidth, el.clientHeight], content: [el.scrollWidth, el.scrollHeight], scale: getComputedStyle(el).getPropertyValue('--meld-scale'),
          groups: [...el.querySelectorAll<HTMLElement>('.group-block')].map(group => [group.offsetLeft, group.offsetTop, group.offsetWidth, group.offsetHeight]),
          tableRows: getComputedStyle(document.querySelector('.table')!).gridTemplateRows,
        }))));
        await page.screenshot({ path: info.outputPath('overview-failure.png') });
      }
      expect(overview.overflow, `${side} ${mode} ${width}x${height} overflow`).toBe(false);
      expect(overview.cards.every(card => card.visible && card.font >= 9.99), `${side} ${mode} ${width}x${height} complete readable overview`).toBe(true);
      if (side === 'left' || side === 'right') {
        const rail = await page.getByTestId(`player-${side}`).evaluate(el => ({
          header: el.querySelector<HTMLElement>('.seat-head')!.offsetHeight,
          cardWidth: el.querySelector<HTMLElement>('.group-block-list')!.clientWidth,
          seatWidth: (el as HTMLElement).clientWidth,
        }));
        expect(rail.header).toBeLessThanOrEqual(20);
        expect(rail.cardWidth / rail.seatWidth).toBeGreaterThan(.9);
      }
      const stable = await page.getByTestId('game-board').evaluate(board => {
        const regions = [...board.querySelectorAll('.player-card, .self-groups-card, .flow-card, .center, .self-command-row, .hand-viewport')];
        const b = board.getBoundingClientRect();
        const overlap = (a: DOMRect, c: DOMRect) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1;
        return regions.every((el, i) => {
          const r = el.getBoundingClientRect();
          return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1
            && regions.slice(i + 1).every(other => !overlap(r, other.getBoundingClientRect()));
        }) && [...board.querySelectorAll('.player-card .seat-identity > strong')].every(el => {
          const r = el.getBoundingClientRect(), seat = el.closest('.player-card')!.getBoundingClientRect();
          return r.top >= seat.top - 1 && r.bottom <= seat.bottom + 1;
        });
      });
      if (!stable) {
        console.log('unstable regions', JSON.stringify(await page.getByTestId('game-board').evaluate(board => ({ board: board.getBoundingClientRect().toJSON(), areas: [...board.querySelectorAll('.player-card, .self-groups-card, .flow-card, .center, .self-command-row, .hand-viewport')].map(el => ({ name: el.className, rect: el.getBoundingClientRect().toJSON() })) }))));
        await page.screenshot({ path: info.outputPath('overlapping-groups.png') });
      }
      expect(stable, `${side} ${mode} ${width}x${height}`).toBe(true);
      if (width === 667 || width === 390) await page.screenshot({ path: info.outputPath(`twelve-eats-${side}-${mode}-${width}x${height}.png`) });
    }
  }
});

test('mahjong overflow keeps every card reachable at a readable minimum size', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await start(page);
  for (const side of ['self', 'left', 'top', 'right']) {
    const area = await manyMelds(page, side, 28);
    await expect.poll(() => area.evaluate(el => el.scrollHeight > el.clientHeight + 1)).toBe(true);
    for (const group of await area.locator('.group-block').all()) {
      await group.evaluate(el => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      const visible = await group.evaluate(el => {
        const b = el.closest('.group-block-list')!.getBoundingClientRect();
        return [...el.querySelectorAll('.mini-card')].every(card => {
          const r = card.getBoundingClientRect();
          return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1
            && parseFloat(getComputedStyle(card).fontSize) >= 9.99;
        });
      });
      expect(visible, `${side} overflow group`).toBe(true);
    }
  }
});

test('touch swipes reach overflowing eats after portrait rotation', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native CDP touch injection; every group is also checked in WebKit.');
  await page.setViewportSize({ width: 375, height: 667 });
  await start(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  for (const side of ['self', 'left', 'top', 'right']) {
    const area = await manyMelds(page, side, 28);
    await area.evaluate(el => { el.scrollLeft = 0; el.scrollTop = 0; });
    const horizontal = await area.evaluate(el => el.scrollWidth > el.clientWidth + 2);
    const r = (await area.boundingBox())!;
    const x = r.x + r.width * .25, y = r.y + r.height * .75;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (horizontal ? 0 : step * 3), y: y - (horizontal ? step * 3 : 0) }] });
      await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => area.evaluate(el => el.scrollLeft + el.scrollTop)).toBeGreaterThan(10);
  }
  await session.detach();
});

for (const mode of ['long', 'large']) test(`mahjong ${mode} keeps shorter hands and declaration marks inside short viewports`, async ({ page }) => {
  await start(page, 'mahjong', mode);
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('staged_declaration'));
  await expect(page.locator('.fish-mark')).toHaveCount(4);
  for (const [width, height] of [[568, 320], [640, 350], [350, 640], [667, 375]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const marksFit = await page.locator('.hand-viewport').evaluate(el => {
      const b = el.getBoundingClientRect();
      return [...el.querySelectorAll('.hand-mark')].every(mark => {
        const r = mark.getBoundingClientRect();
        return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
      });
    });
    expect(marksFit, `${mode} ${width}x${height} declaration marks`).toBe(true);
  }
  for (const [width, height] of [[568, 320], [640, 350], [350, 640], [667, 375]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    for (const count of [21, 14, 5]) {
      await page.evaluate(count => {
        const bridge = (window as any).__siseLocalTest;
        const state = bridge.getRoomState();
        bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 100,
          privateHand: Array.from({ length: count }, (_, index) => ({ id: `hand-fit-${index}`,
            color: ['red', 'yellow', 'green', 'white'][index % 4],
            type: ['jiang', 'shi', 'xiang', 'ju', 'ma', 'pao', 'zu'][Math.floor(index / 4)] })),
          players: state.players.map((p: any) => p.isBot ? p : { ...p, handCount: count }) }, 'explicit');
      }, count);
      await expect(page.locator('.hand-card')).toHaveCount(count);
      await expect.poll(() => page.locator('.hand-viewport').evaluate(el => {
        const b = el.getBoundingClientRect();
        return [...el.querySelectorAll('.hand-card')].every(card => {
          const r = card.getBoundingClientRect();
          return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
        });
      }), { message: `${mode} ${width}x${height}, ${count} cards` }).toBe(true);
    }
  }
});

test('paged hands retain full touch targets beside many eats', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await start(page);
  await manyMelds(page, 'self');
  for (const [width, height] of [[667, 375], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await page.getByTestId('game-settings').click();
    await revealSetting(page, 'hand-layout-paged');
    await page.getByTestId('hand-layout-paged').click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await expect(page.getByTestId('hand-scroll-next')).toBeVisible();
    for (let i = 0; i < 8 && await page.getByTestId('hand-scroll-next').isEnabled(); i++) {
      await page.getByTestId('hand-scroll-next').click();
      await page.waitForTimeout(100);
    }
    await expect(page.getByTestId('hand-scroll-next')).toBeDisabled();
    const hand = await page.locator('.hand').evaluate(el => {
      const last = el.querySelector<HTMLElement>('.hand-card:last-child')!;
      const a = last.getBoundingClientRect(), b = el.getBoundingClientRect();
      return { reachable: a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1,
        targets: [...el.querySelectorAll<HTMLElement>('.hand-card')].every(card => card.offsetWidth >= 28 && card.offsetHeight >= 44) };
    });
    expect(hand).toEqual({ reachable: true, targets: true });
  }
});

for (const mode of ['long', 'large']) test(`color assistance keeps ${mode} meld labels unobscured at every scale`, async ({ page }, info) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await start(page, 'mahjong', mode);
  const toggleAssist = async () => {
    await page.getByTestId('game-settings').click();
    await revealSetting(page, 'card-color-assist');
    await page.getByTestId('card-color-assist').click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  };
  await toggleAssist();
  const assertFaces = async () => {
    await expect.poll(() => page.locator('.group-block-list .mini-card.card').evaluateAll(cards => cards.every(card => {
      const bounds = card.getBoundingClientRect();
      const seal = card.querySelector('.color-seal')!.getBoundingClientRect();
      const inside = (r: DOMRect) => r.left >= bounds.left - .5 && r.right <= bounds.right + .5
        && r.top >= bounds.top - .5 && r.bottom <= bounds.bottom + .5;
      const overlap = (r: DOMRect) => Math.min(r.right, seal.right) - Math.max(r.left, seal.left) > .5
        && Math.min(r.bottom, seal.bottom) - Math.max(r.top, seal.top) > .5;
      return inside(seal) && [...card.querySelectorAll('.text')].every(text => {
        const rect = text.getBoundingClientRect();
        return inside(rect) && !overlap(rect);
      }) && parseFloat(getComputedStyle(card).fontSize) >= 9.99;
    }))).toBe(true);
  };
  await assertFaces();
  await page.screenshot({ path: info.outputPath(`color-assist-${mode}.png`) });
  for (const [width, height] of [[667, 375], [375, 667], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const side of ['self', 'left', 'top', 'right']) {
      const area = await manyMelds(page, side, 28);
      await assertFaces();
      expect(await area.evaluate(area => [...area.querySelectorAll('.group-block')].every(group => {
        group.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const b = area.getBoundingClientRect();
        return [...group.querySelectorAll('.mini-card')].every(card => {
          const r = card.getBoundingClientRect();
          return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
        });
      })), `${side} ${mode} ${width}x${height} all groups reachable`).toBe(true);
    }
  }
  await toggleAssist();
  await expect.poll(() => page.locator('.group-block-list .mini-card.card').first().evaluate(card => parseFloat(card.style.height))).toBeLessThanOrEqual(24);
  await toggleAssist();
  await assertFaces();
});
