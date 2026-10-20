import {
  createAndPlaceDevice,
  placeInventoryItem,
  openSystems,
} from "./outfit-helpers.ts";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame, applyAction } from "../shared/model.ts";
import {
  PLANETS,
  PLANET_COMPOSITION,
  RESOURCE_LABELS,
  ship,
} from "../shared/catalog.ts";
import { inScannerRange } from "../shared/sector.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await mkdir("test-results", { recursive: true });
const url = process.env.GAME_URL || "http://127.0.0.1:5174";
let current;
let fixture = newGame(Date.now(), true);
for (const [k, x, z] of [
  ["scanner", 8, 7],
  ["shipyard", 11, 7],
  ["planetdrill", 7, 10],
])
  fixture = applyAction(fixture, { type: "build", kind: k, x, z, rotation: 0 });
fixture.position = { x: 9, z: 8 };
const launch = async (viewport, save) => {
  const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 0.6,
      isMobile: viewport.width < 600,
      hasTouch: viewport.width < 600,
    }),
    page = await context.newPage();
  current = page;
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|WebGL|GL_INVALID/.test(m.text()))
      errors.push(m.text());
  });
  await page.addInitScript((s) => {
    if (!localStorage.getItem("little-planets-v6"))
      localStorage.setItem("little-planets-v6", s);
  }, JSON.stringify(save));
  await page.goto(url + "/?debug=1");
  await page.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  return {
    page,
    context,
    errors,
    snap: () => page.evaluate(() => window.__planets.snapshot()),
    menu: async (id) => {
      if (await page.locator("#" + id).isHidden())
        await page.locator("#menu-toggle").click();
      await page.locator("#" + id).click();
    },
  };
};
const building = async (page, x, z) => {
  const project = () =>
    page.evaluate((p) => window.__planets.project(p.x, p.z, 1.2), { x, z });
  let p = await project();
  const exposed = () =>
    page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.matches("canvas.world"),
      p,
    );
  if (!(await exposed())) {
    await page.locator("#view").click();
    await page.waitForTimeout(700);
    p = await project();
  }
  assert(
    await exposed(),
    `Building is exposed in world canvas: ${JSON.stringify(p)}`,
  );
  await page.mouse.click(p.x, p.y);
};

try {
  const { page, context, errors, snap, menu } = await launch(
    { width: 1100, height: 800 },
    fixture,
  );
  await page.screenshot({ path: "test-results/aurora-colony.png" });
  await building(page, 8, 7);
  await page.locator("#facility-map").waitFor();
  await page.waitForFunction(
    () =>
      window.__planets
        .snapshot()
        .state.worlds.home.buildings.find((b) => b.kind === "planetdrill")
        .produced > 0,
  );
  await page.locator("#facility-upgrade").click();
  await page.waitForFunction(
    () =>
      window.__planets
        .snapshot()
        .state.worlds.home.buildings.find((b) => b.kind === "scanner").level ===
      2,
  );
  await page.locator("#facility-map").click();
  await page.locator("#sector-map").waitFor();
  await page.locator("#planet-search").fill(PLANETS["wild-1200"].name);
  await page.locator('[data-signal="wild-1200"]').click();
  assert(await page.locator("#scan-selected").isDisabled());
  fixture.worlds.home.buildings.find((b) => b.kind === "scanner").level = 2;
  const reachable = Object.keys(PLANETS).find(
    (p) => p.startsWith("wild-") && inScannerRange(fixture, p),
  );
  assert(reachable);
  await page.locator("#planet-search").fill(PLANETS[reachable].name);
  await page.locator(`[data-signal="${reachable}"]`).click();
  await page.locator("#scan-selected").click();
  await page.waitForFunction(
    (p) => window.__planets.snapshot().state.scans.includes(p),
    reachable,
  );
  for (const part of PLANET_COMPOSITION[reachable])
    assert(
      (await page.locator("#sector-detail").textContent()).includes(
        `${part.percent}%`,
      ),
    );
  await page.screenshot({ path: "test-results/aurora-map.png" });
  await page.locator("#close-modal").click();
  await page.reload();
  await page.waitForFunction(
    (p) => window.__planets?.snapshot().state.scans.includes(p),
    reachable,
  );
  await page.locator("#profile").click();
  assert(await page.locator(".space-passport").isVisible());
  assert(
    (await page.locator(".space-passport").textContent()).includes("AURORA"),
  );
  await page.screenshot({ path: "test-results/aurora-passport.png" });
  await page.locator("#close-modal").click();
  await building(page, 11, 7);
  await page.locator("#ship-class").waitFor();
  await page.locator("#ship-class").selectOption("cargo");
  await page.locator("#ship-model").selectOption("3");
  await page.locator("#ship-hull").selectOption("freighter");
  await page.locator("#ship-wings").selectOption("delta");
  await page.locator("#ship-color").selectOption("emerald");
  await page.locator("#ship-name").fill("Караван Тест");
  const before = (await snap()).state.inventory;
  await page.locator("#create-ship").click();
  await page.waitForFunction(() =>
    window.__planets
      .snapshot()
      .state.fleet.some((s) => s.name === "Караван Тест"),
  );
  const crafted = (await snap()).state;
  const design = crafted.fleet.find((s) => s.name === "Караван Тест");
  for (const [id, n] of Object.entries(before))
    assert.equal(crafted.inventory[id], n);
  assert.equal(crafted.inventory[`ship:${design.id}`], 1);
  assert.equal(design.color, "emerald");
  assert.equal(design.model, 3);
  assert.equal(design.class, "cargo");
  await page.screenshot({ path: "test-results/aurora-shipyard.png" });
  await page.locator("#close-modal").click();
  await menu("automation");
  await createAndPlaceDevice(page, "warehouse");
  await createAndPlaceDevice(page, "refinery");
  await createAndPlaceDevice(page, "crawler");
  const devices = (await snap()).state.automation.devices,
    crawler = devices.find((d) => d.kind === "crawler");
  await page.locator(`[data-device="${crawler.id}"]`).click();
  await page.locator("#route-save").click();
  await page.waitForFunction(() =>
    window.__planets
      .snapshot()
      .state.automation.devices.some(
        (d) => d.kind === "crawler" && d.logistics,
      ),
  );
  await createAndPlaceDevice(page, "drone");
  const drone = (await snap()).state.automation.devices.find(
    (d) => d.kind === "drone",
  );
  await page.locator(`[data-device="${drone.id}"]`).click();
  assert(await page.locator("#route-from").isVisible());
  assert(await page.locator("#route-to").isVisible());
  await page.screenshot({ path: "test-results/aurora-logistics.png" });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS desktop: building picking/upgrades, scan range and percentages/reload, passport, modular free ship, crawler and freight controls",
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const { page, context, errors, menu } = await launch(viewport, fixture);
    await menu("galaxy");
    await page.locator("#sector-map").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const overflow = await page
      .locator("#modal-content")
      .evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    assert(!overflow, "Map content fits mobile width");
    await page.screenshot({
      path: `test-results/aurora-map-${viewport.width}.png`,
    });
    await page.locator("#close-modal").click();
    await page.locator("#profile").click();
    assert.equal(
      await page
        .locator("#modal-content")
        .evaluate((el) => el.scrollWidth > el.clientWidth + 2),
      false,
    );
    await page.screenshot({
      path: `test-results/aurora-profile-${viewport.width}.png`,
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${viewport.width}x${viewport.height}: modern map and passport viewport bounds`,
    );
  }
  {
    let flight = newGame(Date.now(), true);
    flight.position = { ...ship("home") };
    flight = applyAction(flight, { type: "travel", planet: "listoria" });
    flight.flight.autopilot = true;
    const { page, context, errors, snap } = await launch(
      { width: 1100, height: 800 },
      flight,
    );
    await page.locator("#space-hud").waitFor();
    assert((await snap()).space.cockpit);
    assert(await page.locator("#space-land").isHidden());
    await page.screenshot({ path: "test-results/aurora-cockpit.png" });
    await page
      .locator("#space-land")
      .waitFor({ state: "visible", timeout: 120000 });
    await page.locator("#space-land").click();
    await page.waitForFunction(
      () =>
        window.__planets.snapshot().state.planet === "listoria" &&
        !window.__planets.snapshot().state.flight,
    );
    assert.equal((await snap()).state.profile.visits.listoria.arrivals, 1);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS first-person cockpit, server-controlled approach and proximity landing",
    );
  }
  {
    const f = structuredClone(fixture);
    f.cycleEpoch = Date.now();
    for (const b of f.worlds.home.buildings) {
      if (b.kind === "planetdrill") b.level = 5;
      if (b.kind === "scanner") b.level = 10;
    }
    const { page, context, errors } = await launch(
      { width: 1100, height: 800 },
      f,
    );
    await page.locator("#view").click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "test-results/aurora-megastructure.png" });
    assert.deepEqual(errors, []);
    await context.close();
  }
} catch (e) {
  if (current && !current.isClosed()) {
    await current.screenshot({ path: "test-results/aurora-failure.png" });
    console.error("UI", await current.locator("#toast").textContent());
  }
  throw e;
} finally {
  await browser.close();
}
