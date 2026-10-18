import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame, worldEvent } from "../shared/model.ts";
import { SPHERE_PLANETS, ship, planetSize } from "../shared/catalog.ts";
import { completeFlight } from "./flight-browser.mjs";
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
await mkdir("test-results", { recursive: true });
let active;
try {
  const errors = [];
  for (const id of SPHERE_PLANETS) {
    const context = await browser.newContext({
        viewport: { width: 1100, height: 760 },
        deviceScaleFactor: 0.5,
      }),
      page = await context.newPage();
    active = page;
    page.setDefaultTimeout(90000);
    page.on("pageerror", (e) => errors.push(e.message));
    const save = newGame(Date.now()),
      pad = ship(id);
    save.planet = id;
    save.position = { x: pad.x - 2, z: pad.z };
    for (let offset = 0; offset < 240000; offset += 10000) {
      save.worlds[id].eventEpoch = Date.now() - offset;
      if (!worldEvent(save, id, Date.now())) break;
    }
    await page.addInitScript({
      content: `if(!localStorage.getItem('little-planets-v4'))localStorage.setItem('little-planets-v4',${JSON.stringify(JSON.stringify(save))});`,
    });
    await page.goto(`${base}/?debug=1`);
    await page.waitForFunction(
      () => window.__planets?.snapshot().sphere?.tiles > 4000,
    );
    await page.waitForTimeout(900);
    const snap = () => page.evaluate(() => window.__planets.snapshot()),
      s = await snap();
    assert.equal(s.sphere.id, id);
    assert.equal(s.sky.stars, 2400);
    assert.equal(s.sky.planets, 7);
    assert(s.drawCalls < 180, `${id}: ${s.drawCalls} draw calls`);
    assert(s.sphere.vegetation.bushes === 72);
    assert.equal(s.state.planet, id);
    await page.screenshot({ path: `test-results/odyssey-${id}-surface.png` });
    await page.locator("#view").click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/odyssey-${id}-overview.png` });
    await page.locator("#view").click();
    if (id === "orbis") {
      await page.keyboard.down("w");
      await page.waitForFunction(
        () => window.__planets.snapshot().position.z < 28.5,
      );
      await page.keyboard.up("w");
      const moved = await snap();
      assert(moved.playerUp.some((v, i) => Math.abs(v - s.playerUp[i]) > 0.05));
      await page.locator("#menu-toggle").click();
      await page.locator("#galaxy").click();
      await page.locator('[data-planet="verdia"]').waitFor();
      assert.equal(await page.locator("[data-planet]").count(), 14);
      await page.locator('[data-planet="verdia"]').click();
      await page.locator("#space-hud:not(.hidden)").waitFor();
      const before = await snap();
      assert.equal(before.state.planet, "orbis");
      assert(!before.space.flight.autopilot);
      assert(await page.locator("#space-land").isDisabled());
      await page.keyboard.down("w");
      await page.keyboard.down("d");
      await page.keyboard.down("e");
      await page.waitForFunction(
        () => window.__planets.snapshot().space.flight.distance > 10,
      );
      await page.keyboard.up("w");
      await page.keyboard.up("d");
      await page.keyboard.up("e");
      const speed = (await snap()).space.landing.speed;
      await page.keyboard.down("Space");
      await page.waitForFunction(
        (v) => window.__planets.snapshot().space.landing.speed < v * 0.15,
        speed,
      );
      await page.keyboard.up("Space");
      await page.screenshot({ path: "test-results/odyssey-manual-space.png" });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(500);
      const layout = await page.evaluate(() => {
        const selectors = [
            ".space-hud>header",
            ".flight-actions",
            ".flight-thrust",
            "#joystick",
          ],
          r = selectors.map((s) =>
            document.querySelector(s).getBoundingClientRect(),
          );
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          bounds: r.every(
            (a) =>
              a.x >= 0 &&
              a.y >= 0 &&
              a.right <= innerWidth &&
              a.bottom <= innerHeight,
          ),
          overlap: r.some((a, i) =>
            r
              .slice(i + 1)
              .some(
                (b) =>
                  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
                  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
              ),
          ),
        };
      });
      assert.deepEqual(layout, {
        overflow: false,
        bounds: true,
        overlap: false,
      });
      await page.screenshot({
        path: "test-results/odyssey-flight-landscape.png",
      });
      await page.setViewportSize({ width: 1100, height: 760 });
      // Course picker stays closable and permits selecting the origin while airborne.
      await page.locator("#space-course").click();
      assert(await page.locator('[data-planet="orbis"]').isEnabled());
      await page.locator('[data-planet="verdia"]').click();
      await page.reload();
      await page.locator("#space-hud:not(.hidden)").waitFor();
      assert.equal((await snap()).state.planet, "orbis");
      await completeFlight(page, "verdia");
      await page.screenshot({ path: "test-results/odyssey-verdia-landed.png" });
      assert.equal((await snap()).sphere.id, "verdia");
      await page.reload();
      await page.waitForFunction(
        () => window.__planets?.snapshot().state.planet === "verdia",
      );
      assert.equal((await snap()).state.flight, null);
      await page.locator("#menu-toggle").click();
      await page.locator("#galaxy").click();
      await page.locator('[data-planet="home"]').click();
      await completeFlight(page, "home");
      assert((await snap()).playerUp[1] > 0.999);
      console.log(
        "PASS: manual thrust/yaw/pitch/braking, landscape cockpit, course picker, two continuous flights, slow approach, real landing and reload.",
      );
    }

    await context.close();
    console.log(
      `PASS: ${id}, circumference ${planetSize(id)}, tiled surface, rich vegetation and space sky.`,
    );
  }
  assert.deepEqual(errors, []);
} catch (e) {
  if (active && !active.isClosed()) {
    console.log(
      "FAIL STATE",
      JSON.stringify(
        await active.evaluate(() => {
          const s = window.__planets?.snapshot();
          return s
            ? {
                planet: s.state.planet,
                position: s.position,
                busy: s.busy,
                space: s.space,
              }
            : null;
        }),
      ),
    );
    await active.screenshot({ path: "test-results/odyssey-failure.png" });
  }
  throw e;
} finally {
  await browser.close();
}
