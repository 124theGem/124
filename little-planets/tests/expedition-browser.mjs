import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { newGame } from "../shared/model.ts";
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
      viewport: { width: 1000, height: 700 },
      deviceScaleFactor: 0.5,
    }),
    page = await context.newPage(),
    save = newGame(Date.now());
  save.discovered.push("wild-1");
  save.planet = "wild-1";
  save.position = { x: 11, z: 13 };
  await page.addInitScript({
    content: `localStorage.setItem('little-planets-v4',${JSON.stringify(JSON.stringify(save))});`,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?debug=1",
  );
  await page.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  await page.locator("#menu-toggle").click();
  await page.locator("#build").click();
  assert(await page.locator("#confirm-build").isEnabled());
  await page.locator("#confirm-build").click();
  await page.waitForFunction(
    () =>
      window.__planets.snapshot().state.worlds["wild-1"].buildings.length ===
        1 && !window.__planets.snapshot().busy,
  );
  const state = await page.evaluate(() => window.__planets.snapshot().state);
  assert.equal(state.worlds["wild-1"].buildings[0].kind, "extractor");
  assert.equal(state.worlds["wild-1"].buildings[0].resource, "crystal");
  await page.screenshot({ path: "test-results/expedition-module.png" });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: seeded expedition renders and accepts resource-matched extraction-module placement.",
  );
} finally {
  await browser.close();
}
