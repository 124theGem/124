import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame } from "../shared/model.ts";
import { surfaceDistance } from "../shared/sphere.ts";
import { ship } from "../shared/catalog.ts";
import { offsetPoint, sanctuaryPoint } from "../shared/voxel.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const base = process.env.GAME_URL || "http://127.0.0.1:5174";
let active;
await mkdir("test-results", { recursive: true });
try {
  for (const viewport of [
    { width: 1100, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 0.5,
        isMobile: viewport.width === 390,
        hasTouch: viewport.width === 390,
      }),
      page = await context.newPage();
    active = page;
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /shader|WebGL|GL_INVALID/.test(m.text()))
        errors.push(m.text());
    });
    const fixture = newGame(Date.now());
    fixture.planet = "orbis";
    fixture.position = offsetPoint(ship("orbis"), -4.8, -1.5, "orbis");
    await page.addInitScript({
      content: `if(!localStorage.getItem('little-planets-v4'))localStorage.setItem('little-planets-v4',${JSON.stringify(JSON.stringify(fixture))});`,
    });
    await page.goto(`${base}/?debug=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(
      () => window.__planets?.snapshot().art?.frameCalls > 0,
    );
    const snap = () => page.evaluate(() => window.__planets.snapshot()),
      s = await snap();
    assert(s.art.ao);
    assert(s.art.frameCalls > s.art.drawCalls);
    assert(s.sphere.terrain.walls > 3000);
    assert(s.sphere.terrain.maxHeight - s.sphere.terrain.minHeight > 4);
    assert(s.sphere.vegetation.trees > 80);
    assert(s.sphere.vegetation.bushes > 250);
    assert(s.sphere.vegetation.stalks > 650);
    assert(
      Math.abs(
        Math.hypot(...s.playerWorld) -
          (s.sphere.radius + s.sphere.groundHeight + 0.06),
      ) < 0.001,
    );
    await page.screenshot({
      path: `test-results/sanctuary-reference-${viewport.width}x${viewport.height}.png`,
    });
    if (viewport.width === 1100) {
      await page.keyboard.down("w");
      let low = Infinity,
        high = -Infinity;
      let moved = 0;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline && (high - low < 1 || moved < 4)) {
        await page.waitForTimeout(250);
        const p = await snap();
        moved = surfaceDistance(fixture.position, p.position, "orbis");
        low = Math.min(low, p.sphere.groundHeight);
        high = Math.max(high, p.sphere.groundHeight);
        assert(
          Math.abs(
            Math.hypot(...p.playerWorld) -
              (p.sphere.radius + p.sphere.groundHeight + 0.06),
          ) < 0.001,
        );
      }
      await page.keyboard.up("w");
      assert(
        high - low >= 1 && moved >= 4,
        `Only ${high - low} height variation`,
      );
      await page.locator("#settings").click();
      await page.locator("#quality").click();
      await page.waitForFunction(() => !window.__planets.snapshot().art.ao);
      await page.locator("#quality").click();
      await page.waitForFunction(() => window.__planets.snapshot().art.ao);
      await page.locator("#close-modal").click();
      await page.locator("#view").click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: "test-results/sanctuary-overview.png" });
      await page.reload();
      await page.waitForFunction(() => window.__planets?.snapshot().art?.ao);
      assert.equal((await snap()).state.version, 4);
    }
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await context.close();
    console.log(
      `PASS: ${viewport.width}×${viewport.height} terrain, forest, stone diorama, SSAO/grade, grounded feet and viewport bounds.`,
    );
  }
} catch (e) {
  console.error("SANCTUARY FAILURE", e);
  if (active && !active.isClosed()) {
    console.log(
      "FAIL",
      await active.evaluate(() => {
        const s = window.__planets?.snapshot();
        return s
          ? { position: s.position, sphere: s.sphere, art: s.art }
          : null;
      }),
    );
    await active.screenshot({ path: "test-results/sanctuary-failure.png" });
  }
  throw e;
} finally {
  await browser.close();
}
