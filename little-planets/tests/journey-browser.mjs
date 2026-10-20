import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame, applyAction } from "../shared/model.ts";
import { cubeNormal } from "../shared/voxel.ts";
import { sphereCoordinates } from "../shared/sphere.ts";
import { ship } from "../shared/catalog.ts";
import { DAY_DURATION } from "../shared/daylight.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const url = process.env.GAME_URL || "http://127.0.0.1:5174";
await mkdir("test-results", { recursive: true });
let current;
const launch = async (viewport, fixture) => {
  const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 0.5,
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
  }, JSON.stringify(fixture));
  await page.goto(url + "/?debug=1");
  await page.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  const snap = () => page.evaluate(() => window.__planets.snapshot()),
    menu = async (id) => {
      if (await page.locator("#" + id).isHidden())
        await page.locator("#menu-toggle").click();
      await page.locator("#" + id).click();
    };
  return { context, page, snap, menu, errors };
};
try {
  let fixture = newGame(Date.now());
  fixture.position = sphereCoordinates(cubeNormal(4, 0.12, 0.2), "home");
  fixture.inventory["gear:sword"] = 1;
  fixture.inventory["gear:blaster"] = 1;
  fixture.progression.xp = 110;
  fixture = applyAction(fixture, { type: "deploy", kind: "collector" });
  const { page, snap, menu, context, errors } = await launch(
    { width: 1100, height: 800 },
    fixture,
  );
  await page.locator('[data-hand="blaster"]').click();
  await page.waitForFunction(
    () => window.__planets.snapshot().state.equipment.weapon === "blaster",
  );
  assert.equal((await snap()).hand, "blaster");
  await page.locator('[data-hand="pickaxe"]').click();
  await page.waitForFunction(
    () => window.__planets.snapshot().hand === "pickaxe",
  );
  console.log("desktop: hand selection checked");
  const start = await snap();
  await page.locator("#underfoot").click();
  await page.waitForFunction(
    (n) => window.__planets.snapshot().state.inventory.stone === n - 1,
    start.state.inventory.stone,
  );
  await page.waitForFunction(
    (z) => window.__planets.snapshot().playerWorld[2] > z + 0.4,
    start.playerWorld[2],
  );
  const up = await snap();
  // A forced fall from the just-placed block is also represented by the renderer, not a position teleport.
  console.log("desktop: underfoot placement checked");
  await menu("automation");
  await page.locator('[data-device="device-1"]').click();
  while (await page.locator("[data-delete]").count())
    await page.locator("[data-delete]").first().click();
  await page.waitForFunction(
    () =>
      window.__planets.snapshot().state.automation.devices[0].program.nodes
        .length === 0,
  );
  await page.locator("#close-modal").click();
  await menu("automation");
  await page.locator('[data-device="device-1"]').click();
  assert.equal(await page.locator(".program-node").count(), 0);
  await page.locator("#close-modal").click();
  await page.reload();
  await page.waitForFunction(
    () =>
      window.__planets?.snapshot().state.automation.devices[0].program.nodes
        .length === 0,
  );
  assert.equal(
    (await snap()).state.inventory.stone,
    start.state.inventory.stone - 1,
  );
  console.log("desktop: program deletion and reload checked");
  await page.locator("#skills-button").click();
  await page.locator('[data-skill="combat"]').click();
  await page.waitForFunction(
    () => window.__planets.snapshot().state.progression.skills.combat === 1,
  );
  await page.locator("#close-modal").click();
  await page.locator("#first-person").click();
  await page.waitForFunction(() => window.__planets.snapshot().firstPerson);
  const before = (await snap()).position;
  await page.keyboard.down("w");
  await page.waitForTimeout(1100);
  await page.keyboard.up("w");
  assert.notDeepEqual((await snap()).position, before);
  await page.screenshot({ path: "test-results/journey-first-person.png" });
  await page.locator("#first-person").click();
  // Build on the current irregular, vegetated terrain; a prepared site is not required.
  await menu("build");
  await page.locator('[data-cube-building="house"]').click();
  const position = { x: 8, z: 7 },
    projected = await page.evaluate(
      (p) => window.__planets.project(p.x, p.z, 0.02),
      position,
    );
  await page.mouse.click(projected.x, projected.y);
  await page.getByRole("button", { name: "Построить", exact: true }).click();
  await page.waitForFunction(() => !window.__planets.snapshot().busy);
  assert.equal(
    (await snap()).state.worlds.home.buildings.length,
    2,
    await page.locator("#toast").textContent(),
  );
  assert((await snap()).state.worlds.home.cleared.length > 0);
  await page.screenshot({ path: "test-results/journey-colony.png" });
  console.log("desktop: FPV and building checked");
  await page.locator('[data-hand="grapple"]').click();
  await page.locator('[data-planet="nox"]').click();
  await page.waitForFunction(() => !!window.__planets.snapshot().zipline);
  assert.equal((await snap()).state.planet, "home");
  await page.waitForFunction(
    () => document.querySelector("#zipline-progress").value > 0.12,
  );
  assert(
    (await snap()).ziplineCameraDistance < 15,
    "The rider and handle must remain close to the camera",
  );
  await page.screenshot({ path: "test-results/journey-zipline.png" });
  const inFlight = (await snap()).state;
  assert(inFlight.grapple);
  assert.equal(inFlight.hand, "grapple");
  await page.reload();
  await page.waitForFunction(
    () =>
      window.__planets?.snapshot().state.planet === "nox" &&
      !window.__planets.snapshot().state.grapple,
    {},
    { timeout: 60000 },
  );
  assert.equal((await snap()).state.progression.skills.combat, 1);
  assert((await snap()).state.progression.xp >= 125);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS desktop: hands, block beneath feet, empty-program autosave/reload, skills, FPV, foundation and saved zipline arrival",
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const f = newGame(Date.now());
    f.position = sphereCoordinates(cubeNormal(4, 0.12, 0.2), "home");
    f.cycleEpoch = Date.now() - DAY_DURATION / 2;
    const { page, context, snap, errors } = await launch(viewport, f);
    assert.equal((await snap()).daylight.label, "Ночь");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert(await page.locator("#handbar").isVisible());
    await page.locator("#first-person").click();
    assert((await snap()).firstPerson);
    await page.screenshot({
      path: `test-results/journey-night-${viewport.width}x${viewport.height}.png`,
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${viewport.width}x${viewport.height}: hotbar, perspective view, night and viewport bounds`,
    );
  }
  {
    let fixture = newGame(Date.now());
    fixture.planet = "ferra";
    fixture.position = { ...ship("ferra") };
    fixture = applyAction(fixture, { type: "deploy", kind: "collector" });
    const { page, context, errors } = await launch(
      { width: 1100, height: 800 }, fixture,
    );
    await page.waitForFunction(
      () => window.__planets.snapshot().state.automation.devices[0].status !== "Готов",
    );
    const samples = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      const frame = () => {
        const s = window.__planets.snapshot();
        out.push({
          robot: s.machines.find((d) => d.id === "device-1")?.position,
          enemies: s.enemies.filter((e) => e.visible).map((e) => e.position),
        });
        if (out.length < 32) requestAnimationFrame(frame);
        else resolve(out);
      };
      requestAnimationFrame(frame);
    }));
    const positions = samples.map((s) => s.robot).filter(Boolean);
    assert(positions.length > 20);
    let moved = 0, maxStep = 0;
    for (let i = 1; i < positions.length; i++) {
      const distance = Math.hypot(
        ...positions[i].map((n, j) => n - positions[i - 1][j]),
      );
      moved += distance;
      maxStep = Math.max(maxStep, distance);
    }
    assert(moved > 0.2, "Collector moved while its program ran");
    assert(maxStep < 3, "Render frames interpolate the server snapshots");
    assert(samples.some((s) => s.enemies.length > 0));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: "test-results/journey-actors.png" });
    await context.close();
    console.log("PASS live collector/enemy scene: intermediate render positions between server updates");
  }
  for (const [name, u, v] of [
    ["edge", 1, 0],
    ["corner", 1, 1],
  ]) {
    const f = newGame(Date.now());
    f.position = sphereCoordinates(cubeNormal(4, u, v), "home");
    const { page, context, snap, errors } = await launch(
      { width: 1100, height: 800 },
      f,
    );
    await page.waitForTimeout(800);
    const a = await snap();
    await page.waitForTimeout(1300);
    const b = await snap();
    assert.deepEqual(a.position, b.position);
    const dot = a.cameraUp.reduce((n, x, i) => n + x * b.cameraUp[i], 0);
    assert(dot > 0.9999, "Camera should hold its spatial angle while stopped");
    assert(b.cameraUp[0] > 0.4 && b.cameraUp[2] > 0.4);
    if (name === "corner") assert(b.cameraUp[1] > 0.4);
    await page.screenshot({ path: `test-results/journey-${name}.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS stopped ${name}: camera holds a blended orientation`);
  }
} catch (e) {
  if (current && !current.isClosed()) {
    console.error(
      "STATE",
      await current.evaluate(() => {
        const s = window.__planets?.snapshot();
        return s
          ? {
              position: s.position,
              busy: s.busy,
              hand: s.hand,
              selected: s.selected,
              zipline: s.zipline,
            }
          : null;
      }),
    );
    await current.screenshot({ path: "test-results/journey-failure.png" });
  }
  throw e;
} finally {
  await browser.close();
}
