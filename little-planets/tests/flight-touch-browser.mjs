import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { newGame } from "../shared/model.ts";
import { beginFlight } from "../shared/space.ts";
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
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 0.5,
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const save = newGame(Date.now());
  save.position = { x: 21, z: 23 };
  save.flight = beginFlight("home", "orbis", save.discovered, Date.now());
  await page.addInitScript({
    content: `localStorage.setItem('little-planets-v4',${JSON.stringify(JSON.stringify(save))});`,
  });
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/?mode=colony&debug=1",
  );
  await page.waitForSelector("#space-hud:not(.hidden)");
  const cdp = await context.newCDPSession(page),
    stick = await page.locator("#joystick").boundingBox(),
    pitch = await page.locator("#flight-up").boundingBox();
  const layout = await page.evaluate(() => {
    const r = [
      ".space-hud>header",
      ".flight-thrust",
      ".flight-actions",
      "#joystick",
    ].map((s) => document.querySelector(s).getBoundingClientRect());
    return (
      r.every(
        (b) =>
          b.x >= 0 &&
          b.y >= 0 &&
          b.right <= innerWidth &&
          b.bottom <= innerHeight,
      ) &&
      document.documentElement.scrollWidth === innerWidth &&
      !r.some((a, i) =>
        r
          .slice(i + 1)
          .some(
            (b) =>
              Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
              Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top),
          ),
      )
    );
  });
  assert(layout);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height * 0.2 },
      { id: 2, x: pitch.x + pitch.width / 2, y: pitch.y + pitch.height / 2 },
    ],
  });
  await page.waitForFunction(
    () => {
      const s = window.__planets.snapshot().space;
      return (
        s.flight.distance > 8 && s.flight.forward.z > 0.2 && s.landing.speed > 5
      );
    },
    {},
    { timeout: 30000 },
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  // Allow the last acknowledged command to reconcile before checking release.
  await page.waitForTimeout(700);
  const before = await page.evaluate(
    () => window.__planets.snapshot().space.flight.forward,
  );
  await page.waitForTimeout(600);
  const after = await page.evaluate(
    () => window.__planets.snapshot().space.flight.forward,
  );
  assert(before.x * after.x + before.y * after.y + before.z * after.z > 0.999);
  await page.screenshot({
    path: "test-results/odyssey-flight-touch-portrait.png",
  });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: portrait cockpit bounds, simultaneous touch thrust and pitch, independent pointer capture and released controls.",
  );
} finally {
  await browser.close();
}
