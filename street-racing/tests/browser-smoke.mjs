import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
const page=await browser.newPage({viewport:{width:1100,height:720}});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
const output='test-results';await mkdir(output,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const state=()=>page.evaluate(()=>window.__coastline.snapshot());
try {
  await page.goto(`${url}/?debug=1`);await page.waitForSelector('canvas.game-canvas');await page.waitForTimeout(1800);
  assert.equal(await page.locator('canvas').count(),1);
  const initial=await state();assert(initial.triangles>1000);assert.equal(initial.speed,0);
  await page.screenshot({path:`${output}/desktop.png`});
  const barriers=await page.evaluate(async()=>{
    const [{CoastalTrack},{CarPhysics,IDLE},{resolveBarriers},{CAR}]=await Promise.all([
      import('/src/tracks/CoastalTrack.ts'),import('/src/physics/CarPhysics.ts'),import('/src/physics/Collision.ts'),import('/src/vehicles/CarConfig.ts')]);
    const track=new CoastalTrack();let contacts=0,maxPenetration=0;
    for(const index of [0,52,140,225,327,421])for(const side of [-1,1]){
      const car=new CarPhysics(),p=track.point(index);car.reset(p.x,p.z,Math.atan2(p.nz*side,p.nx*side));car.vx=40;
      for(let i=0;i<120;i++){
        car.step(IDLE,1/60);if(resolveBarriers(car,track)>0)contacts++;
        for(const along of [-CAR.length/2+CAR.width/2,0,CAR.length/2-CAR.width/2]){
          const n=track.nearest(car.x+Math.cos(car.heading)*along,car.z+Math.sin(car.heading)*along);
          maxPenetration=Math.max(maxPenetration,Math.abs(n.offset)+CAR.width/2-track.barrierOffset);
        }
      }
    }
    return {contacts,maxPenetration};
  });
  assert(barriers.contacts>=12,'collisions exercised on both sides of six actual track bends');
  assert(barriers.maxPenetration<0.03,`track barriers contain capsule; penetration ${barriers.maxPenetration}`);
  console.log('Track collisions:',JSON.stringify(barriers));
  await page.keyboard.down('w');await page.waitForFunction(()=>window.__coastline.snapshot().speed>10,{},{timeout:60000});
  const moving=await state();assert(moving.speed>5,'W accelerates');assert(moving.x>initial.x+3,'car moves through scene');
  await page.keyboard.down('d');await page.keyboard.down('Space');await page.waitForFunction(()=>Math.abs(window.__coastline.snapshot().slip)>0.22&&window.__coastline.snapshot().score>0,{},{timeout:30000});
  const drift=await state();assert(drift.rearGrip<0.5,'handbrake lowers rear grip');assert(Math.abs(drift.slip)>0.1,'physical lateral slip');
  assert(drift.smokeParticles>0&&drift.skidSegments>0&&drift.score>0,'physical sliding produces smoke, rubber marks and points');
  await page.screenshot({path:`${output}/drift.png`});
  await page.keyboard.up('Space');await page.keyboard.up('d');await page.keyboard.up('w');
  await page.waitForFunction(()=>window.__coastline.snapshot().rearGrip>0.9,{},{timeout:30000});assert((await state()).rearGrip>drift.rearGrip,'grip recovers');
  await page.keyboard.press('r');await page.waitForTimeout(100);assert((await state()).speed<0.1,'R resets car');
  await page.keyboard.press('c');await page.keyboard.press('Escape');await page.waitForTimeout(100);assert((await state()).paused,'pause works');
  await page.locator('#resume').click();await page.waitForTimeout(100);assert(!(await state()).paused,'resume works');
  await page.keyboard.down('w');await page.waitForFunction(()=>window.__coastline.snapshot().speed>6,{},{timeout:60000});await page.keyboard.up('w');const coastBefore=await state();await page.waitForTimeout(1000);const coastAfter=await state();assert(coastAfter.speed<coastBefore.speed&&coastAfter.speed>coastBefore.speed*0.8,'coasting inertia');
  await page.keyboard.down('s');await page.waitForFunction(speed=>window.__coastline.snapshot().speed<speed-1,coastAfter.speed,{timeout:30000});await page.keyboard.up('s');assert((await state()).speed<coastAfter.speed,'S brakes');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(100);assert((await state()).paused,'focus loss pauses');
  await page.locator('#resume').click();
  console.log('Desktop:',JSON.stringify({initial,moving,drift,errors}));
  await page.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(`${url}/?debug=1`);await phone.waitForSelector('canvas.game-canvas');await phone.waitForTimeout(800);
  await phone.screenshot({path:`${output}/mobile.png`});
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
  const client=await mobile.newCDPSession(phone);
  const center=async control=>{const b=await phone.locator(`[data-control="${control}"]`).boundingBox();assert(b);return {x:b.x+b.width/2,y:b.y+b.height/2};};
  const gas=await center('gas'),right=await center('right'),handbrake=await center('drift');
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...gas,id:1}]});await phone.waitForFunction(()=>window.__coastline.snapshot().speed>7,{},{timeout:60000});
  assert((await phone.evaluate(()=>window.__coastline.snapshot())).speed>3,'touch gas accelerates');
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...gas,id:1},{...right,id:2},{...handbrake,id:3}]});await phone.waitForFunction(()=>window.__coastline.snapshot().rearGrip<0.5&&window.__coastline.snapshot().steer>0.1,{},{timeout:30000});
  const multi=await phone.evaluate(()=>window.__coastline.snapshot());assert(multi.rearGrip<0.5&&multi.steer>0.1,'three simultaneous touches');
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await phone.waitForTimeout(500);assert.equal(await phone.locator('.pressed').count(),0,'touch release clears controls');
  await phone.setViewportSize({width:844,height:390});await phone.waitForTimeout(500);await phone.screenshot({path:`${output}/mobile-landscape.png`});
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('Mobile multitouch:',JSON.stringify(multi));assert.deepEqual(errors,[],'no browser errors');
  console.log('Browser smoke passed: 3D rendering, keyboard, drift, inertia, braking, reset, camera, pause, touch, resize.');
} finally {await browser.close();}
