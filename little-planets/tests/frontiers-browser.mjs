import { completeFlight } from "./flight-browser.mjs";
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
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 0.5,
  });
  page = await context.newPage();
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fixture = newGame(Date.now());
  fixture.position = { x: 21, z: 23 };
  const sphereOnly = process.env.FRONTIERS_CASE === "sphere";
  if (sphereOnly) {
    fixture.planet = "orbis";
    fixture.position = { x: 28, z: 30 };
    fixture.worlds.orbis.eventEpoch = Date.now() - 130000;
    fixture.inventory["gear:sword"] = 1;
    fixture.equipment.weapon = "sword";
  }
  await page.addInitScript({
    content: `if(!localStorage.getItem('little-planets-v4'))localStorage.setItem('little-planets-v4',${JSON.stringify(JSON.stringify(fixture))});`,
  });
  const snap = () => page.evaluate(() => window.__planets.snapshot()),
    wait = (fn) => page.waitForFunction(fn, {}, { timeout: 90000 }),
    menu = async (id) => {
      if (await page.locator(`#${id}`).isHidden())
        await page.locator("#menu-toggle").click();
      await page.locator(`#${id}`).click();
    };
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?mode=colony&debug=1",
  );
  await wait(() => window.__planets?.snapshot().triangles > 1000);
  assert(await page.locator("#menu-items").isHidden());
  assert.equal(await page.locator("#resource-strip").count(), 0);
  const minimap = await page.locator(".minimap").evaluate((el) => {
    const s = getComputedStyle(el),
      b = el.getBoundingClientRect();
    return {
      border: s.borderTopWidth,
      background: s.backgroundColor,
      x: b.x,
      y: b.y,
    };
  });
  assert.equal(minimap.border, "0px");
  assert.equal(minimap.background, "rgba(0, 0, 0, 0)");
  assert(minimap.y < 20 && minimap.x > 900);
  if (!sphereOnly) {
    await menu("craft");
    assert((await page.locator(".recipe-illustration polygon").count()) > 500);
    for (const kind of ["sword", "guardian"]) {
      await page.locator(`[data-recipe="gear:${kind}"]`).click();
      await page.locator("#craft-one").click();
      await page.waitForFunction(
        (k) => window.__planets.snapshot().state.inventory[`gear:${k}`] === 1,
        kind,
      );
    }
    await page.screenshot({ path: "test-results/frontiers-crafting.png" });
    await page.locator("#close-modal").click();
    await menu("inventory");
    for (const kind of ["sword", "guardian"]) {
      await page.locator(`[data-item="gear:${kind}"]`).click();
      await page.locator("#equip-item").click();
      await page.waitForFunction(
        (k) =>
          Object.values(window.__planets.snapshot().state.equipment).includes(
            k,
          ) && !window.__planets.snapshot().busy,
        kind,
      );
    }
    await page.screenshot({ path: "test-results/frontiers-equipment.png" });
    await page.locator("#close-modal").click();
    await menu("build");
    await page.locator("#close-placement").click();
    assert(await page.locator("#build-panel").isHidden());
    assert.equal((await snap()).mode, "explore");
    await wait(
      () =>
        window.__planets.snapshot().audio.notes > 0 &&
        window.__planets.snapshot().audio.state === "running",
    );
    assert((await snap()).audio.effectsPlayed > 0);
    await page.locator("#settings").click();
    await page.locator("#music-enabled").uncheck();
    await wait(() => !window.__planets.snapshot().audio.music);
    await page.locator("#music-enabled").check();
    await page.locator("#close-modal").click();
    console.log(
      "PASS: quiet HUD, expanding menu, illustrated recipes, crafted/equipped gear, close placement and real WebAudio scheduling/settings.",
    );
    await menu("galaxy");
    await page.locator("#scan-planets").click();
    await wait(
      () =>
        window.__planets.snapshot().state.discovered.length === 15 &&
        !window.__planets.snapshot().busy,
    );
    const found = (await snap()).state.lastDiscovery;
    assert(found.startsWith("wild-"));
    const name = await page
      .locator(`[data-planet="${found}"] strong`)
      .textContent();
    await page.locator("#planet-search").fill(name);
    assert.equal(await page.locator("[data-planet]").count(), 1);
    await page.locator("#planet-search").fill("");
    await page.screenshot({ path: "test-results/frontiers-scanner.png" });
    await page.locator('[data-planet="ferra"]').click();
    await completeFlight(page, "ferra");
    await wait(
      () =>
        window.__planets.snapshot().state.planet === "ferra" &&
        !window.__planets.snapshot().busy,
    );
    let kills = (await snap()).state.kills;
    await page.locator("#attack").click();
    for (let i = 0; i < 12 && (await snap()).state.kills === kills; i++) {
      if (await page.locator("#context-action").isVisible())
        await page.locator("#context-action").click();
      else await page.locator("#attack").click();
      await page.waitForTimeout(750);
      await wait(() => !window.__planets.snapshot().busy);
    }
    assert((await snap()).state.kills > kills);
    assert((await snap()).state.inventory.crystal >= 22);
    assert((await snap()).state.health < 100);
    await page.screenshot({ path: "test-results/frontiers-combat.png" });
    console.log(
      "PASS: random discovery, name search, real hostile-world travel, enemy damage, armor, attacks, kill and loot.",
    );
    await menu("galaxy");
    await page.locator('[data-planet="orbis"]').click();
    await completeFlight(page, "orbis");
    await wait(
      () =>
        window.__planets.snapshot().state.planet === "orbis" &&
        !window.__planets.snapshot().busy,
    );
  }
  assert((await snap()).drawCalls < 180);
  await page.screenshot({ path: "test-results/orbis-surface.png" });
  const start = (await snap()).playerUp;
  let distance = 0,
    previous = start,
    maxY = -1,
    minY = 1;
  await page.keyboard.down("w");
  // Full-quality contact/shadow passes are slow under CPU-only SwiftShader.
  // Keep the complete 120 m route and grounding assertions; allow rendering time.
  const deadline = Date.now() + 360000;
  while (distance < 120 && Date.now() < deadline) {
    await page.waitForTimeout(250);
    const s = await snap(),
      n = s.playerUp;
    const dot = Math.min(
      1,
      Math.max(
        -1,
        n[0] * previous[0] + n[1] * previous[1] + n[2] * previous[2],
      ),
    );
    distance += (Math.acos(dot) * 120) / (2 * Math.PI);
    previous = n;
    maxY = Math.max(maxY, n[1]);
    minY = Math.min(minY, n[1]);
    assert(
      Math.abs(
        Math.hypot(...s.playerWorld) -
          (120 / (2 * Math.PI) + s.sphere.groundHeight + 0.06),
      ) < 0.001,
    );
  }
  await page.keyboard.up("w");
  assert(distance >= 120, `Only moved ${distance} m`);
  assert(maxY > 0.98 && minY < -0.98, `Poles not crossed: ${minY},${maxY}`);
  const end = (await snap()).playerUp;
  assert(start[0] * end[0] + start[1] * end[1] + start[2] * end[2] > 0.995);
  await page.locator("#view").click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/orbis-overview.png" });
  await page.reload();
  await wait(() => window.__planets?.snapshot().state.planet === "orbis");
  assert.equal((await snap()).state.equipment.weapon, "sword");
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${distance.toFixed(1)} m continuous walk around Orbis, both poles, radial gravity, overview and save/reload.`,
  );
  await menu("galaxy");
  await page.locator('[data-planet="home"]').click();
  await completeFlight(page, "home");
  await wait(
    () =>
      window.__planets.snapshot().state.planet === "home" &&
      !window.__planets.snapshot().busy,
  );
  const up = (await snap()).playerUp;
  assert(Math.abs(up[1] - 1) < 0.00001);
  console.log(
    "PASS: radial departure from the sphere, home landing and restored upright orientation.",
  );
  await context.close();
} catch (error) {
  if (page && !page.isClosed()) {
    console.log(
      "FAIL",
      await page.evaluate(() => window.__planets?.snapshot()),
    );
    await page.screenshot({ path: "test-results/frontiers-failure.png" });
  }
  throw error;
} finally {
  await browser.close();
}
