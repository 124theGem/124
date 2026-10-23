import { completeFlight } from "./flight-browser.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
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
let activePage;
try {
  const context = await browser.newContext({
      viewport: { width: 1200, height: 850 },
      deviceScaleFactor: 0.5,
    }),
    page = await context.newPage(),
    errors = [];
  activePage = page;
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => errors.push(e.message));
  const menuClick = async (id) => {
    if (await page.locator(`#${id}`).isHidden())
      await page.locator("#menu-toggle").click();
    await page.locator(`#${id}`).click();
  };
  const snap = () => page.evaluate(() => window.__planets.snapshot()),
    wait = (fn) => page.waitForFunction(fn, {}, { timeout: 90000 }),
    settle = () => wait(() => !window.__planets.snapshot().busy);
  const clickWorld = async (x, z, y = 0.1) => {
    const point = await page.evaluate(
      ([x, z, y]) => window.__planets.project(x, z, y),
      [x, z, y],
    );
    assert(
      point.x >= 0 && point.x < 1200 && point.y >= 0 && point.y < 850,
      `Object outside viewport: ${JSON.stringify(point)}`,
    );
    await page.mouse.click(point.x, point.y);
  };
  await page.goto(`${base}/?mode=colony&debug=1`);
  await wait(() => window.__planets?.snapshot().triangles > 1000);
  await wait(() =>
    document
      .querySelector("#minimap")
      .getContext("2d")
      .getImageData(0, 0, 240, 240)
      .data.some((v) => v > 0),
  );
  assert.equal((await snap()).state.planet, "home");
  assert.equal((await snap()).animals.length, 10);
  assert((await snap()).drawCalls < 180);
  assert(await page.locator("#context").isHidden());
  await page.keyboard.down("d");
  await wait(() => window.__planets.snapshot().position.x > 18.15);
  await page.keyboard.up("d");
  await menuClick("plant");
  await page.locator("#context-action").waitFor();
  assert(await page.locator("#modal").isHidden());
  await page.locator("#context-action").click();
  await page.locator('[data-seed="sunflower"]').click();
  await wait(
    () =>
      window.__planets.snapshot().crops.length === 1 &&
      !window.__planets.snapshot().busy,
  );
  assert(await page.locator("#context").isHidden());
  await wait(() => window.__planets.snapshot().crops[0].ready);
  const planted = (await snap()).crops[0].cell.split(",").map(Number);
  await clickWorld(...planted);
  await page
    .getByRole("button", { name: "Собрать урожай", exact: true })
    .click();
  await wait(
    () =>
      window.__planets.snapshot().state.inventory["crop:sunflower"] === 3 &&
      !window.__planets.snapshot().busy,
  );
  assert(await page.locator("#context").isHidden());
  console.log(
    "PASS: movement, contextual beds, growing/harvesting and dismissed panels stay closed.",
  );
  await menuClick("build");
  assert(await page.locator("#confirm-build").isEnabled());
  await page.screenshot({ path: "test-results/home-build.png" });
  await page.locator("#confirm-build").click();
  await wait(
    () =>
      window.__planets.snapshot().state.worlds.home.buildings.length === 2 &&
      !window.__planets.snapshot().busy,
  );
  assert.equal((await snap()).state.inventory.wood, 72);
  await menuClick("craft");
  await page.locator('[data-recipe="furniture:chair"]').click();
  await page.locator("#craft-one").click();
  await wait(
    () => window.__planets.snapshot().state.inventory["furniture:chair"] === 1,
  );
  await page.locator("#close-modal").click();
  await menuClick("inventory");
  assert((await page.locator(".slot[data-item]").count()) > 10);
  assert((await page.locator(".slot svg").count()) >= 6);
  await page.locator('[data-item="furniture:chair"]').click();
  await page.screenshot({ path: "test-results/inventory-slots.png" });
  await page.locator("#close-modal").click();
  // The HQ is a real clickable world model. An overview makes the roof visible.
  await page.locator("#view").click();
  await page.waitForTimeout(1300);
  await clickWorld(13, 16, 2);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await wait(
    () =>
      window.__planets.snapshot().state.inside === "home-hq" &&
      !window.__planets.snapshot().busy,
  );
  await menuClick("build");
  assert(await page.locator("#confirm-build").isEnabled());
  await page.locator("#confirm-build").click();
  await wait(
    () =>
      window.__planets.snapshot().state.interiors["home-hq"].length === 1 &&
      !window.__planets.snapshot().busy,
  );
  await page.screenshot({ path: "test-results/furnished-house.png" });
  await page.reload();
  await wait(() => window.__planets?.snapshot().state.inside === "home-hq");
  assert.equal((await snap()).state.interiors["home-hq"].length, 1);
  await clickWorld(6, 8.6, 0.1);
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await wait(
    () =>
      !window.__planets.snapshot().state.inside &&
      !window.__planets.snapshot().busy,
  );
  console.log(
    "PASS: building base, crafting, inventory slots, entering HQ, furniture, interior reload and clicking the exit.",
  );
  const inventory = (await snap()).state.inventory;
  for (const planet of ["listoria", "mycelia", "pyros", "home"]) {
    await menuClick("galaxy");
    await page.locator(`[data-planet="${planet}"]`).click();
    await completeFlight(page, planet);
    await page.waitForFunction(
      (p) =>
        window.__planets.snapshot().state.planet === p &&
        !window.__planets.snapshot().busy,
      planet,
      { timeout: 90000 },
    );
    const s = await snap();
    assert.deepEqual(s.state.inventory, inventory);
    const launch = s.flightSamples.filter((s) => s.phase === "launch");
    for (const samples of [launch]) {
      assert(samples.length > 1);
      assert(
        Math.max(...samples.map((s) => s.x)) -
          Math.min(...samples.map((s) => s.x)) <
          0.00001,
      );
      assert(
        Math.max(...samples.map((s) => s.z)) -
          Math.min(...samples.map((s) => s.z)) <
          0.00001,
      );
      assert(
        Math.max(...samples.map((s) => s.screenX)) -
          Math.min(...samples.map((s) => s.screenX)) <
          0.00001,
      );
      assert(samples.some((s) => s.smoke === 64));
    }
    assert(launch.at(-1).y > launch[0].y + 10);
    if (planet !== "home") {
      await menuClick("build");
      const kinds = await page
        .locator("[data-placement]")
        .evaluateAll((bs) => bs.map((b) => b.dataset.placement));
      assert(kinds.includes("extractor"));
      assert(!kinds.includes("warehouse") && !kinds.includes("house"));
      await page.locator("#cancel-build").click();
    }
  }
  assert.equal((await snap()).state.worlds.home.buildings.length, 2);
  assert.equal((await snap()).state.interiors["home-hq"].length, 1);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: all four worlds, outpost restrictions, shared inventory and strictly vertical ship coordinates/screen path with smoke.",
  );
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 0.5,
      isMobile: true,
      hasTouch: true,
    }),
    phone = await mobile.newPage();
  phone.setDefaultTimeout(60000);
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(`${base}/?mode=colony&debug=1`);
  await phone.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  const cdp = await mobile.newCDPSession(phone),
    stick = await phone.locator("#joystick").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: stick.x + stick.width * 0.8, y: stick.y + stick.height / 2, id: 1 },
    ],
  });
  await phone.waitForFunction(
    () => window.__planets.snapshot().position.x > 18.15,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await phone.screenshot({ path: "test-results/mobile-portrait.png" });
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.waitForTimeout(1000);
  await phone.locator("#menu-toggle").click();
  await phone.locator("#plant").click();
  await phone.locator("#context-action").waitFor();
  const fits = await phone.evaluate(() => {
    const ids = [".topbar", ".minimap", "#context", ".bottom", "#joystick"],
      r = ids.map((s) => document.querySelector(s).getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      visible: r.every(
        (b) =>
          b.x >= 0 &&
          b.y >= 0 &&
          b.right <= innerWidth &&
          b.bottom <= innerHeight,
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
  assert.deepEqual(fits, { overflow: false, visible: true, overlap: false });
  await phone.screenshot({ path: "test-results/mobile-landscape-context.png" });
  await phone.locator("#close-context").click();
  await phone.waitForTimeout(600);
  assert(await phone.locator("#context").isHidden());
  await phone.locator("#menu-toggle").click();
  await phone.locator("#craft").click();
  assert(await phone.locator("#craft-one").isVisible());
  await phone.screenshot({ path: "test-results/mobile-landscape-craft.png" });
  await phone.locator("#close-modal").click();
  await phone.locator("#settings").click();
  await phone.locator("#full").click();
  await phone.waitForFunction(() => Boolean(document.fullscreenElement));
  assert.deepEqual(errors, []);
  await mobile.close();
  console.log(
    "PASS: touch joystick, minimap, portrait, landscape bounds/non-overlap, crafting modal and fullscreen.",
  );
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.log(
      "FAIL STATE",
      await activePage.evaluate(() => window.__planets?.snapshot()),
    );
    await activePage.screenshot({ path: "test-results/failure.png" });
  }
  throw error;
} finally {
  await browser.close();
}
