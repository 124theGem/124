import { expect, test } from '@playwright/test';
declare global {
  interface Window {
    __raid: {
      state: any;
      profile: any;
      simulation: any;
      metrics: any;
      renderer: any;
      debug(action: string): void;
    };
  }
}
test('desktop: rendered world, hero choice, real combat, rewards and persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await expect(page).toHaveTitle(/RAID & SIEGE/);
  expect(
    await page.evaluate(() => window.__raid.renderer.scene.getActiveMeshes().length),
  ).toBeGreaterThan(20);
  await page.locator('.topnav [data-action="heroes"]').click();
  await expect(page.locator('[data-class]')).toHaveCount(15);
  await page.locator('[data-class="firemage"]').click();
  await page.locator('[data-select-class="firemage"]').click();
  await expect(page.locator('.current-hero')).toContainText('Огненный маг');
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.battle-hud')).toBeVisible();
  const startZ = await page.evaluate(() => window.__raid.state.entities[0].position.z);
  await page.keyboard.down('KeyW');
  await expect
    .poll(() => page.evaluate(() => window.__raid.state.entities[0].position.z), { timeout: 20000 })
    .toBeGreaterThan(startZ + 0.5);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    const s = window.__raid.state,
      p = s.entities[0],
      enemy = s.entities.find((e: any) => e.team === 'PVE');
    enemy.position = { x: p.position.x, z: p.position.z + 4 };
    p.resource = 100;
  });
  await page.keyboard.press('Digit1');
  await expect
    .poll(() => page.evaluate(() => window.__raid.state.entities[0].stats.damage), {
      timeout: 20000,
    })
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText('История подождёт')).toBeVisible();
  const time = await page.evaluate(() => window.__raid.state.time);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__raid.state.time)).toBe(time);
  await page.locator('[data-action="resume"]').click();
  await page.evaluate(() => window.__raid.debug('victory'));
  await expect(page.locator('.results-panel h2')).toHaveText('Победа');
  const gold = await page.evaluate(() => window.__raid.profile.gold);
  expect(gold).toBe(630);
  await page.locator('.result-actions [data-action="home"]').click();
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  expect(await page.evaluate(() => window.__raid.profile.gold)).toBe(gold);
  expect(await page.evaluate(() => window.__raid.profile.selectedClass)).toBe('firemage');
  expect(errors).toEqual([]);
});
test('touch landscape: simultaneous joystick and held attack, skills, release and safe bounds', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.battle-hud')).toBeVisible();
  for (const selector of ['.joystick', '[data-skill="3"]', '[data-attack]', '[data-dodge]']) {
    const r = await page.locator(selector).boundingBox();
    expect(r!.x).toBeGreaterThanOrEqual(0);
    expect(r!.y).toBeGreaterThanOrEqual(0);
    expect(r!.x + r!.width).toBeLessThanOrEqual(844);
    expect(r!.y + r!.height).toBeLessThanOrEqual(390);
  }
  const joystick = (await page.locator('.joystick').boundingBox())!,
    attack = (await page.locator('[data-attack]').boundingBox())!,
    x = joystick.x + joystick.width / 2,
    y = joystick.y + joystick.height / 2,
    ax = attack.x + attack.width / 2,
    ay = attack.y + attack.height / 2;
  const session = await context.newCDPSession(page);
  const start = await page.evaluate(() => window.__raid.state.entities[0].position.z);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x, y, id: 1 },
      { x: ax, y: ay, id: 2 },
    ],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x, y: y - 35, id: 1 },
      { x: ax, y: ay, id: 2 },
    ],
  });
  await expect
    .poll(() => page.evaluate(() => window.__raid.state.entities[0].position.z), { timeout: 20000 })
    .toBeGreaterThan(start + 0.2);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('[data-skill="2"]').tap();
  await expect
    .poll(() => page.evaluate(() => window.__raid.state.entities[0].cooldowns[2]), {
      timeout: 10000,
    })
    .toBeGreaterThan(0);
  await page.locator('[data-dodge]').tap();
  await expect
    .poll(() => page.evaluate(() => window.__raid.state.entities[0].dodgeCooldown), {
      timeout: 10000,
    })
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await context.close();
});
test('portrait menus expose every mode, items equip, settings save, no overflow', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await expect(page.locator('[data-mode]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('.party-member.local').tap();
  await expect(page.locator('[data-class]')).toHaveCount(15);
  await page.locator('[data-class="priest"]').tap();
  await page.locator('[data-select-class="priest"]').tap();
  await expect(page.locator('.party-member.local')).toContainText('Жрец');
  await page.locator('.topnav [data-action="inventory"]').tap();
  await expect(page.locator('.item-card')).toHaveCount(6);
  await page.locator('.item-card').first().tap();
  await expect(page.locator('[data-equip]')).toHaveText(/Уже экипировано/);
  await page.locator('.brand').tap();
  await page.locator('.account [data-action="settings"]').tap();
  await page.locator('[data-setting="quality"]').selectOption('low');
  await page.locator('[data-setting="sound"]').tap();
  await expect(page.locator('[data-setting="sound"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-action="close-modal"]').tap();
  await page.reload();
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  expect(await page.evaluate(() => window.__raid.profile.settings.quality)).toBe('low');
  await context.close();
});
