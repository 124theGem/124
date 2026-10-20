import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame, applyAction } from "../shared/model.ts";
import { PLANETS } from "../shared/catalog.ts";
import { offsetPoint } from "../shared/voxel.ts";
import { openSystems, gameState } from "./outfit-helpers.ts";
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
async function launch(viewport, save) {
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
  if (save)
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
async function hit(page, at, h = 0.03) {
  const p = await page.evaluate(
    ({ at, h }) => window.__planets.project(at.x, at.z, h),
    { at, h },
  );
  assert(
    await page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.matches("canvas.world"),
      p,
    ),
    `World point is exposed ${JSON.stringify(p)}`,
  );
  await page.mouse.click(p.x, p.y);
}
try {
  if (
    !process.env.FIRSTLIGHT_SCOPE ||
    process.env.FIRSTLIGHT_SCOPE === "intro"
  ) {
    const { page, context, errors } = await launch({
      width: 1100,
      height: 800,
    });
    assert.equal((await gameState(page)).prologue.phase, "arrival");
    assert(await page.locator('[data-hand="grapple"]').isDisabled());
    assert.equal(await page.locator("#first-person").count(), 0);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/firstlight-arrival.png" });
    await page.locator("#story-begin").click();
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(
        (n) => window.__planets.snapshot().state.prologue.plants.length === n,
        i,
      );
      await page.locator("#story-target").click();
      await page
        .getByRole("button", { name: "Собрать растение", exact: true })
        .click();
      await page.waitForFunction(
        (n) => window.__planets.snapshot().state.prologue.plants.length === n,
        i + 1,
      );
      if (i === 0) {
        await page.reload();
        await page.waitForFunction(
          () => window.__planets?.snapshot().state.prologue.plants.length === 1,
        );
      }
    }
    assert.equal((await gameState(page)).prologue.phase, "meteor");
    await page.locator("#story-target").click();
    await page
      .getByRole("button", { name: "Добыть железо", exact: true })
      .click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.prologue.phase === "repair",
    );
    assert.equal((await gameState(page)).inventory.iron, 3);
    await page.locator("#story-target").click();
    await page.locator("#story-ship").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.prologue.phase === "launch",
    );
    assert.equal((await gameState(page)).inventory.iron, 0);
    await page.locator("#story-target").click();
    assert.equal(await page.locator("#story-ship").textContent(), "ЗАПУСТИТЬ");
    await page.locator("#story-ship").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().observing?.reveal,
    );
    assert.equal((await gameState(page)).discovered.length, 5);
    await page.reload();
    await page.waitForFunction(
      () => window.__planets?.snapshot().observing?.reveal,
    );
    await page.waitForFunction(
      () => window.__planets.snapshot().observing?.elapsed >= 7,
    );
    await page.screenshot({
      path: "test-results/firstlight-system-reveal.png",
    });
    await page.locator("#optics-finish").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.prologue.phase === "complete",
    );
    assert(await page.locator("#story-panel").isHidden());
    assert(!(await gameState(page)).flight);
    await page.screenshot({ path: "test-results/firstlight-complete.png" });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS fresh arrival, quest travel/three plants, partial reload, meteor iron, paid repair, launch/reveal/reload, unlocked system",
    );
  }
  if (
    !process.env.FIRSTLIGHT_SCOPE ||
    process.env.FIRSTLIGHT_SCOPE === "garden"
  ) {
    let s = newGame(Date.now(), true);
    s.position = { x: 7, z: 7 };
    s = applyAction(s, {
      type: "build",
      kind: "telescope",
      x: 3,
      z: 7,
      rotation: 0,
    });
    const { page, context, errors } = await launch(
      { width: 1100, height: 800 },
      s,
    );
    await page.locator('[data-hand="cultivator"]').click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.hand === "cultivator",
    );
    await hit(page, { x: 8, z: 7 });
    assert(await page.locator("#context").isHidden());
    await page.locator("#mine-strike").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().state.worlds.home.gardens.length === 1,
    );
    const at = (await gameState(page)).worlds.home.gardens[0];
    await hit(page, at);
    await page
      .getByRole("button", { name: "Выбрать семена", exact: true })
      .click();
    await page.locator('[data-seed="carrot"]').click();
    await page.waitForFunction(
      () =>
        Object.keys(window.__planets.snapshot().state.worlds.home.crops)
          .length === 1,
    );
    console.log("garden: cultivated and planted through UI");
    for (const [i, kind] of ["wood", "stone", "energy"].entries()) {
      await openSystems(page, "build");
      await page.locator(`[data-fence="${kind}"]`).click();
      await page.locator("#rotate-placement").click();
      await hit(page, offsetPoint(at, 0, 1.5 + i * 1.3, "home"));
      await page
        .getByRole("button", { name: "Установить ограду", exact: true })
        .click();
      await page.waitForFunction(
        (n) =>
          window.__planets.snapshot().state.worlds.home.fences.length === n,
        i + 1,
      );
      await page.locator("#cancel-placement").click();
    }
    console.log("garden: placed all fence variants");
    await page.reload();
    await page.waitForFunction(
      () => window.__planets?.snapshot().state.worlds.home.fences.length === 3,
    );
    assert.equal((await gameState(page)).worlds.home.gardens.length, 1);
    assert.equal(
      Object.keys((await gameState(page)).worlds.home.crops).length,
      1,
    );
    await page.screenshot({ path: "test-results/firstlight-garden.png" });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS cultivator/plant/save and all three persistent fence variants",
    );
  }
  if (
    !process.env.FIRSTLIGHT_SCOPE ||
    process.env.FIRSTLIGHT_SCOPE === "optics"
  ) {
    let s = newGame(Date.now(), true);
    s = applyAction(s, {
      type: "build",
      kind: "telescope",
      x: 8,
      z: 7,
      rotation: 0,
    });
    s.position = { x: 9, z: 8 };
    const { page, context, errors } = await launch(
      { width: 1100, height: 800 },
      s,
    );
    await hit(page, { x: 8, z: 7 }, 1.7);
    await page.locator("#telescope-map").waitFor();
    await page.locator('[data-observe="listoria"]').click();
    await page.waitForFunction(
      () => window.__planets.snapshot().observing?.target === "listoria",
    );
    const before = await gameState(page);
    await page.mouse.move(700, 200);
    await page.mouse.down();
    await page.mouse.move(880, 380, { steps: 8 });
    await page.mouse.up();
    await page.locator("#optics-plus").click();
    await page.screenshot({ path: "test-results/firstlight-telescope.png" });
    await page.locator("#optics-close").click();
    assert.deepEqual((await gameState(page)).position, before.position);
    await openSystems(page, "galaxy");
    await page.locator("#planet-search").fill(PLANETS["wild-1100"].name);
    await page.locator('[data-signal="wild-1100"]').click();
    await page.locator("#observe-selected").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().observing?.target === "wild-1100",
    );
    await page.locator("#optics-close").click();
    assert(!(await gameState(page)).discovered.includes("wild-1100"));
    assert(!(await gameState(page)).worlds["wild-1100"]);
    await page.locator("#view").click();
    await page.waitForFunction(
      () => window.__planets.snapshot().mode === "planet",
    );
    await page.waitForTimeout(600);
    const a = await page.evaluate(() => window.__planets.snapshot());
    await page.mouse.move(700, 200);
    await page.mouse.down();
    await page.mouse.move(900, 460, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const b = await page.evaluate(() => window.__planets.snapshot());
    assert.notDeepEqual(b.cameraQuaternion, a.cameraQuaternion);
    assert.notDeepEqual(b.cameraUp, a.cameraUp);
    assert.deepEqual(b.position, a.position);
    await page.keyboard.press("f");
    assert.equal(await page.locator("#first-person").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS physical telescope + map observation, read-only optics and unrestricted overview rotation",
    );
  }
  if (
    !process.env.FIRSTLIGHT_SCOPE ||
    process.env.FIRSTLIGHT_SCOPE === "mobile"
  )
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      const { page, context, errors } = await launch(viewport);
      await page.locator("#story-begin").waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `test-results/firstlight-mobile-${viewport.width}.png`,
      });
      await page.locator("#story-begin").click();
      await page.locator("#story-target").click();
      await page
        .getByRole("button", { name: "Собрать растение", exact: true })
        .click();
      await page.waitForFunction(
        () => window.__planets.snapshot().state.prologue.plants.length === 1,
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS ${viewport.width}: intro viewport, touch quest controls and real harvesting`,
      );
    }
} catch (e) {
  if (current && !current.isClosed()) {
    await current.screenshot({ path: "test-results/firstlight-failure.png" });
    console.error(await current.locator("#toast").textContent());
  }
  throw e;
} finally {
  await browser.close();
}
