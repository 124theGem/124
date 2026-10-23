import {chromium} from "@playwright/test";
import {createHmac} from "node:crypto";
import {createServer,request} from "node:http";
import {mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import assert from "node:assert/strict";
import {createApp} from "../server/app.ts";
const token="synthetic-rift-raid-browser-token";
function signed(id){const fields={auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:"Raider "+id})},text=Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n"),secret=createHmac("sha256","WebAppData").update(token).digest();return new URLSearchParams({...fields,hash:createHmac("sha256",secret).update(text).digest("hex")}).toString();}
const root=mkdtempSync(join(tmpdir(),"rift-browser-")),app=await createApp({botToken:token,databasePath:join(root,"game.sqlite"),staticRoot:resolve("dist"),raidPayments:{botUsername:"RiftFixtureBot"}});
await app.listen({host:"127.0.0.1",port:0});const upstream=app.server.address().port;
const proxy=createServer((req,res)=>{if(!req.url.startsWith("/planets/")){res.writeHead(404);res.end();return;}const forward=request({hostname:"127.0.0.1",port:upstream,path:req.url.slice("/planets".length),method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});forward.on("error",()=>{res.writeHead(502);res.end();});req.pipe(forward);});await new Promise(done=>proxy.listen(0,"127.0.0.1",done));const base=`http://127.0.0.1:${proxy.address().port}/planets/`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",args:["--no-sandbox"]});mkdirSync("docs/screenshots/rift-raid",{recursive:true});let page;
const errors=[];
async function open(viewport,id){const context=await browser.newContext({viewport,deviceScaleFactor:.8,isMobile:viewport.width<900,hasTouch:viewport.width<900}),p=await context.newPage();p.setDefaultTimeout(45000);p.on("pageerror",e=>errors.push(e.message));const hash=new URLSearchParams({tgWebAppVersion:"8.0",tgWebAppPlatform:"android",tgWebAppData:signed(id)});await p.goto(base+`?debug=1#${hash}`);await p.waitForFunction(()=>!!window.__raid?.snapshot());return{context,page:p};}
try{
 for(const[i,viewport]of[{width:1440,height:1000},{width:390,height:844},{width:844,height:390}].entries()){
  const entry=await open(viewport,100+i);page=entry.page;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`docs/screenshots/rift-raid/base-${viewport.width}.png`});
  await page.locator('[data-pane="gear"]').click();await page.locator('[data-upgrade="vitality"]').click();await page.waitForFunction(()=>window.__raid.snapshot().profile.upgrades.vitality===1);
  await page.locator('[data-pane="shop"]').click();await page.locator('[data-skin="mint"]').click();await page.waitForFunction(()=>window.__raid.snapshot().profile.skin==="mint");assert.equal(await page.locator(".rr-stars").count(),0);await page.screenshot({path:`docs/screenshots/rift-raid/shop-${viewport.width}.png`});
  await page.locator('[data-pane="home"]').click();await page.locator("#rr-start").click();await page.waitForFunction(()=>window.__raid.snapshot().room.run?.elapsed>2);
  await page.screenshot({path:`docs/screenshots/rift-raid/raid-${viewport.width}.png`});
  if(i===0){
   const held=new Set();let state;const start=Date.now();
   while(Date.now()-start<100000){
    state=await page.evaluate(()=>window.__raid.snapshot());const pawn=state.room.run.pawns.find(p=>p.id===state.me);if(["dead","extracted"].includes(pawn.state))break;
    if(pawn.choices.length){for(const k of held)await page.keyboard.up(k);held.clear();await page.locator(`[data-perk="${pawn.choices.includes("vitality")?"vitality":pawn.choices[0]}"]`).click();continue;}
    const desired=!pawn.chests?(pawn.z>19?["KeyW"]:["KeyE"]):pawn.z<23?["KeyS"]:["KeyE"];
    for(const k of held)if(!desired.includes(k)){await page.keyboard.up(k);held.delete(k);}for(const k of desired)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}
    await page.waitForTimeout(110);
   }
   for(const k of held)await page.keyboard.up(k);
   await page.locator("#rr-result-home").waitFor();state=await page.evaluate(()=>window.__raid.snapshot());assert.equal(state.profile.lastRun.outcome,"extracted");assert.ok(state.profile.lastRun.loot.scrap>0);assert.ok(state.profile.lastRun.credits>0);
   await page.screenshot({path:"docs/screenshots/rift-raid/extraction.png"});
   await page.locator("#rr-result-home").click();await page.locator('[data-pane="daily"]').click();await page.locator('[data-contract="extracts"]').click();await page.waitForFunction(()=>window.__raid.snapshot().profile.daily.claimed.includes("extracts"));
  }else{
   const stick=await page.locator("#rr-stick").boundingBox();await page.mouse.move(stick.x+stick.width/2,stick.y+stick.height/2);await page.mouse.down();await page.mouse.move(stick.x+stick.width*.8,stick.y+stick.height/2);await page.waitForTimeout(600);await page.mouse.up();
   await page.locator("#rr-quit").click();await page.locator("#rr-quit-confirm").click();await page.waitForFunction(()=>!window.__raid.snapshot().room.run);assert.equal((await page.evaluate(()=>window.__raid.snapshot().profile.upgrades.vitality)),1);
  }
  const credits=await page.evaluate(()=>window.__raid.snapshot().profile.credits);await page.reload();await page.waitForFunction(()=>!!window.__raid?.snapshot());assert.equal(await page.evaluate(()=>window.__raid.snapshot().profile.credits),credits);assert.equal(await page.evaluate(()=>window.__raid.snapshot().profile.skin),"mint");
  await page.locator('[data-pane="season"]').click();await page.screenshot({path:`docs/screenshots/rift-raid/season-${viewport.width}.png`});
  console.log(`PASS ${viewport.width}×${viewport.height}: native SDK authentication and /planets/ proxy, real raid, equipment, skin, persistent balance and mobile controls`);await entry.context.close();page=undefined;
 }
 const first=await open({width:1200,height:800},201),second=await open({width:390,height:844},202);page=first.page;
 const code=await first.page.evaluate(()=>window.__raid.snapshot().room.code);await second.page.locator("#rr-join").click();await second.page.locator('input[name="code"]').fill(code);await second.page.locator('#rr-join-form button').click();
 await second.page.waitForFunction(()=>window.__raid.snapshot().room.members.length===2);await first.page.waitForFunction(()=>window.__raid.snapshot().room.members.length===2);await second.page.locator("#rr-start").click();await second.page.waitForFunction(()=>window.__raid.snapshot().room.members.find(p=>p.id===window.__raid.snapshot().me).ready);
 await first.page.locator("#rr-start").click();await first.page.waitForFunction(()=>window.__raid.snapshot().room.run?.pawns.length===2);await second.page.waitForFunction(()=>window.__raid.snapshot().room.run?.pawns.length===2);
 assert.equal(await first.page.evaluate(()=>window.__raid.snapshot().room.run.id),await second.page.evaluate(()=>window.__raid.snapshot().room.run.id));await first.page.screenshot({path:"docs/screenshots/rift-raid/cooperative.png"});console.log("PASS two authenticated players join by code and share the same live authoritative raid");await first.context.close();await second.context.close();
 assert.deepEqual(errors,[]);
} catch(error){if(page){await page.screenshot({path:"test-results/raid-browser-failure.png"}).catch(()=>{});console.error(JSON.stringify(await page.evaluate(()=>window.__raid?.snapshot()).catch(()=>null)).slice(0,3000));}throw error;}
finally{await browser.close();await new Promise(done=>proxy.close(done));await app.close();rmSync(root,{recursive:true,force:true});}
