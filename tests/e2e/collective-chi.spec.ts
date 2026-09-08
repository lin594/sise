import { expect, test, type Page } from '@playwright/test';
import { openGameAs, startLobbyAction, finishDeclarationIfNeeded } from './helpers/game';

async function inject(page: Page, scenario: string) {
  await page.evaluate(scenario => (window as any).__siseLocalTest.setupScenario(scenario), scenario);
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getLastResult())).toMatchObject({ scenario, ok: true });
}

for (const outcome of ['pass', 'peng', 'only-chi', 'delayed-hand'] as const) {
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
      await host.getByTestId('action-chi').click();
      if (outcome !== 'only-chi') {
        await expect(host.getByTestId('decision-status')).toContainText('已选择吃，等待其他玩家响应');
        await expect(host.getByTestId('game-board')).toHaveAttribute('data-response-phase', 'collective');
        if (outcome === 'delayed-hand') await host.evaluate(() => (window as any).__siseLocalTest.setPrivateHandReadyOverride(false));
        await guest.getByTestId(`action-${outcome === 'delayed-hand' ? 'pass' : outcome}`).click();
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
      await expect.poll(consumed, { timeout: 15_000 }).toEqual(outcome === 'peng' ? [1, 0, 0] : [1, 1, 1]);
      await expect(host.getByTestId('decision-status').filter({ hasText: '已选择吃，等待其他玩家响应' })).toHaveCount(0);
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
