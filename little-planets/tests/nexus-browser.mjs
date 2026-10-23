import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { prologueActions } from "./fixtures.ts";
const token = "synthetic-nexus-production-test-token";
function initData(id) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: `Pilot ${id}` }) };
  const data = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(data).digest("hex") }).toString();
}
const root = mkdtempSync(join(tmpdir(), "nexus-browser-"));
const app = await createApp({ botToken: token, databasePath: join(root, "game.sqlite"), staticRoot: resolve("dist") });
await app.listen({ host: "127.0.0.1", port: 8099 });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
mkdirSync("docs/screenshots/nexus", { recursive: true });
mkdirSync("test-results", { recursive: true });
let page;
try {
  for (const [i, viewport] of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}].entries()) {
    const authorization = `tma ${initData(i + 1)}`;
    let saved = (await app.inject({ method: "GET", url: "/api/state", headers: { authorization } })).json();
    for (const action of prologueActions()) {
      const result = await app.inject({ method: "POST", url: "/api/action", headers: { authorization }, payload: { revision: saved.state.revision, action } });
      assert.equal(result.statusCode, 200); saved = result.json();
    }
    const context = await browser.newContext({ viewport, deviceScaleFactor: 0.7, isMobile: viewport.width < 900, hasTouch: viewport.width < 900 });
    page = await context.newPage(); page.setDefaultTimeout(90000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && /WebGL|shader|program/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
      localStorage.setItem("little-planets-quality", "economy");
    });
    const hash = new URLSearchParams({ tgWebAppVersion: "8.0", tgWebAppPlatform: "android", tgWebAppData: initData(i + 1) });
    await page.goto(`http://127.0.0.1:8099/?debug=1#${hash}`);
    await page.waitForFunction(() => window.__nexus?.snapshot().state?.self.world === "hub");
    console.log(`STEP ${viewport.width}: authenticated hub loaded`);
    await page.waitForTimeout(600);
    assert.equal(await page.locator(".nx-brand").innerText().then(t => t.includes("0.17.0")), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `docs/screenshots/nexus/hub-${viewport.width}.png` });
    await page.locator("#nx-wardrobe").click();
    await page.locator("#nx-name").fill("Пилот Нексуса");
    await page.locator('label:has(input[name="color"][value="amber"])').click();
    assert.equal(await page.locator('input[name="color"][value="amber"]').isChecked(), true);
    await page.screenshot({ path: `docs/screenshots/nexus/avatar-${viewport.width}.png` });
    if (process.env.NEXUS_VISUAL_ONLY) { assert.deepEqual(errors, []); console.log(`PASS ${viewport.width}: avatar camera and controls`); await context.close(); page = undefined; continue; }
    await page.locator('.nx-wardrobe button[type="submit"]').click();
    await page.waitForFunction(() => window.__nexus.snapshot().state.profile.color === "amber");
    await page.reload();
    await page.waitForFunction(() => window.__nexus?.snapshot().state?.profile.name === "Пилот Нексуса");
    assert.equal(await page.evaluate(() => window.__nexus.snapshot().state.profile.color), "amber");
    if (viewport.width < 700) await page.locator("#nx-worlds").click();
    await page.locator('[data-portal="race"]').click();
    await page.waitForFunction(() => window.__nexus.snapshot().state?.self.world === "race", { timeout: 120000 });
    console.log(`STEP ${viewport.width}: portal entered race`);
    await page.waitForFunction(() => window.__nexus.snapshot().state.serverTime >= window.__nexus.snapshot().state.self.startedAt);
    await page.screenshot({ path: `docs/screenshots/nexus/race-${viewport.width}.png` });
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => window.__nexus.snapshot().state.self.checkpoint >= 1, { timeout: 90000 });
    await page.keyboard.up("KeyW");
    await page.locator("#nx-worlds").click();
    await page.waitForFunction(() => window.__nexus.snapshot().state.self.world === "hub");
    if (viewport.width < 700) await page.locator("#nx-worlds").click();
    await page.locator('[data-portal="relic"]').click();
    await page.waitForFunction(() => window.__nexus.snapshot().state.self.world === "relic", { timeout: 120000 });
    console.log(`STEP ${viewport.width}: portal entered relic islands`);
    const jump = await page.locator("#nx-jump").boundingBox();
    await page.mouse.move(jump.x + jump.width / 2, jump.y + jump.height / 2); await page.mouse.down();
    await page.waitForFunction(() => window.__nexus.snapshot().predicted.y > 0.3);
    await page.mouse.up();
    await page.screenshot({ path: `docs/screenshots/nexus/relic-${viewport.width}.png` });
    if (i === 0) {
    await page.locator("#nx-colony").click();
    await page.waitForFunction(() => window.__planets?.snapshot().triangles > 1000);
    assert.equal(await page.locator("#return-nexus").count(), 1);
    await page.locator("#return-nexus").click();
    await page.waitForFunction(() => !!window.__nexus?.snapshot().state?.profile);
    }
    assert.equal(await page.evaluate(() => window.__nexus.snapshot().state.profile.color), "amber");
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}×${viewport.height}: actual authenticated production hub, avatar save/reload, portal travel, race checkpoint, island jump${i === 0 ? ", colony and return" : ""}`);
    await context.close(); page = undefined;
  }
} catch (error) {
  if (page) { await page.screenshot({path:"test-results/nexus-failure.png"}).catch(()=>{}); console.error(await page.evaluate(()=>window.__nexus?.snapshot()).catch(()=>null)); }
  throw error;
} finally { await browser.close(); await app.close(); rmSync(root,{recursive:true,force:true}); }
