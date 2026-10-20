import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { newGame } from "../shared/model.ts";
import { ship } from "../shared/catalog.ts";
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
      isMobile: viewport.width < 600,
      hasTouch: viewport.width < 600,
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
  return {
    context,
    page,
    errors,
    snap: () => page.evaluate(() => window.__planets.snapshot()),
  };
}
async function menu(page, id) {
  if (await page.locator("#" + id).isHidden())
    await page.locator("#menu-toggle").click();
  await page.locator("#" + id).click();
}
async function point(page, x, z, h) {
  return page.evaluate((p) => window.__planets.project(p.x, p.z, p.h), {
    x,
    z,
    h,
  });
}
try {
  for (const viewport of process.env.FLIGHTDECK_SHIP_ONLY ||
  process.env.FLIGHTDECK_INTERACTIONS_ONLY
    ? []
    : [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
    const save = newGame(Date.now(), true);
    save.position = { x: 8, z: 7 };
    const { page, context, errors } = await launch(viewport, save);
    await page.screenshot({
      path: `test-results/flightdeck-hud-${viewport.width}.png`,
    });
    await menu(page, "inventory");
    for (const section of [
      "inventory",
      "craft",
      "construction",
      "automation",
      "galaxy",
      "profile",
      "settings",
    ]) {
      await page.locator(`[data-window-nav="${section}"]`).click();
      await page.waitForFunction(
        (s) => document.querySelector(".hud").dataset.window === s,
        section,
      );
      assert.equal(
        await page
          .locator(`[data-window-nav="${section}"]`)
          .getAttribute("aria-current"),
        "true",
      );
      assert.equal(
        await page
          .locator("#modal-content")
          .evaluate((e) => e.scrollWidth > e.clientWidth + 2),
        false,
        `${section} fits ${viewport.width}`,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `test-results/flightdeck-${section}-${viewport.width}.png`,
      });
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS all seven windows and navigation ${viewport.width}x${viewport.height}`,
    );
  }
  if (!process.env.FLIGHTDECK_SHIP_ONLY) {
    const save = newGame(Date.now(), true);
    save.position = { x: 8, z: 7 };
    const { page, context, errors, snap } = await launch(
      { width: 1100, height: 800 },
      save,
    );
    await menu(page, "build");
    await page.locator('[data-cube-building="house"]').click();
    assert.equal((await snap()).placement, "house");
    let p = await point(page, 8, 7, 0.05);
    await page.mouse.click(p.x, p.y);
    await page.getByRole("button", { name: "Построить", exact: true }).click();
    await page.waitForFunction(() =>
      window.__planets
        .snapshot()
        .state.worlds.home.buildings.some((b) => b.kind === "house"),
    );
    await page.waitForFunction(() => !window.__planets.snapshot().busy);
    assert.equal(
      (await snap()).placement,
      null,
      "Successful construction clears the blueprint",
    );
    const b = (await snap()).state.worlds.home.buildings.find(
      (b) => b.kind === "house",
    );
    // Select the physical model immediately without switching the item in hand.
    await page.waitForTimeout(700);
    p = await point(page, b.x, b.z, 1.2);
    const exposed = () => page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.matches("canvas.world"), p,
    );
    if (!(await exposed())) {
      await page.locator("#view").click();
      await page.waitForTimeout(700);
      p = await point(page, b.x, b.z, 1.2);
    }
    assert(await exposed(), `Building exposed in world canvas: ${JSON.stringify(p)}`);
    await page.mouse.click(p.x, p.y);
    await page.locator(".facility-summary").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Построить", exact: true })
        .count(),
      0,
    );
    await page.screenshot({ path: "test-results/flightdeck-building.png" });
    await page.locator("#close-modal").click();
    await menu(page, "build");
    await page.locator('[data-cube-building="scanner"]').click();
    await page.locator("#cancel-placement").click();
    assert.equal((await snap()).placement, null);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS construction ends placement and immediately opens building management",
    );
  }
  {
    const save = newGame(Date.now(), true);
    save.position = { ...ship("home") };
    save.hand = "grapple";
    const { page, context, errors, snap } = await launch(
      { width: 1100, height: 800 },
      save,
    );
    // Select grapple travel first, then click the actual ship mesh.
    await page.locator('[data-hand="grapple"]').click();
    await page.locator("#travel-mode").selectOption("grapple");
    await page.locator("#close-modal").click();
    const pad = ship("home"),
      p = await point(page, pad.x, pad.z, 0.8);
    await page.mouse.click(p.x, p.y);
    await page.locator("#board-ship").waitFor();
    await page.screenshot({ path: "test-results/flightdeck-dock.png" });
    await page.locator("#ship-route").click();
    assert.equal(await page.locator("#travel-mode").inputValue(), "ship");
    await page.locator("#close-modal").click();
    await page.mouse.click(p.x, p.y);
    await page.locator("#board-ship").click();
    await page.waitForFunction(
      () => !!window.__planets.snapshot().space?.cockpit,
    );
    assert.equal((await snap()).state.flight.target, "home");
    assert.equal((await snap()).state.grapple, null);
    await page.locator("#space-course").click();
    assert.equal(await page.locator("#travel-mode").inputValue(), "ship");
    assert(
      await page
        .locator('#travel-mode option[value="grapple"]')
        .evaluate((el) => el.disabled),
    );
    await page.locator("#close-modal").click();
    await page.reload();
    await page.waitForFunction(
      () => !!window.__planets?.snapshot().space?.cockpit,
    );
    await page.screenshot({ path: "test-results/flightdeck-cockpit.png" });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS grapple-independent physical ship boarding, ship routes and persisted cockpit",
    );
  }
} catch (e) {
  if (current && !current.isClosed()) {
    await current.screenshot({ path: "test-results/flightdeck-failure.png" });
    console.error(await current.locator("#toast").textContent());
  }
  throw e;
} finally {
  await browser.close();
}
