import { test, expect, type Page } from '@playwright/test';
import { openGameAs, startLobbyAction, finishDeclarationIfNeeded } from './helpers/game';
async function settle(page: Page) {
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('settlement_hu'));
  await expect(page.getByTestId('settlement-panel')).toHaveAttribute('aria-busy','false');
}
for (const viewport of [{width:568,height:320},{width:375,height:667}]) test(`practice replay rejects old settlement and dedupes double click at ${viewport.width}`, async ({page}) => {
  await page.setViewportSize(viewport);
  const events: string[] = []; let nextRequests = 0;
  page.on('websocket', socket => socket.on('framesent', event => { if (event.payload.toString().includes('next_round')) nextRequests++; }));
  await page.route('**/product-events', route => { events.push(route.request().postDataJSON().name); return route.fulfill({status:202,body:'{}'}); });
  await openGameAs(page,'/?e2eDebug=1','再练牌友');
  await startLobbyAction(page); await finishDeclarationIfNeeded(page); await settle(page);
  const previous = await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const snapshot = {...bridge.getRoomState(), roundResult:bridge.getRoundResult()};
    bridge.applyRoomSnapshot(snapshot); bridge.applyRoomSnapshot(snapshot);
    return snapshot;
  });
  const button = page.getByTestId('next-round-trigger');
  await expect(button).toHaveText('再练一局');
  const box = await button.boundingBox(); expect(box && box.y >= 0 && box.y + box.height <= viewport.height).toBeTruthy();
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(page.getByTestId('settlement-panel')).toHaveCount(0);
  await expect.poll(() => nextRequests).toBe(1);
  await expect.poll(() => events.filter(name => name === 'play_again').length).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getRoomState().stateRevision)).toBeGreaterThan(previous.stateRevision);
  await page.evaluate(snapshot => (window as any).__siseLocalTest.applyRoomSnapshot(snapshot), previous);
  await expect(page.getByTestId('settlement-panel')).toHaveCount(0);
});

for (const hostViewport of [{width:568,height:320},{width:375,height:667}]) test(`friend settlement exposes host replay, guest waiting, invitation and personal exit at ${hostViewport.width}`, async ({browser}) => {
  const hostContext = await browser.newContext({viewport:hostViewport});
  const guestContext = await browser.newContext({viewport:{width:667,height:375}});
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  try {
    await guest.addInitScript(() => Object.defineProperty(navigator,'share',{configurable:true,value:async () => { (window as any).shares = ((window as any).shares ?? 0)+1; throw new DOMException('cancel','AbortError'); }}));
    await openGameAs(host,'/?e2eDebug=1','房主'); await host.getByTestId('mode-friends').click();
    await expect(host.getByTestId('seat-grid')).toBeVisible();
    await openGameAs(guest,host.url(),'牌友'); await guest.getByTestId('claim-seat-1').click();
    await host.getByTestId('fill-bots').click(); await guest.getByTestId('lobby-ready').click();
    await host.getByTestId('lobby-start').click();
    await Promise.all([finishDeclarationIfNeeded(host),finishDeclarationIfNeeded(guest)]);
    await settle(host);
    await expect(host.getByTestId('next-round-trigger')).toHaveText('同桌下一局');
    const primary = await host.getByTestId('next-round-trigger').boundingBox();
    expect(primary && primary.y >= 0 && primary.y + primary.height <= hostViewport.height).toBeTruthy();
    await host.screenshot({path:`/tmp/sise-replay-friends-${hostViewport.width}.png`, animations:'disabled'});
    await expect(guest.getByTestId('settlement-waiting-host')).toBeVisible();
    await expect(guest.getByTestId('next-round-trigger')).toHaveCount(0);
    await guest.getByTestId('settlement-invite').click();
    await expect.poll(() => guest.evaluate(() => (window as any).shares)).toBe(1);
    await expect(guest.getByTestId('settlement-waiting-host')).toBeVisible();
    await guest.getByTestId('settlement-exit').click();
    await guest.getByTestId('confirm-exit').click();
    await expect(guest.getByTestId('mode-friends')).toBeVisible();
    await expect(host.getByTestId('settlement-panel')).toBeVisible();
  } finally { await hostContext.close(); await guestContext.close(); }
});
