import {chromium} from '@playwright/test';
import {createHmac} from 'node:crypto';
import {createServer,request} from 'node:http';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.ts';
const token='synthetic-raid-motion-fixture';
function signed(id){const fields={auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Motion fixture'})},text=Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n'),secret=createHmac('sha256','WebAppData').update(token).digest();return new URLSearchParams({...fields,hash:createHmac('sha256',secret).update(text).digest('hex')}).toString();}
const root=mkdtempSync(join(tmpdir(),'raid-motion-browser-')),app=await createApp({botToken:token,databasePath:join(root,'game.sqlite'),staticRoot:resolve('dist')});
await app.listen({host:'127.0.0.1',port:0});const upstream=app.server.address().port;
let requests=0;const proxy=createServer((req,res)=>{
 if(!req.url.startsWith('/planets/')){res.writeHead(404).end();return;}
 const delayed=req.url.startsWith('/planets/api/raid'),index=++requests;
 const upload=delayed?65+(index%4)*12:0,download=delayed?70+(index%3)*17:0;
 setTimeout(()=>{const forward=request({hostname:'127.0.0.1',port:upstream,path:req.url.slice('/planets'.length),method:req.method,headers:req.headers},response=>setTimeout(()=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);},download));forward.on('error',()=>{res.writeHead(502);res.end();});req.pipe(forward);},upload);
});await new Promise(done=>proxy.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${proxy.address().port}/planets/`,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});mkdirSync('test-results',{recursive:true});let page;
try{
 for(const[i,viewport]of[{width:1280,height:800},{width:390,height:844},{width:844,height:390}].entries()){
  const context=await browser.newContext({viewport,hasTouch:i>0,isMobile:i>0}),p=await context.newPage();page=p;const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const hash=new URLSearchParams({tgWebAppVersion:'8.0',tgWebAppPlatform:'android',tgWebAppData:signed(700+i)});await p.goto(base+`?debug=1#${hash}`);await p.waitForFunction(()=>!!window.__raid?.snapshot());await p.locator('#rr-start').click();await p.waitForFunction(()=>window.__raid.presentation()?.elapsed>0);
  await p.evaluate(()=>{window.motionFrames=[];window.captureMotion=true;function capture(t){const s=window.__raid.snapshot(),v=window.__raid.presentation();if(v&&s?.room.run){const me=v.pawns.find(p=>p.id===s.me);window.motionFrames.push({t,elapsed:s.room.run.elapsed,playhead:v.elapsed,x:me.x,z:me.z,enemies:v.enemies.map(e=>({id:e.id,x:e.x,z:e.z})),bullets:v.bullets.map(b=>({id:b.id,x:b.x,z:b.z,v:Math.hypot(b.vx,b.vz)}))});}if(window.captureMotion)requestAnimationFrame(capture);}requestAnimationFrame(capture);});
  const before=await p.evaluate(()=>({x:window.__raid.presentation().pawns[0].x,serverX:window.__raid.snapshot().room.run.pawns[0].x}));
  if(i===0)await p.keyboard.down('KeyD');else{const b=await p.locator('#rr-stick').boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width*.84,b.y+b.height/2);}
  await p.waitForTimeout(65);const immediate=await p.evaluate(()=>({x:window.__raid.presentation().pawns[0].x,serverX:window.__raid.snapshot().room.run.pawns[0].x}));
  assert.ok(immediate.x-before.x>.08,JSON.stringify({before,immediate}));assert.equal(immediate.serverX,before.serverX,'prediction reacts before the delayed input reaches the server');
  await p.waitForTimeout(650);if(i===0)await p.keyboard.up('KeyD');else await p.mouse.up();
  const released=await p.evaluate(()=>window.__raid.presentation().pawns[0].x);await p.waitForTimeout(65);const stopped=await p.evaluate(()=>window.__raid.presentation().pawns[0].x);assert.ok(Math.abs(stopped-released)<.18,'release stops movement without waiting for a round trip');
  await p.waitForTimeout(5000);await p.evaluate(()=>window.captureMotion=false);const frames=await p.evaluate(()=>window.motionFrames);
  let enemyMoves=0,bulletMoves=0,betweenPackets=0,maxBulletSpeedRatio=0;
  for(let k=1;k<frames.length;k++){
   const a=frames[k-1],b=frames[k],dt=(b.t-a.t)/1000;
   if(a.elapsed===b.elapsed){if(Math.hypot(a.x-b.x,a.z-b.z)>.001)betweenPackets++;for(const enemy of b.enemies){const old=a.enemies.find(e=>e.id===enemy.id);if(old&&Math.hypot(old.x-enemy.x,old.z-enemy.z)>.0001)enemyMoves++;}}
   for(const bullet of b.bullets){const old=a.bullets.find(e=>e.id===bullet.id);if(old){const distance=Math.hypot(old.x-bullet.x,old.z-bullet.z);if(distance>.001){bulletMoves++;maxBulletSpeedRatio=Math.max(maxBulletSpeedRatio,distance/(bullet.v*Math.max(.001,dt)));}}}
  }
  assert.ok(betweenPackets>8,`only ${betweenPackets} player movement frames between network responses`);assert.ok(enemyMoves>30,`only ${enemyMoves} interpolated enemy frames`);assert.ok(bulletMoves>6,`only ${bulletMoves} projectile flight frames`);assert.ok(maxBulletSpeedRatio<1.7,`projectile jumped ${maxBulletSpeedRatio}× real speed`);assert.deepEqual(errors,[]);
  const report={viewport,network:'135–205 ms artificial RTT plus local request/processing time',frames:frames.length,betweenPackets,enemyMoves,bulletMoves,maxBulletSpeedRatio};writeFileSync(`test-results/raid-motion-${viewport.width}.json`,JSON.stringify(report,null,2));await p.screenshot({path:`test-results/raid-motion-${viewport.width}.png`});console.log('PASS',JSON.stringify(report));await context.close();page=undefined;
 }
} catch(error){if(page)await page.screenshot({path:'test-results/raid-motion-failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();await new Promise(done=>proxy.close(done));await app.close();rmSync(root,{recursive:true,force:true});}
