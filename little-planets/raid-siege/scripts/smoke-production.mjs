import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Start `npm run preview -- --port 5174` after building, then run this file.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:5174');
  await page.waitForSelector('[data-action="start"]', { timeout: 90000 });
  assert.equal(await page.evaluate(() => typeof window.__raid), 'undefined');
  assert.equal(await page.locator('[data-mode]').count(), 3);
  await page.locator('[data-action="start"]').click();
  await page.waitForSelector('.battle-hud', { timeout: 60000 });
  assert.equal(await page.locator('.dev-hotspot').count(), 0);
  await page.keyboard.press('F10');
  assert.equal(await page.locator('.debug-menu').count(), 0);
  await page.locator('[data-skill="2"]').click();
  await page.waitForSelector('[data-skill="2"].on-cooldown', { timeout: 15000 });
  await page.locator('[data-action="pause"]').click();
  await page.waitForSelector('[data-action="resume"]');
  assert.deepEqual(errors, []);
  console.log(
    'Production smoke passed: models, battle, ability cooldown, pause, no dev tools or page errors.',
  );
} finally {
  await browser.close();
}
