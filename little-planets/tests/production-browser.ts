import { chromium } from "@playwright/test";
import { createServer, request } from "node:http";
import { createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
const botToken = "123456:production-smoke-test-fixture";
const fields = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: 7654321, first_name: "Browser fixture" }),
  query_id: "smoke",
};
const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
const check = Object.entries(fields)
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");
const initData = new URLSearchParams({
  ...fields,
  hash: createHmac("sha256", secret).update(check).digest("hex"),
}).toString();
const app = await createApp({ botToken, databasePath: ":memory:" });
await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (!address || typeof address === "string") throw new Error("No backend port");
const upstreamPort = address.port;
// Exercise the same prefix stripping used by the documented Caddy handle_path.
const proxy = createServer((req, res) => {
  if (req.url === "/planets") {
    res.writeHead(308, { Location: "/planets/" });
    res.end();
    return;
  }
  if (!req.url?.startsWith("/planets/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const forward = request(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: req.url.slice("/planets".length),
      method: req.method,
      headers: req.headers,
    },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  forward.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(forward);
});
await new Promise<void>((done) => proxy.listen(0, "127.0.0.1", done));
const proxyAddress = proxy.address();
if (!proxyAddress || typeof proxyAddress === "string")
  throw new Error("No proxy port");
const url = `http://127.0.0.1:${proxyAddress.port}/planets/`;
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
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForSelector("#error-message");
  assert.match(
    (await page.locator("#error-message").textContent()) ?? "",
    /через кнопку.*Telegram/,
  );
  assert.equal(await page.locator("canvas").count(), 0);
  await page.close();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await context.newPage(),
    errors: string[] = [];
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.addInitScript({
    content: `
    window.nativeEvents=[];
    window.TelegramWebviewProxy={postEvent(type,json){
      window.nativeEvents.push({type,data:json?JSON.parse(json):{}});
      const reply=(event,data)=>queueMicrotask(()=>window.Telegram.WebView.receiveEvent(event,data));
      if(type==='web_app_request_safe_area')reply('safe_area_changed',{top:24,bottom:18,left:0,right:0});
      if(type==='web_app_request_content_safe_area')reply('content_safe_area_changed',{top:36,bottom:0,left:0,right:0});
      if(type==='web_app_request_fullscreen')reply('fullscreen_changed',{is_fullscreen:true});
      if(type==='web_app_request_viewport'||type==='web_app_expand')reply('viewport_changed',{height:innerHeight,is_state_stable:true,is_expanded:true});
    }};
  `,
  });
  const hash = new URLSearchParams({
    tgWebAppVersion: "8.0",
    tgWebAppPlatform: "android",
    tgWebAppData: initData,
  });
  const gameUrl = `${url}?debug=1#${hash}`;
  await phone.goto(gameUrl);
  await phone.waitForFunction(() =>
    Boolean(
      document.querySelector("canvas") ||
        document.querySelector("#error-message"),
    ),
  );
  if (await phone.locator("#error-message").count())
    throw new Error(
      `Production startup: ${await phone.locator("#error-message").textContent()}; browser errors: ${errors.join("; ")}`,
    );
  await phone.waitForSelector("canvas");
  assert.match(
    (await phone.locator("#save-status").textContent()) ?? "",
    /Telegram/,
  );
  assert.equal(
    await phone.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--tg-top"),
    ),
    "60px",
  );
  assert((await phone.locator(".topbar").boundingBox())!.y >= 60);
  const events = await phone.evaluate(
    () => (window as any).nativeEvents as { type: string }[],
  );
  assert(events.some((e) => e.type === "web_app_request_fullscreen"));
  assert(events.some((e) => e.type === "web_app_ready"));
  assert(events.some((e) => e.type === "web_app_setup_swipe_behavior"));
  await phone.locator("#build").click();
  await phone.locator("#confirm-build").click();
  await phone.waitForFunction(
    () =>
      (window as any).__planets.snapshot().state.worlds.listoria.buildings
        .length === 2 && !(window as any).__planets.snapshot().busy,
    {},
    { timeout: 60000 },
  );
  const persisted = await app.inject({
    url: "/api/state",
    headers: { authorization: `tma ${initData}` },
  });
  assert.equal(persisted.json().state.inventory.wood, 27);
  await phone.goto(gameUrl);
  await phone.waitForSelector("canvas");
  assert.equal(
    await phone.evaluate(
      () =>
        (window as any).__planets.snapshot().state.worlds.listoria.buildings
          .length,
    ),
    2,
  );
  await mkdir("test-results", { recursive: true });
  await phone.screenshot({ path: "test-results/telegram-production.png" });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: production blocks local login; /planets/ HTML/assets/SDK/API; real signed Telegram authentication, SQLite save/reload, native-event fullscreen and safe areas. HTTPS and physical Telegram clients were not exercised.",
  );
} finally {
  await browser.close();
  await new Promise<void>((done) => proxy.close(() => done()));
  await app.close();
}
