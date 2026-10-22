import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../shared/model.ts";
import { sphereNormal } from "../shared/sphere.ts";
import { DAY_DURATION } from "../shared/daylight.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  for (const night of [false, true]) {
    let save = newGame(Date.now(), true);
    for (const [kind, x, z] of [
      ["house", 9, 10],
      ["warehouse", 15, 9],
      ["shipyard", 20, 13],
      ["scanner", 9, 18],
    ])
      save = applyAction(save, { type: "build", kind, x, z, rotation: 0 });
    save.position = { x: 14, z: 13 };
    const up = sphereNormal(save.position, "home");
    const phase =
      (Math.atan2(up.z, up.x) + (night ? Math.PI : 0)) / (Math.PI * 2);
    save.cycleEpoch = Date.now() - ((phase - 0.25 + 2) % 1) * DAY_DURATION;
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 0.8,
    });
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      (s) => localStorage.setItem("little-planets-v6", JSON.stringify(s)),
      save,
    );
    await page.goto(
      (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?debug=1",
    );
    await page.waitForFunction(
      () => window.__planets?.snapshot().triangles > 1000,
    );
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => window.__planets.snapshot());
    assert(
      night ? state.daylight.daylight < 0.1 : state.daylight.daylight > 0.9,
      JSON.stringify(state.daylight),
    );
    await page.screenshot({
      path: `test-results/atlas-colony-${night ? "night" : "day"}.png`,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual colony",
      night ? "night" : "day",
      JSON.stringify(state.lighting),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
