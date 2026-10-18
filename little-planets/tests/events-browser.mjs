import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { newGame, worldEvent, walkable } from "../shared/model.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  for (const type of ["meteor", "wind"]) {
    const context = await browser.newContext({
        viewport: { width: 1000, height: 700 },
        deviceScaleFactor: 0.5,
      }),
      page = await context.newPage(),
      now = Date.now(),
      save = newGame(now - (type === "meteor" ? 45000 : 125000)),
      event = worldEvent(save, "home", now);
    assert.equal(event.type, type);
    if (type === "meteor") {
      save.position = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([dx, dz]) => ({ x: event.x + dx, z: event.z + dz }))
        .find((p) => walkable(save, "home", p.x, p.z));
      assert(save.position);
    }
    await page.addInitScript({
      content: `localStorage.setItem('little-planets-v1',${JSON.stringify(JSON.stringify(save))});`,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?debug=1",
    );
    await page.waitForFunction(
      () => window.__planets?.snapshot().triangles > 1000,
    );
    await page.locator("#event-banner").waitFor();
    assert.match(
      await page.locator("#event-banner").textContent(),
      type === "wind" ? /ветер/ : /Метеорит упал/,
    );
    await page.screenshot({ path: `test-results/event-${type}.png` });
    if (type === "meteor") {
      const point = await page.evaluate(
        ([x, z]) => window.__planets.project(x, z, 0.25),
        [event.x, event.z],
      );
      await page.mouse.click(point.x, point.y);
      await page
        .getByRole("button", { name: "Исследовать", exact: true })
        .click({ timeout: 60000 });
      await page.waitForFunction(
        () =>
          window.__planets.snapshot().state.inventory.crystal === 24 &&
          !window.__planets.snapshot().busy,
      );
      assert.equal(
        await page.evaluate(
          () => window.__planets.snapshot().state.worlds.home.salvaged.length,
        ),
        1,
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS: visible ${type} event${type === "meteor" ? ", real world click and one-time salvage" : ""}.`,
    );
  }
} finally {
  await browser.close();
}
