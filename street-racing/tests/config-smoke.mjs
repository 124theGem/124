import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Serve a copy of the production build, then edit JSON alone: no Vite or rebuild.
const root=await mkdtemp(join(tmpdir(),'coastline-config-'));
await cp('dist',root,{recursive:true});
const configPath=join(root,'car-config.json');
const html=await readFile(join(root,'index.html'),'utf8');
const asset=html.match(/src="\.\/(assets\/[^\"]+\.js)"/)[1];
const assetHash=async()=>createHash('sha256').update(await readFile(join(root,asset))).digest('hex');
const originalHash=await assetHash();
const configRequests=[];
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const suffix=pathname.replace(/^\/racing\//,'')||'index.html';
  const file=resolve(root,suffix);
  if(!pathname.startsWith('/racing/')||!file.startsWith(root+sep)){res.writeHead(404);res.end();return;}
  if(suffix==='car-config.json') configRequests.push(req.headers['cache-control']);
  try{
    const body=await readFile(file);
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[extname(file)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/racing/?debug=1`;
  const state=()=>page.evaluate(()=>window.__coastline.snapshot().carConfig);
  await page.goto(url);await page.waitForSelector('canvas.game-canvas');
  assert.equal((await state()).maxSteerDegrees,36);
  const json=JSON.parse(await readFile(configPath,'utf8'));
  Object.assign(json,{maxSpeedKmh:144,maxSteerDegrees:44,asphaltGrip:3.1,mass:1400});
  await writeFile(configPath,JSON.stringify(json));
  await page.reload();await page.waitForSelector('canvas.game-canvas');
  const changed=await state();
  assert.equal(changed.maxSpeedKmh,144);assert(Math.abs(changed.maxSteerDegrees-44)<1e-9);
  assert.equal(changed.asphaltGrip,3.1);assert.equal(changed.mass,1400);
  assert.match(await page.locator('.bottom-note').textContent(),/1\s*400/);
  assert.equal(await assetHash(),originalHash,'production JavaScript stayed byte-identical');
  json.asphaltGrip=-1;await writeFile(configPath,JSON.stringify(json));
  await page.reload();await page.waitForSelector('canvas.game-canvas');
  assert.equal((await state()).mass,1250,'invalid tune rejects every override');
  assert.equal((await state()).asphaltGrip,2.6);
  assert.match(await page.locator('#toast').textContent(),/Использованы базовые значения/);
  assert.equal(configRequests.length,3);assert(configRequests.every(header=>header?.includes('no-cache')),'fresh configuration requested on every open');
  assert.deepEqual(errors,[]);
  console.log('PASS: built game loads external JSON under /racing/, edits apply on reload without rebuilding JS, HUD uses tuned mass, invalid settings safely fall back.');
}finally{
  await browser.close();await new Promise(done=>server.close(done));await rm(root,{recursive:true,force:true});
}
