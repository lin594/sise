import { test, expect } from '@playwright/test';
import { openGameAs } from './helpers/game';

for (const viewport of [{width:568,height:320},{width:375,height:667}]) test(`invitation prioritizes joining and preserves first nickname and seat recovery at ${viewport.width}`, async ({browser}) => {
  const hostContext = await browser.newContext({viewport});
  const guestContext = await browser.newContext({viewport});
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  try {
    await openGameAs(host,'/','邀请房主'); await host.getByTestId('mode-friends').click();
    await expect(host.getByTestId('seat-grid')).toBeVisible();
    await expect(host.getByTestId('tutorial-entry')).toHaveCount(0);
    await expect(host.locator('.invite-card')).toContainText('不用注册');
    await expect(host.locator('.invite-card')).toContainText('电脑补位');
    await expect(host.locator('.invite-actions .primary')).toHaveCount(1);
    await expect(host.getByTestId('friend-table-settings')).not.toHaveAttribute('open','');
    const invite = await host.locator('.invite-card').boundingBox(); const seats = await host.getByTestId('seat-grid').boundingBox();
    expect(invite && seats && invite.y < seats.y).toBeTruthy();
    await guest.goto(host.url());
    await expect(guest.getByTestId('nickname-input')).toBeVisible();
    const submit = await guest.getByTestId('login-submit').boundingBox();
    expect(submit && submit.y >= 0 && submit.y + submit.height <= viewport.height && submit.height >= 42).toBeTruthy();
    await guest.getByTestId('nickname-input').fill('第一次来');
    await guest.getByTestId('login-submit').click();
    await expect(guest.getByTestId('seat-grid')).toBeVisible();
    await expect(guest.getByTestId('seat-1')).not.toContainText('你');
    await guest.getByTestId('claim-seat-1').click();
    await expect(guest.getByTestId('seat-1')).toContainText('你');
    await expect(host.getByTestId('seat-1')).toContainText('第一次来');
    await guest.reload();
    await expect(guest.getByTestId('seat-1')).toContainText('你');
    await expect(guest.getByTestId('nickname-input')).toHaveCount(0);
    await host.getByTestId('friend-table-settings-toggle').press('Enter');
    await expect(host.getByTestId('scoring-mode-card')).toBeVisible();
  } finally { await hostContext.close(); await guestContext.close(); }
});
