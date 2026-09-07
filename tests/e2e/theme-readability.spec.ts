import { expect, test, type Locator } from '@playwright/test';
import { revealSetting } from './helpers/settings';

async function readableText(panel: Locator) {
  const failures = await panel.evaluate(root => {
    const rgba = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
    const over = (fg: number[], bg: number[]) => fg.slice(0,3).map((c,i) => c*(fg[3] ?? 1)+bg[i]*(1-(fg[3] ?? 1)));
    const bg = (el: Element | null): number[] => el ? over(rgba(getComputedStyle(el).backgroundColor), bg(el.parentElement)) : [255,255,255];
    const lum = (rgb: number[]) => rgb.slice(0,3).map(c => c/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((s,c,i) => s+c*[.2126,.7152,.0722][i],0);
    const result: string[] = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest('.card, .mode-sample, .skin-preview, .layout-preview, [aria-hidden="true"], :disabled')) continue;
      const text = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent?.trim()).join('').trim();
      const r = el.getBoundingClientRect();
      if (!text || r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight) continue;
      const style = getComputedStyle(el);
      if (style.visibility !== 'visible' || style.display === 'none') continue;
      const back = bg(el), front = over(rgba(style.color), back);
      const a=lum(front), b=lum(back), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const large = parseFloat(style.fontSize)>=24 || parseFloat(style.fontSize)>=18.66 && Number(style.fontWeight)>=700;
      if (ratio < (large ? 3 : 4.5)-.05) result.push(`${text.slice(0,24)}: ${ratio.toFixed(2)} (${style.color})`);
    }
    return result;
  });
  expect(failures).toEqual([]);
}

for (const scheme of ['dark','light'] as const) {
  test(`all settings and rules are readable with system ${scheme} colors`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({width:1024,height:768});
    await page.goto('/?new=1');
    for (const skin of ['cyber-minimal','licheng-water','puxian-house','meizhou-sea']) {
      await page.getByTestId('game-settings').click();
      await revealSetting(page, `skin-${skin}`);
      await page.getByTestId(`skin-${skin}`).click();
      await readableText(page.getByTestId('settings-panel'));
      await page.getByTestId('settings-back').click();
      for (const category of ['table','sound','assist']) {
        await page.getByTestId(`settings-category-${category}`).click();
        await readableText(page.getByTestId('settings-panel'));
        await page.getByTestId('settings-back').click();
      }
      await page.getByTestId('settings-rules').click();
      const rules = page.getByRole('dialog', { name: /规则/ });
      await expect(rules).toBeVisible();
      await readableText(rules);
      await page.screenshot({path:info.outputPath(`${skin}-${scheme}-rules.png`)});
      await page.keyboard.press('Escape');
      // Returning from rules restores the settings page.
      if (await page.getByTestId('settings-panel').isVisible()) await page.getByRole('button',{name:'关闭设置',exact:true}).click();
    }
  });
}
