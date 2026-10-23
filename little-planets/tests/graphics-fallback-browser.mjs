import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
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
  const page = await browser.newPage({
      viewport: { width: 640, height: 480 },
      deviceScaleFactor: 0.5,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // Simulate the actual optional WebGL capability, without changing any game state or renderer flags.
  await page.addInitScript(() => {
    const get = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      return name === "EXT_color_buffer_float" ? null : get.call(this, name);
    };
  });
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?mode=colony&debug=1",
  );
  await page.waitForFunction(
    () => window.__planets?.snapshot().triangles > 1000,
  );
  assert.equal(
    await page.evaluate(() => window.__planets.snapshot().art.ao),
    false,
  );
  await page.locator("#settings").click();
  await page.locator("#quality").click();
  await page.locator("#quality").click();
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(() => window.__planets.snapshot().art.ao),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: missing float color targets use byte-buffer rendering; unsupported SSAO stays disabled after quality toggles.",
  );
} finally {
  await browser.close();
}
