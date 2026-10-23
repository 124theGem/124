import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { newGame, applyAction } from "../shared/model.ts";
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
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    let save = newGame(Date.now(), true);
    save = applyAction(save, {
      type: "build",
      kind: "shipyard",
      x: 8,
      z: 7,
      rotation: 0,
    });
    save.position = { x: 8, z: 7 };
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 0.7,
        isMobile: viewport.width < 900,
        hasTouch: true,
      }),
      page = await context.newPage();
    current = page;
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /shader|program|WebGL/i.test(m.text()))
        errors.push(m.text());
    });
    await page.addInitScript(
      (s) => localStorage.setItem("little-planets-v6", JSON.stringify(s)),
      save,
    );
    await page.goto(
      (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?mode=colony&debug=1",
    );
    await page.waitForFunction(
      () => window.__planets?.snapshot().triangles > 1000,
    );
    const p = await page.evaluate(() => window.__planets.project(8, 7, 1.2));
    await page.mouse.click(p.x, p.y);
    await page.locator("#ship-stage canvas").waitFor();
    await page.locator("#ship-color").selectOption("ochre");
    await page.waitForFunction(
      () =>
        Number(document.querySelector("#ship-stage").dataset.triangles) > 1000,
    );
    await page.screenshot({
      path: `test-results/atlas-yard-${viewport.width}.png`,
    });
    await page.locator("#ship-view-blueprint").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#ship-stage").dataset.blueprintRevision ===
        document.querySelector("#ship-stage").dataset.revision,
    );
    const before = await page
      .locator("#ship-stage")
      .getAttribute("data-dimensions");
    assert.equal(
      JSON.parse(
        await page.locator("#ship-stage").getAttribute("data-blueprint-design"),
      ).color,
      "ochre",
    );
    const scale = await page
      .locator(".blueprint-viewport")
      .getAttribute("data-scale");
    await page.locator("#ship-zoom-in").click();
    assert.notEqual(
      await page.locator(".blueprint-viewport").getAttribute("data-scale"),
      scale,
    );
    const viewportBox = await page.locator(".blueprint-viewport").boundingBox();
    const transformBefore = await page
      .locator(".blueprint-sheet")
      .evaluate((c) => c.style.transform);
    await page.mouse.move(
      viewportBox.x + viewportBox.width * 0.5,
      viewportBox.y + viewportBox.height * 0.7,
    );
    await page.mouse.down();
    await page.mouse.move(
      viewportBox.x + viewportBox.width * 0.4,
      viewportBox.y + viewportBox.height * 0.3,
      { steps: 6 },
    );
    await page.mouse.up();
    assert.notEqual(
      await page.locator(".blueprint-sheet").evaluate((c) => c.style.transform),
      transformBefore,
    );
    await page.screenshot({
      path: `test-results/atlas-blueprint-ui-${viewport.width}.png`,
    });
    if (viewport.width === 1440) {
      let png = await page
        .locator(".blueprint-sheet")
        .evaluate((c) => c.toDataURL());
      await writeFile(
        "test-results/atlas-blueprint-kestrel.png",
        Buffer.from(png.split(",")[1], "base64"),
      );
      await page.locator("#ship-class").selectOption("cargo");
      await page.locator("#ship-model").selectOption("3");
      await page.locator("#ship-engine").selectOption("fusion");
      await page.locator("#ship-module").selectOption("hold");
      await page.waitForFunction(
        () =>
          document.querySelector("#ship-stage").dataset.blueprintRevision ===
          document.querySelector("#ship-stage").dataset.revision,
      );
      const after = await page
        .locator("#ship-stage")
        .getAttribute("data-dimensions");
      assert.notEqual(after, before);
      const blueprint = JSON.parse(
        await page.locator("#ship-stage").getAttribute("data-blueprint-design"),
      );
      assert.equal(blueprint.model, 3);
      assert.equal(blueprint.module, "hold");
      assert.equal(blueprint.class, "cargo");
      png = await page
        .locator(".blueprint-sheet")
        .evaluate((c) => c.toDataURL());
      await writeFile(
        "test-results/atlas-blueprint-carrier.png",
        Buffer.from(png.split(",")[1], "base64"),
      );
      await page.locator("#save-ship-design").click();
      await page.waitForFunction(() =>
        window.__planets
          .snapshot()
          .state.shipBlueprints.some(
            (s) => s.class === "cargo" && s.model === 3 && s.color === "ochre",
          ),
      );
    }
    await page.locator("#ship-view-model").click();
    await page
      .locator("#ship-stage .shipyard-canvas")
      .waitFor({ state: "visible" });
    await page.locator("#ship-view-blueprint").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#ship-stage").getAttribute("aria-busy") ===
        "false",
    );
    await page.locator("#ship-view-model").click();
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${viewport.width} live model → real five-view blueprint, zoom/pan UI and return`,
    );
    await context.close();
  }
} catch (e) {
  if (current && !current.isClosed())
    await current
      .screenshot({ path: "test-results/atlas-failure.png" })
      .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
