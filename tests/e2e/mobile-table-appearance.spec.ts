import { expect, test, type Page } from '@playwright/test';
import { startLobbyAction } from './helpers/game';
import { revealSetting } from './helpers/settings';

test.use({hasTouch:true, isMobile:true});

const phones = [[568,320],[667,375],[740,360],[812,375],[844,390],[852,393],[896,414],[915,412],[926,428],
  [320,568],[375,667],[390,844],[393,852],[412,915],[428,926]];
const computers = [[1024,768],[1280,720],[1440,900],[1920,1080]];

async function start(page: Page, skin = 'puxian-house', ownCards = 'long', tableLayout = 'classic') {
  await page.addInitScript(prefs => localStorage.setItem('sise_game_display_preferences_v2', JSON.stringify(prefs)),
    {skin, ownCards, tableCards: ownCards, tableLayout, reduceMotion: true});
  await page.goto('/?new=1&e2eDebug=1');
  await startLobbyAction(page);
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('readable_exposed_groups'));
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getLastResult())).toMatchObject({ok:true, scenario:'readable_exposed_groups'});
}

async function crowdedTable(page: Page) {
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    // One physical four-color deck; all IDs and all allocated cards are disjoint.
    const deck = ['red','yellow','green','white'].flatMap(color =>
      ['jiang','shi','xiang','ju','ma','pao','zu'].flatMap(type => Array.from({length:4}, (_,i) => ({id:`density-${color}-${type}-${i}`,color,type}))));
    const take = (n: number) => deck.splice(0,n);
    const hand = take(21);
    const players = state.players.map((p: any) => ({...p, declaredKongs:0, pendingFishGroupSizes:[], fishArea:[],
      handCount:p.isBot ? 0 : hand.length, discardPile:take(15), exposedArea:take(p.isBot ? 3 : 12),
      exposedGroupSizes:p.isBot ? [3] : [3,3,3,3], exposedGroupKinds:p.isBot ? ['chi'] : ['chi','chi','chi','chi']}));
    bridge.applyRoomSnapshot({stateRevision:state.stateRevision+100, privateHand:hand, players}, 'explicit');
  });
  await expect(page.locator('.hand-card')).toHaveCount(21);
  await expect(page.locator('.discard-token')).toHaveCount(60);
  await expect(page.getByTestId('game-board')).toHaveAttribute('data-geometry-busy','false');
}

async function settle(page: Page) {
  // App resolves a changed effective viewport/layout after a 180ms debounce.
  await page.waitForTimeout(220);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

async function assertDensity(page: Page, classic = true) {
  await settle(page);
  const viewport = page.viewportSize()!;
  const rotated = viewport.width < viewport.height && viewport.width <= 500;
  await expect(page.locator('main.layout')).toHaveAttribute('data-rotated-phone-portrait', String(rotated));
  await expect(page.locator('main.layout')).toHaveAttribute('data-effective-viewport', rotated ? `${viewport.height}x${viewport.width}` : `${viewport.width}x${viewport.height}`);
  if (classic) await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout', 'classic');
  const geometry = await page.getByTestId('game-board').evaluate(board => {
    const bounds = board.getBoundingClientRect();
    const contained = (r: DOMRect) => r.left >= bounds.left-1 && r.right <= bounds.right+1 && r.top >= bounds.top-1 && r.bottom <= bounds.bottom+1;
    const areas = [...board.querySelectorAll<HTMLElement>('.flow-card, .self-groups-card, .self-command-row, .hand-viewport')];
    const pending = board.querySelector<HTMLElement>('.response-card-face');
    const overlap = (a:DOMRect,b:DOMRect) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    const responseOverlapsGroups = pending && [...board.querySelectorAll('.self-groups-card .mini-card')].some(card => overlap(pending.getBoundingClientRect(),card.getBoundingClientRect()));
    const hand = board.querySelector<HTMLElement>('.hand')!;
    const cards = [...hand.querySelectorAll<HTMLElement>('.hand-card')];
    const table = board.querySelector<HTMLElement>('.table')!;
    const topLeft = board.querySelector<HTMLElement>('.flow-top-left')!;
    const topRight = board.querySelector<HTMLElement>('.flow-top-right')!;
    const group = board.querySelector<HTMLElement>('.self-groups-card')!;
    return {
      responseOverlapsGroups: Boolean(responseOverlapsGroups),
      seatNamesVisible: [...board.querySelectorAll('.player-card')].every(seat => {
        const area = seat.getBoundingClientRect(), name = seat.querySelector('.seat-identity > strong')!.getBoundingClientRect();
        return name.left >= area.left - 1 && name.right <= area.right + 1 && name.top >= area.top - 1 && name.bottom <= area.bottom + 1;
      }),
      contained: areas.every(el => contained(el.getBoundingClientRect())),
      hitSizes: cards.every(c => c.offsetWidth >= 28 && c.offsetHeight >= 44),
      fonts: cards.every(c => parseFloat(getComputedStyle(c.querySelector('.text')!).fontSize) >= 13.95),
      flowFonts: [...board.querySelectorAll('.discard-token .text')].every(c => parseFloat(getComputedStyle(c).fontSize) >= 9.95),
      topWidth: topLeft.clientWidth / table.clientWidth, groupWidth: group.clientWidth / table.clientWidth,
      topLeftInset: topLeft.offsetLeft, topRightInset: table.clientWidth-topRight.offsetLeft-topRight.offsetWidth,
      railBackground: getComputedStyle(board.querySelector('.self-command-row')!).backgroundColor,
      scrollable: hand.scrollWidth > hand.clientWidth+2,
    };
  });
  expect(geometry.contained, JSON.stringify(geometry)).toBe(true);
  expect(geometry.responseOverlapsGroups).toBe(false);
  expect(geometry.hitSizes).toBe(true);
  expect(geometry.fonts).toBe(true);
  expect(geometry.flowFonts).toBe(true);
  if (classic) {
    expect(geometry.seatNamesVisible, JSON.stringify(geometry)).toBe(true);
    expect(geometry.topWidth).toBeGreaterThan(.35);
    expect(geometry.groupWidth).toBeGreaterThan(.49);
    expect(geometry.topLeftInset).toBeLessThanOrEqual(8);
    expect(geometry.topRightInset).toBeLessThanOrEqual(8);
    expect(geometry.railBackground).toBe('rgba(0, 0, 0, 0)');
  }
  if (geometry.scrollable) {
    // Exercise the real paging controls and reach the last card, including after rotation.
    for (let i=0; i<8 && await page.getByTestId('hand-scroll-next').isEnabled(); i++) { await page.getByTestId('hand-scroll-next').click(); await settle(page); }
    await expect(page.getByTestId('hand-scroll-next')).toBeDisabled();
    await expect.poll(() => page.locator('.hand').evaluate(el => el.scrollWidth-el.clientWidth-el.scrollLeft)).toBeLessThanOrEqual(2);
    for (let i=0; i<8 && await page.getByTestId('hand-scroll-prev').isEnabled(); i++) { await page.getByTestId('hand-scroll-prev').click(); await settle(page); }
  }
  // Focusable overflow surfaces retain access to the oldest and latest flow cards.
  for (const strip of await page.locator('.discard-strip').all()) {
    await strip.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await strip.evaluate(el => el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(2);
    await strip.evaluate(el => { el.scrollTop = 0; });
    expect(await strip.evaluate(el => {
      const first=el.firstElementChild!.getBoundingClientRect(), viewport=el.getBoundingClientRect();
      return first.left>=viewport.left-1 && first.right<=viewport.right+1 && first.top>=viewport.top-1 && first.bottom<=viewport.bottom+1;
    })).toBe(true);
  }
}

for (const mode of ['long','large']) {
  test(`dense classic table remains readable across phones: ${mode}`, async ({page}, info) => {
    test.setTimeout(150_000);
    await start(page, 'puxian-house', mode);
    await crowdedTable(page);
    for (const [width,height] of phones) {
      await page.setViewportSize({width,height});
      await assertDensity(page);
      await page.screenshot({path:info.outputPath(`density-${mode}-${width}x${height}.png`)});
    }
  });
}

test.describe('desktop density', () => {
  test.use({hasTouch:false, isMobile:false});
  for (const mode of ['long','large']) {
    test(`dense classic desktop table: ${mode}`, async ({page}, info) => {
      await start(page, 'puxian-house', mode);
      await crowdedTable(page);
      for (const [width,height] of computers) {
        await page.setViewportSize({width,height});
        await assertDensity(page);
        await page.screenshot({path:info.outputPath(`density-${mode}-${width}x${height}.png`)});
      }
    });
  }
});

test('other skins and layouts preserve dense card access', async ({page}, info) => {
  test.setTimeout(150_000);
  await start(page);
  await crowdedTable(page);
  for (const skin of ['cyber-minimal','licheng-water','meizhou-sea']) {
    for (const layout of ['classic','compact','adaptive']) {
      await page.getByTestId('game-settings').click();
      await revealSetting(page, `skin-${skin}`); await page.getByTestId(`skin-${skin}`).click();
      await revealSetting(page, `layout-${layout}`); await page.getByTestId(`layout-${layout}`).click();
      await page.keyboard.press('Escape');
      for (const [width,height] of [[568,320],[390,844]]) {
        await page.setViewportSize({width,height});
        await assertDensity(page, layout==='classic');
        await page.screenshot({path:info.outputPath(`${skin}-${layout}-${width}.png`)});
      }
    }
  }
});

test('new and invalid settings use Puxian without replacing a saved skin', async ({page}) => {
  await page.goto('/?new=1');
  await expect(page.locator('html')).toHaveAttribute('data-skin','puxian-house');
  for (const [skin,expected] of [['invalid','puxian-house'],['licheng-water','licheng-water']]) {
    await page.evaluate(skin => localStorage.setItem('sise_game_display_preferences_v2', JSON.stringify({skin,tableLayout:'classic'})), skin);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-skin',expected);
    await expect(page.locator('main.layout')).toHaveAttribute('data-table-layout','classic');
  }
});

test('fish and kan badges remain readable above the cards in every skin', async ({page}, info) => {
  await page.setViewportSize({width:568,height:320});
  await start(page);
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('staged_declaration'));
  await expect(page.locator('.fish-mark')).toHaveCount(4);
  for (const skin of ['puxian-house','licheng-water','meizhou-sea','cyber-minimal']) {
    await page.getByTestId('game-settings').click();
    await revealSetting(page, `skin-${skin}`); await page.getByTestId(`skin-${skin}`).click();
    await page.keyboard.press('Escape');
    const failures = await page.locator('.board').evaluate(board => {
      const lum = (color: string) => (color.match(/[\d.]+/g) || []).slice(0,3).map(Number).map(c => c/255)
        .map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((s,c,i) => s+c*[.2126,.7152,.0722][i],0);
      return [...board.querySelectorAll<HTMLElement>('.hand-mark, .kan-count-badge, .group-badge')].flatMap(el => {
        const style = getComputedStyle(el), a=lum(style.color), b=lum(style.backgroundColor);
        const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        const card=el.parentElement?.querySelector<HTMLElement>('.card');
        return ratio<4.5 || style.backgroundColor === 'rgba(0, 0, 0, 0)' || el.classList.contains('hand-mark') && card && el.offsetTop+el.offsetHeight>card.offsetTop
          ? [`${el.textContent}: ${ratio}`] : [];
      });
    });
    expect(failures).toEqual([]);
    await expect(page.getByTestId('game-board')).toHaveAttribute('data-geometry-busy','false');
    await page.screenshot({path:info.outputPath(`declaration-${skin}.png`)});
  }
  await page.getByTestId('confirm-declaration').click();
  await expect(page.locator('.kan-mark')).toHaveCount(3);
  await expect(page.locator('.kan-mark').first()).toHaveCSS('color','rgb(255, 255, 255)');
  await page.screenshot({path:info.outputPath('declaration-kan.png')});
});

test('touch swipes follow overflowing hands and flows after portrait rotation', async ({page,browserName}) => {
  test.skip(browserName !== 'chromium', 'CDP touch injection; shared overflow and paging are also tested in WebKit');
  await page.setViewportSize({width:320,height:568});
  await start(page, 'puxian-house', 'large');
  await crowdedTable(page);
  await settle(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', {enabled:true});
  await expect(page.locator('main.layout')).toHaveAttribute('data-rotated-phone-portrait','true');
  await expect(page.getByTestId('game-board')).toHaveClass(/rotated-scroll/);
  expect(await page.locator('.hand').evaluate(el => el.scrollWidth-el.clientWidth)).toBeGreaterThan(40);

  const rect=await page.locator('.hand').boundingBox();
  expect(rect).not.toBeNull();
  const x=rect!.x+rect!.width/2, startY=rect!.y+rect!.height*.8, endY=rect!.y+rect!.height*.2;
  await session.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y:startY}]});
  for(let step=1;step<=10;step++) {
    await session.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:startY+(endY-startY)*step/10}]});
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await expect.poll(() => page.locator('.hand').evaluate(el => el.scrollLeft)).toBeGreaterThan(20);
  const flow = page.locator('.discard-strip').first();
  expect(await flow.evaluate(el => el.scrollHeight-el.clientHeight)).toBeGreaterThan(10);
  const flowRect=(await flow.boundingBox())!;
  const flowY=flowRect.y+flowRect.height/2, flowX=flowRect.x+flowRect.width*.2;
  await session.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:flowX,y:flowY}]});
  for(let step=1;step<=10;step++) {
    await session.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:flowX+step*4,y:flowY}]});
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await expect.poll(() => flow.evaluate(el => el.scrollTop)).toBeGreaterThan(10);
  await session.detach();
});

test('long flows follow new cards without pulling a reader away from older cards', async ({page}) => {
  await page.setViewportSize({width:568,height:320});
  await start(page);
  await crowdedTable(page);
  await settle(page);
  const strip=page.locator('.discard-strip').first();
  const firstId=await strip.locator('.discard-token').first().getAttribute('data-face-id');
  const append = async (index:number) => page.evaluate(({firstId,index}) => {
    const bridge=(window as any).__siseLocalTest, state=bridge.getRoomState();
    bridge.applyRoomSnapshot({stateRevision:state.stateRevision+1, players:state.players.map((p:any) =>
      p.discardPile.some((c:any) => c.id===firstId) ? {...p,discardPile:[...p.discardPile,{id:`density-white-zu-${index}`,color:'white',type:'zu'}]} : p)}, 'explicit');
  }, {firstId,index});
  expect(await strip.evaluate(el => el.scrollHeight-el.clientHeight)).toBeGreaterThan(10);
  await strip.evaluate(el => {el.scrollTop=el.scrollHeight;});
  await settle(page);
  await append(0);
  await settle(page);
  expect(await strip.evaluate(el => el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(2);
  await strip.evaluate(el => {el.scrollTop=0;});
  await settle(page);
  await append(1);
  await settle(page);
  expect(await strip.evaluate(el => el.scrollTop)).toBe(0);
  await expect(strip.locator('.discard-token')).toHaveCount(17);
});


test('header tools retain icons and collapse labels only on very small screens', async ({page}, info) => {
  await start(page);
  for (const [width,height] of [[568,320],[320,568],[844,390],[1440,900]]) {
    await page.setViewportSize({width,height});
    await settle(page);
    const tiny = await page.locator('main.layout').evaluate(el => el.classList.contains('ultra-compact-viewport'));
    for (const id of ['game-history','tools-rules','game-interaction','game-settings','game-auto-play']) {
      const button=page.getByTestId(id);
      await expect(button.locator('svg')).toBeVisible();
      await expect(button).toHaveAccessibleName(/.+/);
      if (tiny) await expect(button.locator('.tool-label')).toBeHidden();
      else await expect(button.locator('.tool-label')).toBeVisible();
      await expect(button).toBeInViewport({ratio:1});
    }
    await page.screenshot({path:info.outputPath(`header-tools-${width}x${height}.png`)});
  }
  await page.setViewportSize({width:568,height:320});
  await settle(page);
  await page.getByTestId('game-history').click();
  await expect(page.getByTestId('history-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('game-interaction').click();
  await expect(page.getByTestId('quick-phrase-panel')).toBeVisible();
});
