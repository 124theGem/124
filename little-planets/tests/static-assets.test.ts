import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it, expect } from 'vitest';
import { createApp } from '../server/app';

it('public assets survive repeated opens without consuming the protected API rate budget', async () => {
  const directory=mkdtempSync(join(tmpdir(),'raid-static-rate-'));
  mkdirSync(join(directory,'assets'));writeFileSync(join(directory,'index.html'),'<title>Fixture</title>');writeFileSync(join(directory,'assets','game.js'),'export const loaded = true;');
  const app=await createApp({botToken:'static-rate-test-fixture',databasePath:':memory:',staticRoot:directory});
  try{
    for(let i=0;i<200;i++)expect((await app.inject({method:'GET',url:'/assets/game.js'})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/health'})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/state'})).statusCode).toBe(401);
    const statuses:number[]=[];for(let i=0;i<190;i++)statuses.push((await app.inject({method:'GET',url:'/api/health'})).statusCode);
    expect(statuses).toContain(429);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
