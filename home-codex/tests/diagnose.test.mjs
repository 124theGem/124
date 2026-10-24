import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {diagnose} from '../diagnose.mjs';
const token='12345678:synthetic_token_that_is_not_a_real_bot_key';
test('diagnostics distinguish missing setup without network access',async()=>{const home=mkdtempSync(join(tmpdir(),'home-doctor-'));try{const report=await diagnose({home,fetcher:()=>{throw Error('unexpected network');}});assert.equal(report.configExists,false);assert.equal(report.paired,false);}finally{rmSync(home,{recursive:true,force:true});}});
test('diagnostics read pairing and queue without changing running work or consuming updates',async()=>{
 const home=mkdtempSync(join(tmpdir(),'home-doctor-'));let db;try{
  const configDir=join(home,'.config/home-codex'),state=join(home,'state');mkdirSync(configDir,{recursive:true});mkdirSync(state);writeFileSync(join(configDir,'config.json'),JSON.stringify({token,state,project:home}));
  db=new DatabaseSync(join(state,'queue.sqlite'));db.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE jobs(state TEXT);INSERT INTO settings VALUES('owner','123456789'),('pair','private-code');INSERT INTO jobs VALUES('running');");
  const calls=[],report=await diagnose({home,fetcher:async url=>{const method=url.split('/').at(-1);calls.push(method);return{ok:true,json:async()=>({ok:true,result:method==='getMe'?{username:'HomeFixtureBot'}:{url:'',pending_update_count:4}})};}});
  assert.equal(report.paired,true);assert.equal(report.bot,'@HomeFixtureBot');assert.equal(report.telegram,'reachable');assert.deepEqual(calls,['getMe','getWebhookInfo']);assert.deepEqual(report.jobs,[{state:'running',count:1}]);assert.equal(db.prepare('SELECT state FROM jobs').get().state,'running');const text=JSON.stringify(report);for(const secret of[token,'123456789','private-code'])assert.ok(!text.includes(secret));
 }finally{db?.close();rmSync(home,{recursive:true,force:true});}
});
test('diagnostics never print raw network exceptions or API descriptions',async()=>{
 const home=mkdtempSync(join(tmpdir(),'home-doctor-'));try{const configDir=join(home,'.config/home-codex');mkdirSync(configDir,{recursive:true});writeFileSync(join(configDir,'config.json'),JSON.stringify({token}));const report=await diagnose({home,fetcher:async()=>{throw Error('private URL '+token);}});assert.equal(report.telegram,'network-error');assert.ok(!JSON.stringify(report).includes(token));}finally{rmSync(home,{recursive:true,force:true});}
});
test('task log diagnostic stays offline and redacts the bot token, OpenAI/GitHub keys and bearer credentials',async()=>{
 const home=mkdtempSync(join(tmpdir(),'home-doctor-log-'));try{const configDir=join(home,'.config/home-codex'),state=join(home,'state'),logs=join(state,'tasks/2');mkdirSync(configDir,{recursive:true});mkdirSync(logs,{recursive:true});writeFileSync(join(configDir,'config.json'),JSON.stringify({token,state}));const key='sk-'+ 'a'.repeat(30),bearer='private-access-token';writeFileSync(join(logs,'process.log'),`argument not supported\n${token}\n${key}\nAuthorization: Bearer ${bearer}`);const report=await diagnose({home,task:2,offline:true,fetcher:()=>{throw Error('must not call network');}});assert.match(report.taskLog,/argument not supported/);for(const secret of[token,key,bearer])assert.ok(!JSON.stringify(report).includes(secret));assert.equal(report.telegram,null);}finally{rmSync(home,{recursive:true,force:true});}
});
