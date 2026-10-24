import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { chromium } from '@playwright/test';
import { createApp } from '../server/app.ts';

const app = await createApp({ botToken: 'integration-test-fixture', databasePath: ':memory:' });
await app.listen({ host: '127.0.0.1', port: 0 });
const backendPort = app.server.address().port;
const proxy = createServer((req, res) => {
  if (!req.url?.startsWith('/planets/')) { res.writeHead(404); res.end(); return; }
  const forward = request({ hostname:'127.0.0.1', port:backendPort, path:req.url.slice('/planets'.length), method:req.method, headers:req.headers }, upstream => { res.writeHead(upstream.statusCode,upstream.headers); upstream.pipe(res); });
  forward.on('error',()=>{res.writeHead(502);res.end();});req.pipe(forward);
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${proxy.address().port}/planets/`;
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium', args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  assert.equal((await fetch(base+'api/health')).status,200);
  assert.equal((await fetch(base+'api/state')).status,401);
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  const page=await context.newPage(),errors=[],failedAssets=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)failedAssets.push(response.url());});
  await page.goto(base);await page.waitForSelector('[data-action="start"]',{timeout:90000});
  assert.equal(await page.title(),'RAID & SIEGE · Забытые руины');
  assert.equal(await page.evaluate(()=>typeof window.__raid),'undefined');
  await page.locator('[data-action="start"]').tap();await page.waitForSelector('.battle-hud',{timeout:60000});
  await page.locator('[data-skill="2"]').tap();await page.waitForSelector('[data-skill="2"].on-cooldown',{timeout:15000});
  await page.locator('[data-action="pause"]').tap();await page.waitForSelector('[data-action="resume"]');
  assert.equal(await page.locator('.dev-hotspot').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  await context.close();
  console.log('PASS: /planets/ models/fonts, real combat, pause, existing API, production restrictions.');

  const telegram=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  await telegram.addInitScript(()=>{
    window.nativeEvents=[];
    window.TelegramWebviewProxy={postEvent(type,json){
      window.nativeEvents.push(type);
      const reply=(eventType,eventData)=>queueMicrotask(()=>window.dispatchEvent(new MessageEvent('message',{source:window.parent,data:JSON.stringify({eventType,eventData})})));
      if(type==='web_app_request_viewport'||type==='web_app_expand')reply('viewport_changed',{height:innerHeight,width:innerWidth,is_state_stable:true,is_expanded:true});
      if(type==='web_app_request_safe_area')reply('safe_area_changed',{top:0,bottom:0,left:0,right:0});
      if(type==='web_app_request_content_safe_area')reply('content_safe_area_changed',{top:0,bottom:0,left:0,right:0});
      if(type==='web_app_request_theme')reply('theme_changed',{theme_params:{bg_color:'#101b22',button_color:'#d9bd84'}});
      if(type==='web_app_request_fullscreen')reply('fullscreen_changed',{is_fullscreen:true});
    }};
  });
  const tg=await telegram.newPage(),tgErrors=[];tg.on('pageerror',error=>tgErrors.push(error.message));
  const hash=new URLSearchParams({tgWebAppVersion:'8.0',tgWebAppPlatform:'android',tgWebAppThemeParams:JSON.stringify({bg_color:'#101b22',button_color:'#d9bd84'})});
  await tg.goto(base+'#'+hash);await tg.waitForSelector('[data-action="start"]',{timeout:90000});
  const events=await tg.evaluate(()=>window.nativeEvents);assert(events.includes('web_app_ready'));assert(events.includes('web_app_expand'));assert(events.includes('web_app_setup_swipe_behavior'));
  await tg.locator('[data-action="start"]').tap();await tg.waitForSelector('.battle-hud',{timeout:60000});
  assert((await tg.evaluate(()=>window.nativeEvents)).includes('web_app_request_fullscreen'));assert.deepEqual(tgErrors,[]);await telegram.close();
  console.log('PASS: mocked Telegram 8.0 SDK ready, viewport, gestures, fullscreen, game startup.');

  const legacy=await browser.newPage();
  await legacy.goto(base+'?mode=emberfall#preserved-launch-data');await legacy.waitForURL(/legacy\.html\?mode=emberfall#preserved-launch-data/,{timeout:30000});
  await legacy.waitForFunction(()=>document.title==='EMBERFALL — Пепел и золото',{timeout:30000});
  for(const mode of ['raid','colony']){
    await legacy.goto(base+'?mode='+mode+'#preserved-launch-data');
    await legacy.waitForURL(new RegExp('legacy\\.html\\?mode='+mode+'#preserved-launch-data'),{timeout:30000});
    assert.equal((await fetch(base+'legacy.html?mode='+mode)).status,200);
  }
  await legacy.close();console.log('PASS: Emberfall boot, all legacy mode routes, Telegram query/hash preservation.');
}finally{
  await browser.close();await new Promise(resolve=>proxy.close(resolve));await app.close();
}
