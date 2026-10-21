import {
  createAndPlaceDevice,
  placeInventoryItem,
  openSystems,
} from "./outfit-helpers.ts";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame } from "../shared/model.ts";
import { sphereCoordinates } from "../shared/sphere.ts";
import {
  cubeNormal,
  offsetPoint,
  voxelCell,
  voxelLevel,
  VOXEL_STEP,
  cellKey,
} from "../shared/voxel.ts";
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
let current;
try {
  for (const viewport of process.env.CUBEWORKS_SCOPE === "surface"
    ? []
    : [
        { width: 1100, height: 800 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 0.5,
      isMobile: viewport.width === 390,
      hasTouch: viewport.width === 390,
    });
    const page = await context.newPage();
    current = page;
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /shader|WebGL|GL_INVALID/.test(m.text()))
        errors.push(m.text());
    });
    const fixture = newGame(Date.now());
    // Excavate exposed ground: the ship model now correctly intercepts clicks on its hull.
    fixture.position = sphereCoordinates(cubeNormal(4, -0.5, -0.5), "home");
    await page.addInitScript((s) => {
      if (!localStorage.getItem("little-planets-v6"))
        localStorage.setItem("little-planets-v6", s);
    }, JSON.stringify(fixture));
    const snap = () => page.evaluate(() => window.__planets.snapshot());
    const menu = async (id) => {
      if (await page.locator("#" + id).isHidden())
        await page.locator("#menu-toggle").click();
      await page.locator("#" + id).click();
    };
    await page.goto(base + "/?debug=1");
    await page.waitForFunction(
      () => window.__planets?.snapshot().art?.frameCalls > 0,
    );
    assert.equal((await snap()).sphere.tiles, 6 * 46 * 46);
    assert.equal((await snap()).state.inventory["tool:pickaxe"], 1);
    if (viewport.width === 1100) {
      console.log("desktop: scene ready");
      const before = await snap();
      await page.keyboard.down("w");
      await page.waitForTimeout(1200);
      await page.keyboard.up("w");
      await page.waitForTimeout(300);
      const after = await snap();
      assert.notDeepEqual(after.position, before.position);
      assert.deepEqual(after.sky.origin, before.sky.origin);
      console.log("desktop: movement checked");
      await menu("build");
      await page.locator("#tool-dig").click();
      console.log("desktop: dig selected");
      // Click a surface point close to the player using the same projection as the renderer.
      const s = await snap();
      const target = offsetPoint(s.position, 1.3, 0, "home");
      const projected = await page.evaluate(
        (p) => window.__planets.project(p.x, p.z, 0.02),
        target,
      );
      await page.mouse.click(projected.x, projected.y);
      console.log(
        "desktop: target selected",
        await page.evaluate(() => window.__planets.snapshot().selected),
      );
      assert(await page.locator("#context").isHidden());
      await page.locator("#mine-strike").click();
      await page.waitForFunction(
        () =>
          Object.keys(window.__planets.snapshot().state.worlds.home.terrain)
            .length > 0,
      );
      console.log("desktop: block dug");
      const dug = await snap();
      assert.equal(dug.state.inventory.stone, 76);
      await menu("build");
      await page.locator('[data-terrain="wood"]').click();
      const place = await page.evaluate(
        (p) => window.__planets.project(p.x, p.z, 0.02),
        dug.position,
      );
      await page.mouse.click(place.x, place.y);
      await page
        .getByRole("button", { name: "▣ Поставить блок", exact: true })
        .click();
      await page.waitForFunction(
        () => window.__planets.snapshot().state.inventory.wood === 89,
      );
      console.log("desktop: block placed");
      await menu("automation");
      await createAndPlaceDevice(page, "warehouse");
      await page.waitForFunction(
        () => window.__planets.snapshot().state.automation.devices.length === 1,
      );
      await createAndPlaceDevice(page, "collector");
      await page.waitForFunction(
        () => window.__planets.snapshot().state.automation.devices.length === 2,
      );
      await page.locator('[data-device="device-2"]').click();
      assert.equal(await page.locator(".program-node").count(), 3);
      // Edit the real branch threshold, connect a wire and move a node, then persist it.
      await page
        .locator('[data-node="full"] [data-field="threshold"]')
        .fill("70");
      await page
        .locator('[data-node="full"] [data-field="threshold"]')
        .dispatchEvent("change");
      await page.locator('[data-output="full"][data-port="next"]').click();
      await page.locator('[data-input="unload"]').click();
      const header = page.locator('[data-node="mine"] header'),
        box = await header.boundingBox();
      await page.mouse.move(box.x + 40, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 70, box.y + 35, { steps: 5 });
      await page.mouse.up();
      await page.screenshot({ path: "test-results/cubeworks-program.png" });
      await page.locator("#save-program").click();
      await page.waitForFunction(
        () =>
          window.__planets
            .snapshot()
            .state.automation.devices.find((d) => d.id === "device-2")
            .program.nodes.find((n) => n.id === "full").threshold === 70,
      );
      const program = (await snap()).state.automation.devices.find(
        (d) => d.id === "device-2",
      ).program;
      assert.equal(program.nodes.find((n) => n.id === "full").next, "unload");
      assert(program.nodes[0].x > 40);
      await page.locator("#close-modal").click();
      await page.reload();
      await page.waitForFunction(
        () =>
          window.__planets?.snapshot().state.automation.devices.length === 2,
      );
      assert.equal((await snap()).state.inventory.wood, 77);
      assert(Object.keys((await snap()).state.worlds.home.terrain).length > 0);
      await menu("galaxy");
      await page.locator('[data-planet="home"]').waitFor();
      assert.equal(await page.locator('[data-planet="orbis"]').count(), 0);
      assert.equal(await page.locator("[data-planet]").count(), 6);
      await page.locator("#close-modal").click();
    } else {
      await menu("automation");
      assert(await page.locator('[data-device-kind="drone"]').isVisible());
      await page.locator("#close-modal").click();
      if (viewport.width === 390) {
        const cdp = await context.newCDPSession(page),
          stick = await page.locator("#joystick").boundingBox(),
          before = (await snap()).position;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            {
              x: stick.x + stick.width * 0.8,
              y: stick.y + stick.height / 2,
              id: 1,
            },
          ],
        });
        await page.waitForTimeout(1500);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        assert.notDeepEqual((await snap()).position, before);
      }
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `test-results/cubeworks-${viewport.width}x${viewport.height}.png`,
    });
    await context.close();
    console.log(
      `PASS ${viewport.width}x${viewport.height}: cube, UI, movement, rendering${viewport.width === 1100 ? ", dig/build/reload, machines and connected program editor" : ""}`,
    );
  }
  // A real excavated pit and world-anchored hurricane exercise the occlusion shader on walls.
  {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      deviceScaleFactor: 0.5,
    });
    const page = await context.newPage();
    current = page;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /shader|GL_INVALID|WebGL/.test(m.text()))
        errors.push(m.text());
    });
    const fixture = newGame(Date.now()),
      cell = voxelCell(cubeNormal(4, 0.1, 0.2), "home"),
      point = sphereCoordinates(cell.normal, "home"),
      level = Math.round(voxelLevel(cell.normal, "home", {}) / VOXEL_STEP),
      k = cellKey(cell.normal, "home");
    fixture.position = point;
    fixture.worlds.home.terrain[k] = {
      height: (level - 6) * VOXEL_STEP,
      material: "stone",
      removed: Array.from({ length: 6 }, (_, i) => level - i),
    };
    fixture.worlds.home.eventEpoch = Date.now() - 385000;
    await page.addInitScript(
      (s) => localStorage.setItem("little-planets-v6", s),
      JSON.stringify(fixture),
    );
    await page.goto(base + "/?debug=1");
    await page.waitForFunction(
      () =>
        window.__planets?.snapshot().weather.type === "hurricane" &&
        window.__planets.snapshot().art.frameCalls > 0,
    );
    await page.waitForTimeout(1500);
    const first = await page.evaluate(() => window.__planets.snapshot());
    assert(first.weather.vortex);
    assert(first.sphere.groundHeight < level * VOXEL_STEP - 2);
    await page.screenshot({ path: "test-results/cubeworks-pit-occlusion.png" });
    await page.keyboard.down("d");
    try {
      await page.waitForFunction((before) => {
        const s = window.__planets.snapshot();
        return (
          Math.hypot(s.position.x - before.x, s.position.z - before.z) > 0.005
        );
      }, first.position);
    } finally {
      await page.keyboard.up("d");
    }
    const second = await page.evaluate(() => window.__planets.snapshot());
    assert.deepEqual(second.weatherOrigin, first.weatherOrigin);
    assert.deepEqual(second.sky.origin, first.sky.origin);
    assert.notDeepEqual(second.position, first.position);
    assert.deepEqual(errors, []);
    console.log(
      "PASS excavated pit rendering and stable world anchors for the sky, clouds and vortex",
    );
    await context.close();
  }
  // Continuous camera/gravity transfer across a real face edge using keyboard input.
  const c = await browser.newContext({
    viewport: { width: 1100, height: 800 },
    deviceScaleFactor: 0.5,
  });
  const p = await c.newPage();
  current = p;
  const fixture = newGame(Date.now());
  fixture.position = sphereCoordinates(cubeNormal(4, 0.98, 0), "home");
  await p.addInitScript(
    (s) => localStorage.setItem("little-planets-v6", s),
    JSON.stringify(fixture),
  );
  await p.goto(base + "/?debug=1");
  await p.waitForFunction(() => window.__planets?.snapshot().triangles > 1000);
  await p.waitForTimeout(1200);
  const first = await p.evaluate(() => window.__planets.snapshot());
  await p.keyboard.down("d");
  let changed = false,
    maxTurn = 0,
    prior = first.cameraUp;
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(100);
    const s = await p.evaluate(() => window.__planets.snapshot());
    const dot = s.cameraUp.reduce((v, n, j) => v + n * prior[j], 0);
    maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, Math.max(-1, dot))));
    prior = s.cameraUp;
    if (s.playerUp[0] > 0.8) {
      changed = true;
      break;
    }
  }
  await p.keyboard.up("d");
  assert(changed, "Keyboard movement crossed the cube edge");
  assert(maxTurn < 1.5, "Camera transition is interpolated");
  await p.screenshot({ path: "test-results/cubeworks-edge.png" });
  console.log(
    "PASS edge crossing: player gravity and camera turn continuously",
  );
  await c.close();
} catch (error) {
  if (current && !current.isClosed()) {
    console.error(
      await current.evaluate(() => window.__planets?.snapshot().selected),
    );
    await current.screenshot({ path: "test-results/cubeworks-failure.png" });
  }
  throw error;
} finally {
  await browser.close();
}
