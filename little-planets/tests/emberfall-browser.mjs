import { chromium } from "@playwright/test";
import { createServer, request } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";

const root = mkdtempSync(join(tmpdir(), "emberfall-browser-"));
const app = await createApp({
  botToken: "synthetic-emberfall-test-token",
  databasePath: join(root, "game.sqlite"),
  staticRoot: resolve("dist"),
});
await app.listen({ host: "127.0.0.1", port: 0 });
const proxy = createServer((req, res) => {
  if (!req.url.startsWith("/planets/")) {
    res.writeHead(404).end();
    return;
  }
  const forward = request(
    {
      hostname: "127.0.0.1",
      port: app.server.address().port,
      path: req.url.slice("/planets".length),
      method: req.method,
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  forward.on("error", () => res.writeHead(502).end());
  req.pipe(forward);
});
await new Promise((done) => proxy.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${proxy.address().port}/planets/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
mkdirSync("docs/screenshots/emberfall", { recursive: true });
mkdirSync("test-results", { recursive: true });
const report = [];
let page;
try {
  for (const [i, viewport] of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ].entries()) {
    const context = await browser.newContext({
      viewport,
      hasTouch: i > 0,
      isMobile: i > 0,
      reducedMotion: "reduce",
    });
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => !!window.emberfall);
    assert.equal(await page.title(), "EMBERFALL — Пепел и золото");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.evaluate(() => {
      localStorage.setItem("little-planets-legacy-fixture", "preserve-me");
    });

    const before = await page.evaluate(() => window.emberfall.game.save.x);
    if (i === 0) {
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(180);
      await page.keyboard.up("KeyD");
    } else {
      const b = await page.locator("#joystick").boundingBox();
      const touch = await context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: b.x + b.width * 0.8, y: b.y + b.height / 2, id: 1 }],
      });
      await page.waitForTimeout(180);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
    }
    const after = await page.evaluate(() => window.emberfall.game.save.x);
    assert.ok(
      after - before > 8,
      `movement failed at ${viewport.width}: ${after - before}`,
    );
    await page.waitForTimeout(90);
    assert.ok(
      Math.abs(
        (await page.evaluate(() => window.emberfall.game.save.x)) - after,
      ) < 2,
      "release stops immediately",
    );
    await page.evaluate(() => {
      window.emberfall.game.save.x = 14.5 * 32;
      window.emberfall.game.save.y = 19.5 * 32;
      window.emberfall.game.dungeon.enemies.forEach((e) => {
        e.cooldown = 10;
      });
    });
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: `docs/screenshots/emberfall/${i === 0 ? "desktop" : i === 1 ? "phone-portrait" : "phone-landscape"}.png`,
    });

    if (i > 0) await page.locator('[data-action="bag"]').click();
    await page.locator(".ef-item-detail [data-equip]").click();
    const equipped = await page.evaluate(
      () => window.emberfall.game.save.equipment.weapon.id,
    );
    assert.equal(
      await page.evaluate(
        () => window.emberfall.game.save.equipment.weapon.rarity,
      ),
      "epic",
    );
    await page.locator('[data-tab="stats"]').click();
    assert.ok(
      await page.getByText("Древо талантов", { exact: true }).isVisible(),
    );
    await page.locator('[data-tab="quests"]').click();
    assert.equal(await page.locator(".ef-quest-card").count(), 3);
    await page.locator('[data-tab="bag"]').click();
    await page.screenshot({
      path: `docs/screenshots/emberfall/${i === 0 ? "desktop" : i === 1 ? "phone-portrait" : "phone-landscape"}-inventory.png`,
    });
    if (i > 0) await page.locator('[data-action="close-drawer"]').click();
    await page.reload();
    await page.waitForFunction(() => !!window.emberfall);
    assert.equal(
      await page.evaluate(() => window.emberfall.game.save.equipment.weapon.id),
      equipped,
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("little-planets-legacy-fixture"),
      ),
      "preserve-me",
    );

    await page.locator(".ef-depth").click();
    assert.ok(
      await page.getByRole("heading", { name: "Атлас глубин" }).isVisible(),
    );
    assert.equal(await page.evaluate(() => window.emberfall.game.paused), true);
    await page.screenshot({
      path: `docs/screenshots/emberfall/${i === 0 ? "desktop" : i === 1 ? "phone-portrait" : "phone-landscape"}-atlas.png`,
    });
    await page.locator('[data-action="close-modal"]').click();

    // Position fixtures shorten traversal; all attacks, rewards and UI actions use the real game.
    await page.evaluate(() => {
      const g = window.emberfall.game,
        e = g.dungeon.enemies[0];
      g.save.x = e.x - 32;
      g.save.y = e.y;
      g.save.hp = 120;
    });
    if (i === 0) {
      await page.keyboard.down("Space");
      await page.waitForTimeout(1500);
      await page.keyboard.up("Space");
    } else {
      const b = await page.locator('[data-action="attack"]').boundingBox();
      const touch = await context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 }],
      });
      await page.waitForTimeout(1600);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
    }
    assert.equal(
      await page.evaluate(() => window.emberfall.game.dungeon.enemies[0].dead),
      true,
      "visible attack kills a real enemy",
    );

    await page.evaluate(() => {
      const g = window.emberfall.game,
        p = g.dungeon.props.find((p) => p.type === "chest");
      g.save.x = p.x;
      g.save.y = p.y;
    });
    await page.locator('[data-action="interact"]').click();
    assert.equal(
      await page.evaluate(() => window.emberfall.game.save.quests[1].progress),
      1,
    );
    await page.evaluate(() => {
      const g = window.emberfall.game,
        p = g.dungeon.props.find((p) => p.type === "merchant");
      g.save.x = p.x;
      g.save.y = p.y;
    });
    await page.locator('[data-action="interact"]').click();
    assert.ok(
      await page.getByRole("heading", { name: "Лавка Морвина" }).isVisible(),
    );
    const potions = await page.evaluate(
      () => window.emberfall.game.save.potions,
    );
    await page.locator('[data-action="buy-potion"]').click();
    assert.equal(
      await page.evaluate(() => window.emberfall.game.save.potions),
      potions + 1,
    );
    await page.locator('[data-action="close-modal"]').click();

    if (i === 0) {
      await page.locator('[data-action="classes"]').click();
      await page.locator('[data-cls="mage"]').click();
      assert.equal(
        await page.evaluate(() => window.emberfall.game.save.heroClass),
        "mage",
      );
      await page.evaluate(() => {
        const g = window.emberfall.game,
          e = g.dungeon.enemies[1];
        g.save.x = e.x - 70;
        g.save.y = e.y + 8;
      });
      const hp = await page.evaluate(
        () => window.emberfall.game.dungeon.enemies[1].hp,
      );
      await page.locator('[data-action="attack"]').click();
      await page.waitForTimeout(350);
      assert.ok(
        (await page.evaluate(
          () => window.emberfall.game.dungeon.enemies[1].hp,
        )) < hp,
        "mage projectile deals damage",
      );
      await page.locator('[data-action="skill"]').click();
      assert.ok(
        (await page.evaluate(() => window.emberfall.game.save.mana)) < 100,
      );
      await page.locator('[data-action="classes"]').click();
      await page.screenshot({ path: "docs/screenshots/emberfall/classes.png" });
      await page.locator('[data-cls="knight"]').click();
      const frames = await page.evaluate(async () => {
        const samples = [];
        await new Promise((done) => {
          let last = performance.now();
          function sample(t) {
            samples.push(t - last);
            last = t;
            if (samples.length < 90) requestAnimationFrame(sample);
            else done();
          }
          requestAnimationFrame(sample);
        });
        return samples.slice(1);
      });
      report.push({
        frameMedianMs: [...frames].sort((a, b) => a - b)[
          Math.floor(frames.length / 2)
        ],
        frameP95Ms: [...frames].sort((a, b) => a - b)[
          Math.floor(frames.length * 0.95)
        ],
      });
    }
    assert.deepEqual(errors, []);
    report.push({
      viewport,
      checks: [
        "movement",
        "release",
        "equipment",
        "reload",
        "quests",
        "talents",
        "atlas",
        "combat",
        "chest",
        "merchant",
        "legacy-save-preserved",
      ],
      errors,
    });
    console.log("PASS", JSON.stringify(viewport));
    await context.close();
    page = undefined;
  }
  writeFileSync(
    "test-results/emberfall-browser.json",
    JSON.stringify(report, null, 2),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: "test-results/emberfall-failure.png" })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => proxy.close(done));
  await app.close();
  rmSync(root, { recursive: true, force: true });
}
