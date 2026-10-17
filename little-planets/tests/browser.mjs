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
try {
  const context = await browser.newContext({
      viewport: { width: 1200, height: 850 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const snapshot = () => page.evaluate(() => window.__planets.snapshot());
  const wait = (fn) => page.waitForFunction(fn, {}, { timeout: 90000 });
  await page.goto(`${base}/?debug=1`);
  await page.waitForSelector("canvas");
  await wait(() => window.__planets?.snapshot().triangles > 1000);
  await page.screenshot({ path: "test-results/listoria.png" });
  const initial = await snapshot();
  assert(initial.drawCalls < 180);
  assert.equal(initial.state.planet, "listoria");
  await page.keyboard.down("d");
  await wait(() => window.__planets.snapshot().position.x > 8.1);
  await page.keyboard.up("d");
  await page.locator("#plant").click();
  await page.waitForSelector('[data-seed="sunflower"]', { timeout: 90000 });
  await page.locator('[data-seed="sunflower"]').click();
  await wait(
    () =>
      window.__planets.snapshot().crops.length === 1 &&
      !window.__planets.snapshot().busy,
  );
  const planted = await snapshot();
  assert.equal(planted.crops[0].stage, 0);
  assert.equal(planted.state.inventory["seed:sunflower"], 5);
  await page.waitForFunction(
    () => window.__planets.snapshot().crops[0].stage >= 1,
    {},
    { timeout: 30000 },
  );
  await page.screenshot({ path: "test-results/growing.png" });
  await page.waitForFunction(
    () => window.__planets.snapshot().crops[0].ready,
    {},
    { timeout: 30000 },
  );
  await page
    .getByRole("button", { name: "Собрать урожай", exact: true })
    .click();
  await wait(
    () =>
      window.__planets.snapshot().state.inventory["crop:sunflower"] === 3 &&
      !window.__planets.snapshot().busy,
  );
  console.log(
    "PASS: keyboard movement, path to bed, planting, three growth stages, harvest and seeds.",
  );
  await page.locator("#build").click();
  await page.waitForSelector("#confirm-build");
  await page.screenshot({ path: "test-results/build-preview.png" });
  assert.equal(await page.locator("#confirm-build").isEnabled(), true);
  await page.locator("#confirm-build").click();
  await wait(
    () =>
      window.__planets.snapshot().state.worlds.listoria.buildings.length ===
        2 && !window.__planets.snapshot().busy,
  );
  assert.equal((await snapshot()).state.inventory.wood, 27);
  await page.locator("#inventory").click();
  assert.match(await page.locator(".seed-list").textContent(), /Солнечник/);
  await page.locator("#close-modal").click();
  // Select a real resource via its projected world coordinates; no game state writes.
  await page.locator("#view").click();
  await page.waitForTimeout(500);
  const rock = await page.evaluate(() => window.__planets.project(3, 11, 0.4));
  await page.mouse.click(rock.x, rock.y);
  await page
    .getByRole("button", { name: "Собрать", exact: true })
    .waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Собрать", exact: true }).click();
  await wait(
    () =>
      window.__planets.snapshot().state.inventory.stone === 21 &&
      !window.__planets.snapshot().busy,
  );
  console.log(
    "PASS: building preview/placement, inventory and harvesting a world resource.",
  );
  // Leave a growing crop behind and verify it and the house survive both flights.
  await page.locator("#plant").click();
  await page.waitForSelector('[data-seed="glowbush"]', { timeout: 90000 });
  await page.locator('[data-seed="glowbush"]').click();
  await wait(
    () =>
      window.__planets.snapshot().crops.length === 1 &&
      !window.__planets.snapshot().busy,
  );
  const conserved = (await snapshot()).state.inventory;
  for (const planet of ["mycelia", "pyros", "listoria"]) {
    await page.locator("#galaxy").click();
    await page.waitForSelector(`[data-planet="${planet}"]`, { timeout: 90000 });
    await page.locator(`[data-planet="${planet}"]`).click();
    await page.waitForFunction(
      (p) =>
        window.__planets.snapshot().state.planet === p &&
        !window.__planets.snapshot().busy,
      planet,
      { timeout: 90000 },
    );
    await page.screenshot({ path: `test-results/${planet}-visited.png` });
    assert.deepEqual((await snapshot()).state.inventory, conserved);
  }
  assert.equal((await snapshot()).state.worlds.listoria.buildings.length, 2);
  assert.equal((await snapshot()).crops.length, 1);
  await page.reload();
  await page.waitForSelector("canvas");
  await wait(
    () =>
      window.__planets?.snapshot().state.worlds.listoria.buildings.length === 2,
  );
  assert.equal((await snapshot()).crops.length, 1);
  assert.deepEqual((await snapshot()).state.inventory, conserved);
  console.log(
    "PASS: three planets, animated flights, shared inventory, crops/buildings and reload persistence.",
  );
  assert.deepEqual(errors, []);
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(`${base}/?debug=1`);
  await phone.waitForSelector("#joystick");
  await phone.screenshot({ path: "test-results/mobile.png" });
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const stick = await phone.locator("#joystick").boundingBox(),
    cdp = await mobile.newCDPSession(phone);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: stick.x + stick.width * 0.8, y: stick.y + stick.height / 2, id: 1 },
    ],
  });
  await phone.waitForFunction(
    () => window.__planets.snapshot().position.x > 8.1,
    {},
    { timeout: 30000 },
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.waitForTimeout(500);
  await phone.screenshot({ path: "test-results/mobile-landscape.png" });
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await phone.locator("#settings").click();
  await phone.locator("#full").click();
  await phone.waitForFunction(() => Boolean(document.fullscreenElement));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mobile joystick, portrait/landscape layout and browser fullscreen. Actual device FPS and native Telegram were not measured.",
  );
  await mobile.close();
} finally {
  await browser.close();
}
