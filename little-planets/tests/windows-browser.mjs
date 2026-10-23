import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../shared/model.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 0.5,
      isMobile: true,
      hasTouch: true,
    }),
    page = await context.newPage();
  page.setDefaultTimeout(60000);
  let save = newGame(Date.now());
  save.position = { x: 13, z: 18 };
  save = applyAction(save, { type: "enter", id: "home-hq" }, Date.now());
  save.inventory["furniture:chair"] = 1;
  await page.addInitScript({
    content: `localStorage.setItem('little-planets-v4',${JSON.stringify(JSON.stringify(save))});`,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?mode=colony&debug=1",
  );
  await page.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.locator("#menu-toggle").click();
    await page.locator("#build").click();
    await page
      .locator("#build-panel")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    const fits = await page.locator("#close-placement").evaluate((el) => {
      const b = el.getBoundingClientRect();
      return (
        b.x >= 0 &&
        b.y >= 0 &&
        b.right <= innerWidth &&
        b.bottom <= innerHeight &&
        el.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        )
      );
    });
    assert(
      fits,
      "Furniture close button must remain reachable after scrolling",
    );
    await page.locator("#close-placement").click();
    assert(await page.locator("#build-panel").isHidden());
    assert.equal(
      await page.evaluate(() => window.__planets.snapshot().mode),
      "explore",
    );
    await page.locator("#menu-toggle").click();
    await page.locator("#craft").click();
    await page
      .locator("#modal-content")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    assert(await page.locator("#close-modal").isVisible());
    await page.screenshot({
      path: `test-results/windows-${size.width}x${size.height}.png`,
    });
    await page.locator("#close-modal").click();
    assert(await page.locator("#modal").isHidden());
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: portrait/landscape furniture panel and long crafting catalog remain closable after scrolling.",
  );
} finally {
  await browser.close();
}
