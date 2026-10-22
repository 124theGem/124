import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame, applyAction } from "../shared/model.ts";
import { SHIP_STATS } from "../shared/ships.ts";
import {
  gameState,
  placeInventoryItem,
  openSystems,
} from "./outfit-helpers.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await mkdir("test-results", { recursive: true });
let current;
async function start(viewport) {
  let save = newGame(Date.now(), true);
  save = applyAction(save, {
    type: "build",
    kind: "shipyard",
    x: 8,
    z: 7,
    rotation: 0,
  });
  save.position = { x: 8, z: 7 };
  const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 0.6,
      isMobile: viewport.width < 900,
      hasTouch: true,
    }),
    page = await context.newPage();
  current = page;
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|program|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  await page.addInitScript((s) => {
    if (!localStorage.getItem("little-planets-v6"))
      localStorage.setItem("little-planets-v6", JSON.stringify(s));
  }, save);
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?debug=1",
  );
  await page.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  return { page, context, errors };
}
async function yard(page) {
  const p = await page.evaluate(() => window.__planets.project(8, 7, 1.2));
  await page.mouse.click(p.x, p.y);
  await page.locator("#ship-stage canvas").waitFor();
  await page.waitForFunction(
    () =>
      Number(document.querySelector("#ship-stage").dataset.triangles) > 1000,
  );
}
try {
  if (!process.env.HORIZON_SCOPE || process.env.HORIZON_SCOPE === "desktop") {
    const { page, context, errors } = await start({
      width: 1440,
      height: 1000,
    });
    const a = await page.evaluate(() => window.__planets.snapshot());
    await page.waitForTimeout(600);
    await page.waitForFunction(
      (t) => window.__planets.snapshot().sphere.wind.time > t,
      a.sphere.wind.time,
    );
    const b = await page.evaluate(() => window.__planets.snapshot());
    console.log(
      "World",
      JSON.stringify({
        wind: b.sphere.wind,
        particles: b.sphere.particles,
        errors,
      }),
    );
    assert(b.sphere.wind.time > a.sphere.wind.time);
    assert(b.sphere.wind.instances > 1000);
    assert.deepEqual(b.sphere.particles.origin, [0, 0, 0]);
    assert(b.sphere.particles.count > 0);
    await yard(page);
    await page.screenshot({ path: "test-results/horizon-yard-initial.png" });
    const stage = page.locator("#ship-stage"),
      box = await stage.boundingBox();
    const camera = await stage.getAttribute("data-camera");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.7, {
      steps: 12,
    });
    await page.mouse.up();
    await page.waitForTimeout(500);
    assert.notEqual(await stage.getAttribute("data-camera"), camera);
    await page.locator("#ship-zoom-in").click();
    for (const [field, value] of Object.entries({
      class: "cargo",
      model: "3",
      hull: "freighter",
      wings: "delta",
      engine: "fusion",
      module: "hold",
      finish: "titanium",
      color: "ivory",
      livery: "helix",
    })) {
      const revision = Number(await stage.getAttribute("data-revision"));
      await page.locator("#ship-" + field).selectOption(value);
      assert(Number(await stage.getAttribute("data-revision")) > revision);
      assert.equal(
        JSON.parse(await stage.getAttribute("data-design"))[field],
        field === "model" ? Number(value) : value,
      );
    }
    await page.locator("#ship-name").fill("Горизонт / Atlas");
    await page.locator("#ship-reset-view").click();
    await page.screenshot({ path: "test-results/horizon-yard-configured.png" });
    await page.locator("#save-ship-design").click();
    await page.waitForFunction(() =>
      window.__planets
        .snapshot()
        .state.shipBlueprints.some(
          (s) => s.name === "Горизонт / Atlas" && s.livery === "helix",
        ),
    );
    await page.locator("#ship-stage canvas").waitFor();
    const before = (await gameState(page)).inventory;
    await page.locator("#create-ship").click();
    await page.waitForFunction(() =>
      window.__planets
        .snapshot()
        .state.fleet.some((s) => s.name === "Горизонт / Atlas"),
    );
    const s = await gameState(page),
      ship = s.fleet.find((s) => s.name === "Горизонт / Atlas");
    assert.equal(ship.engine, "fusion");
    assert.equal(ship.livery, "helix");
    assert.equal(ship.module, "hold");
    assert.equal(ship.finish, "titanium");
    assert.equal(s.inventory.iron, before.iron);
    assert.equal(s.inventory[`ship:${ship.id}`], 1);
    await page.locator(`[data-ship-inventory="${ship.id}"]`).click();
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector("#inventory-ship-preview")?.dataset.triangles,
        ) > 1000,
    );
    assert.equal(
      JSON.parse(
        await page
          .locator("#inventory-ship-preview")
          .getAttribute("data-design"),
      ).engine,
      "fusion",
    );
    const at = await placeInventoryItem(page, `ship:${ship.id}`);
    await page.reload();
    await page.waitForFunction(
      (id) =>
        window.__planets?.snapshot().state.worlds.home.launchPad.shipId === id,
      ship.id,
    );
    assert.equal(
      (await gameState(page)).fleet.find((s) => s.id === ship.id).finish,
      "titanium",
    );
    const p = await page.evaluate(
      (at) => window.__planets.project(at.x, at.z, 0.8),
      at,
    );
    await page.mouse.click(p.x, p.y);
    await page.locator("#board-ship").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().space?.cockpit,
    );
    const flight = await page.evaluate(() => window.__planets.snapshot().space);
    assert.equal(flight.design.engine, "fusion");
    assert.equal(flight.design.livery, "helix");
    assert.equal(flight.cabinDesign.color, "ivory");
    assert.equal(flight.flight.topSpeed, SHIP_STATS(ship).speed);
    await page.screenshot({ path: "test-results/horizon-cockpit.png" });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS 3D orbit/zoom/live parts, stats, free manufacture, inventory preview, saved pad and configured cockpit/flight",
    );
  }
  if (!process.env.HORIZON_SCOPE || process.env.HORIZON_SCOPE === "mobile")
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      const { page, context, errors } = await start(viewport);
      await yard(page);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const overflow = await page
        .locator("#modal-content")
        .evaluate((e) => e.scrollWidth > e.clientWidth + 1);
      assert(!overflow, "No horizontal modal overflow");
      await page.locator("#ship-engine").selectOption("plasma");
      await page.locator("#ship-module").selectOption("shield");
      await page.locator("#ship-finish").selectOption("carbon");
      await page.locator("#ship-livery").selectOption("polar");
      await page.locator("#ship-name").fill("Мобильный");
      await page.locator("#create-ship").scrollIntoViewIfNeeded();
      await page.locator("#create-ship").click();
      await page.waitForFunction(() =>
        window.__planets
          .snapshot()
          .state.fleet.some((s) => s.name === "Мобильный"),
      );
      await page.locator("#ship-stage").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/horizon-mobile-${viewport.width}.png`,
      });
      await page.locator("#close-modal").click();
      assert.equal(await page.locator("canvas.shipyard-canvas").count(), 0);
      await openSystems(page, "menu-settings");
      const q0 = await page.evaluate(() =>
        localStorage.getItem("little-planets-quality"),
      );
      await page.locator("#quality").click();
      const q1 = await page.evaluate(() =>
        localStorage.getItem("little-planets-quality"),
      );
      assert.notEqual(q0, q1);
      await page.reload();
      await page.waitForFunction(
        () => window.__planets?.snapshot().triangles > 1000,
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("little-planets-quality"),
        ),
        q1,
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS ${viewport.width}: responsive shipyard, real crafting and saved graphics quality`,
      );
    }
} catch (e) {
  if (current && !current.isClosed()) {
    await current.screenshot({ path: "test-results/horizon-failure.png" });
    console.error(await current.locator("#toast").textContent());
  }
  throw e;
} finally {
  await browser.close();
}
