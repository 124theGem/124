import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame, applyAction } from "../shared/model.ts";
import { ship, HOME_HQ } from "../shared/catalog.ts";
import { offsetPoint } from "../shared/voxel.ts";
import {
  createAndPlaceDevice,
  placeInventoryItem,
  openSystems,
  gameState,
} from "./outfit-helpers.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
let current;
await mkdir("test-results", { recursive: true });
async function launch(viewport, save) {
  const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 0.5,
      isMobile: viewport.width < 900,
      hasTouch: true,
    }),
    page = await context.newPage();
  current = page;
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((s) => {
    if (!localStorage.getItem("little-planets-v6"))
      localStorage.setItem("little-planets-v6", s);
  }, JSON.stringify(save));
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?debug=1",
  );
  await page.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  return { page, context, errors };
}
try {
  for (const viewport of process.env.OUTFIT_SCOPE
    ? []
    : [
        { width: 844, height: 390 },
        { width: 390, height: 844 },
      ]) {
    const { page, context, errors } = await launch(
      viewport,
      newGame(Date.now(), true),
    );
    assert.equal(await page.locator("#minimap,.minimap").count(), 0);
    const overlap = await page.evaluate(() => {
      const a = document.querySelector("#mine-strike").getBoundingClientRect(),
        b = document.querySelector("#progress-hud").getBoundingClientRect();
      return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
    });
    assert(!overlap, "Mining icon and XP panel must not overlap");
    assert.equal(
      (await page.evaluate(() => window.__planets.snapshot())).sphere.tiles,
      6 * 46 * 46,
    );
    await page.locator("#menu-toggle").click();
    const nav = page.locator("#menu-items"),
      box = await nav.boundingBox();
    if (viewport.width === 844) {
      assert(await nav.evaluate((e) => e.scrollHeight > e.clientHeight));
      const cdp = await context.newCDPSession(page);
      const x = box.x + box.width * 0.55,
        y = box.y + box.height - 25;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let n = 1; n <= 10; n++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y - (n * (box.height - 60)) / 10 }],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForFunction(
        () => document.querySelector("#menu-items").scrollTop > 30,
      );
    } else {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 700);
    }
    await page.locator("#menu-settings").click();
    await page.locator("#sound-volume").waitFor();
    await page.screenshot({
      path: `test-results/outfit-menu-${viewport.width}.png`,
    });
    await page.locator("#close-modal").click();
    await openSystems(page, "automation");
    await page.locator('[data-device-kind="crawler"]').click();
    await page.locator("#create-device").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.inventory["device:crawler"] === 1,
    );
    assert.equal((await gameState(page)).automation.devices.length, 0);
    await page.screenshot({
      path: `test-results/outfit-create-${viewport.width}.png`,
    });
    await page.locator("#open-device-inventory").click();
    assert(await page.locator('[data-item="device:crawler"]').isVisible());
    await placeInventoryItem(page, "device:crawler");
    assert.equal((await gameState(page)).automation.devices[0].kind, "crawler");
    await page.reload();
    await page.waitForFunction(
      () => window.__planets?.snapshot().state.automation.devices.length === 1,
    );
    assert.equal((await gameState(page)).inventory["device:crawler"], 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${viewport.width}: actual menu scroll, no minimap, 46-cell home, create/inventory/place/reload crawler`,
    );
  }
  if (!process.env.OUTFIT_SCOPE || process.env.OUTFIT_SCOPE === "mining") {
    const s = newGame(Date.now(), true);
    s.position = { x: 8, z: 7 };
    const { page, context, errors } = await launch(
      { width: 1100, height: 800 },
      s,
    );
    await page.locator('[data-hand="none"]').click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.hand === "none",
    );
    await openSystems(page, "build");
    await page.locator("#tool-dig").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.hand === "pickaxe",
    );
    const point = await page.evaluate(
      (p) => window.__planets.project(p.x, p.z, 0.02),
      offsetPoint(s.position, 1, 0, "home"),
    );
    await page.mouse.click(point.x, point.y);
    assert(await page.locator("#context").isHidden());
    assert(await page.locator("#mine-strike").isVisible());
    await page.locator("#mine-strike").click();
    await page.waitForFunction(
      () =>
        Object.keys(window.__planets.snapshot().state.worlds.home.terrain)
          .length > 0,
    );
    assert.equal((await gameState(page)).inventory.stone, 76);
    assert(await page.locator("#context").isHidden());
    const strike = await page.locator("#mine-strike").boundingBox();
    await page.mouse.move(
      strike.x + strike.width / 2,
      strike.y + strike.height / 2,
    );
    await page.mouse.down();
    await page.waitForTimeout(1100);
    await page.mouse.up();
    await page.waitForFunction(() => !window.__planets.snapshot().busy);
    const mined = (await gameState(page)).inventory.stone;
    assert(mined > 76, "Holding the strike button repeats actual mining");
    assert.equal(await page.locator("#first-person").count(), 0);
    await page.screenshot({ path: "test-results/outfit-mining.png" });
    await page.reload();
    await page.waitForFunction(
      (n) => window.__planets?.snapshot().state.inventory.stone === n,
      mined,
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS direct strike without context, resource accounting and saved excavation",
    );
  }
  if (!process.env.OUTFIT_SCOPE || process.env.OUTFIT_SCOPE === "ship") {
    let s = newGame(Date.now(), true);
    s = applyAction(s, {
      type: "build",
      kind: "shipyard",
      x: 8,
      z: 7,
      rotation: 0,
    });
    s.position = { x: 8, z: 7 };
    const { page, context, errors } = await launch(
      { width: 1100, height: 800 },
      s,
    );
    let p = await page.evaluate(() => window.__planets.project(8, 7, 1.2));
    await page.mouse.click(p.x, p.y);
    await page.locator("#ship-name").waitFor();
    await page.locator("#ship-class").selectOption("cargo");
    await page.locator("#ship-model").selectOption("3");
    await page.locator("#ship-name").fill("Атлас");
    await page.locator("#create-ship").click();
    await page.waitForFunction(() =>
      window.__planets.snapshot().state.fleet.some((sh) => sh.name === "Атлас"),
    );
    const state = await gameState(page),
      sh = state.fleet.find((sh) => sh.name === "Атлас");
    assert.equal(state.activeShip, "starter");
    assert.equal(state.inventory[`ship:${sh.id}`], 1);
    await page.locator(`[data-ship-inventory="${sh.id}"]`).click();
    assert(
      (await page.locator(".item-detail").textContent()).includes("Атлас"),
    );
    const at = await placeInventoryItem(page, `ship:${sh.id}`);
    await page.reload();
    await page.waitForFunction(
      (id) =>
        window.__planets?.snapshot().state.worlds.home.launchPad?.shipId === id,
      sh.id,
    );
    p = await page.evaluate(
      (at) => window.__planets.project(at.x, at.z, 0.8),
      at,
    );
    await page.mouse.click(p.x, p.y);
    await page.locator("#board-ship").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().space?.cockpit,
    );
    assert.equal((await gameState(page)).flight.pads.home.x, at.x);
    assert.equal((await gameState(page)).inventory[`ship:${sh.id}`], 0);
    await page.reload();
    await page.waitForFunction(
      () => window.__planets?.snapshot().space?.cockpit,
    );
    await page.screenshot({ path: "test-results/outfit-installed-ship.png" });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS real shipyard -> inventory -> custom pad -> cockpit -> persisted flight",
    );
  }
} catch (e) {
  if (current && !current.isClosed()) {
    await current.screenshot({ path: "test-results/outfit-failure.png" });
    console.error(await current.locator("#toast").textContent());
  }
  throw e;
} finally {
  await browser.close();
}
