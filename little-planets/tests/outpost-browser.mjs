import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { newGame } from "../shared/model.ts";
import { forestTrees } from "../shared/forestry.ts";
import { offsetPoint } from "../shared/voxel.ts";
import { sphereNormal, cubeUp } from "../shared/sphere.ts";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await mkdir("test-results", { recursive: true });
let page;
try {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 0.75,
    }),
    errors = [];
  page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|program|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  const tree =
    forestTrees("home").find(
      (t) => cubeUp(sphereNormal(t, "home")).y > 0.9 && t.hits === 3,
    ) || forestTrees("home")[0];
  const save = newGame(Date.now(), true);
  save.position = offsetPoint(tree, 1.6, 0, "home");
  // Load an actual previous-release shape; migration must preserve the completed story.
  save.hand = "pickaxe";
  save.inventory["tool:pickaxe"] = 1;
  save.inventory["tool:grapple"] = 1;
  delete save.inventory["tool:axe"];
  save.progression.xp = 321;
  save.revision = 17;
  save.grapple = {
    origin: "home",
    target: "listoria",
    originPosition: { ...save.position },
  };
  delete save.shipBlueprints;
  for (const w of Object.values(save.worlds)) {
    delete w.treeDamage;
    delete w.treeTimber;
  }

  await page.addInitScript((s) => {
    if (!localStorage.getItem("little-planets-v6"))
      localStorage.setItem("little-planets-v6", JSON.stringify(s));
    localStorage.setItem("little-planets-quality", "balanced");
  }, save);
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?debug=1",
  );
  await page.waitForFunction(
    () => window.__planets?.snapshot().art?.frameCalls > 0,
  );
  assert.equal(
    await page
      .locator(
        '[data-hand="pickaxe"],[data-hand="grapple"],#underfoot,#zipline-hud',
      )
      .count(),
    0,
  );
  assert.equal(
    await page.locator('[data-hand="axe"]').getAttribute("aria-pressed"),
    "true",
  );
  const initial = await page.evaluate(() => window.__planets.snapshot());
  assert.equal(initial.state.prologue.phase, "complete");
  assert.equal(initial.state.progression.xp, 321);
  assert.equal(initial.state.grapple, null);
  console.log(
    "Forest test",
    JSON.stringify({
      tree,
      position: initial.position,
      trees: initial.sphere.vegetation.trees,
    }),
  );
  let selected = false;
  for (const height of [1.5, 0.7, 2.4, 0.2]) {
    const p = await page.evaluate(
      ({ t, h }) => window.__planets.project(t.x, t.z, h),
      { t: tree, h: height },
    );
    if (
      !(await page.evaluate(
        (p) => document.elementFromPoint(p.x, p.y)?.matches("canvas.world"),
        p,
      ))
    )
      continue;
    await page.mouse.click(p.x, p.y);
    const hit = await page.evaluate(() => window.__planets.snapshot().selected);
    if (hit?.id === tree.id) {
      selected = true;
      break;
    }
  }
  assert(selected, "The visible instanced forest tree can be selected");
  await page.locator("#context-action").waitFor();
  await page.screenshot({ path: "test-results/outpost-forest-before.png" });
  for (let hit = 0; hit < tree.hits; hit++) {
    await page.locator("#context-action").click();
    await page.waitForFunction(
      ({ id, count, last }) => {
        const w = window.__planets.snapshot().state.worlds.home;
        return last ? w.clearedNodes.includes(id) : w.treeDamage[id] === count;
      },
      { id: tree.id, count: hit + 1, last: hit === tree.hits - 1 },
    );
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(
    () => window.__planets.snapshot().sphere.vegetation.trees === 63,
  );
  let state = await page.evaluate(() => window.__planets.snapshot().state);
  assert.equal(state.inventory.wood, save.inventory.wood + tree.timber);
  assert.equal(
    state.worlds.home.clearedNodes.filter((id) => id === tree.id).length,
    1,
  );
  await page.reload();
  await page.waitForFunction(
    () => window.__planets?.snapshot().art?.frameCalls > 0,
  );
  state = await page.evaluate(() => window.__planets.snapshot().state);
  assert(state.worlds.home.clearedNodes.includes(tree.id));
  assert.equal(state.inventory.wood, save.inventory.wood + tree.timber);
  assert.equal(
    (await page.evaluate(() => window.__planets.snapshot())).sphere.vegetation
      .trees,
    63,
  );
  await page.screenshot({ path: "test-results/outpost-forest-after.png" });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS actual instanced forest selection, repeated axe hits, finite timber, visual removal and save/reload; retired tools absent",
  );
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({ path: "test-results/outpost-forest-failure.png" })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
