import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
await mkdir('test-results',{recursive:true});
try {
  for(const version of ['8.0','7.6']){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__nativeEvents=[];
      window.TelegramWebviewProxy={postEvent(type,json){
        window.__nativeEvents.push({type,data:json?JSON.parse(json):{}});
        const reply=(event,data)=>queueMicrotask(()=>window.Telegram.WebView.receiveEvent(event,data));
        if(type==='web_app_request_safe_area')reply('safe_area_changed',{top:24,bottom:18,left:0,right:0});
        if(type==='web_app_request_content_safe_area')reply('content_safe_area_changed',{top:36,bottom:0,left:0,right:0});
        if(type==='web_app_request_fullscreen')reply('fullscreen_changed',{is_fullscreen:true});
        if(type==='web_app_request_viewport'||type==='web_app_expand')reply('viewport_changed',{height:innerHeight,is_state_stable:true,is_expanded:true});
      }};
    });
    const hash=new URLSearchParams({tgWebAppVersion:version,tgWebAppPlatform:'android',tgWebAppData:'query_id=smoke-fixture'});
    await page.goto(`${url}/?debug=1#${hash}`);await page.waitForSelector('canvas.game-canvas');
    await page.waitForFunction(()=>window.__nativeEvents.some(e=>e.type==='web_app_ready'));
    const events=await page.evaluate(()=>window.__nativeEvents);
    assert(events.some(e=>e.type==='web_app_expand'),'expanded viewport');
    if(version==='8.0'){
      await page.waitForFunction(()=>document.documentElement.dataset.fullscreen==='true');
      assert(events.some(e=>e.type==='web_app_request_fullscreen'),'native fullscreen on launch');
      assert(events.some(e=>e.type==='web_app_setup_swipe_behavior'&&e.data.allow_vertical_swipe===false),'vertical swipes disabled');
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-top')),'60px');
      const brand=await page.locator('.brand').boundingBox();assert(brand.y>=60,'HUD clears native top controls');
      const gas=await page.locator('[data-control="gas"]').boundingBox();assert(gas.y+gas.height<=844-18,'pedal clears bottom inset');
      await page.screenshot({path:'test-results/telegram-fullscreen.png'});
      await page.setViewportSize({width:844,height:390});
      await page.evaluate(()=>{
        window.Telegram.WebView.receiveEvent('safe_area_changed',{top:0,bottom:14,left:28,right:28});
        window.Telegram.WebView.receiveEvent('content_safe_area_changed',{top:32,bottom:0,left:0,right:0});
      });
      const left=await page.locator('[data-control="left"]').boundingBox();assert(left.x>=28,'landscape safe area');
      await page.screenshot({path:'test-results/telegram-landscape.png'});
    }else assert(!events.some(e=>e.type==='web_app_request_fullscreen'),'older clients use expansion without unsupported API calls');
    assert.deepEqual(errors,[]);await context.close();console.log(`Telegram ${version}: bridge events, viewport and safe-area checks passed.`);
  }
  const page=await browser.newPage({viewport:{width:900,height:650}});
  await page.goto(url);await page.waitForSelector('#fullscreen');
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
  console.log('Browser fullscreen button enters and exits fullscreen. Native Telegram host was emulated; actual phone verification remains necessary.');
} finally {await browser.close();}
