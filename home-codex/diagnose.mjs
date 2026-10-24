// Read-only diagnostics: no polling updates, sending messages, running tasks or changing pairing.
import {readFileSync,existsSync} from 'node:fs';
import {homedir,userInfo} from 'node:os';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
export function sanitizeDiagnostic(text,token=''){let s=String(text);if(token)s=s.replaceAll(token,'[BOT_TOKEN]');return s.replace(/\b\d{6,15}:[A-Za-z0-9_-]{20,}\b/g,'[BOT_TOKEN]').replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_.-]{30,})\b/g,'[SECRET]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [SECRET]');}
export async function diagnose({home=homedir(),fetcher=fetch,task=null,offline=false}={}){
 const report={node:process.version,linuxUser:userInfo().username,configExists:false,projectExists:false,databaseExists:false,paired:false,pairCodeExpired:null,bot:null,telegram:null,webhookConfigured:null,pendingUpdates:null,jobs:[]};
 const configPath=join(home,'.config/home-codex/config.json');report.configExists=existsSync(configPath);if(!report.configExists)return report;
 let config;try{config=JSON.parse(readFileSync(configPath,'utf8'));}catch{report.configError='Cannot parse local config; no file content is printed.';return report;}
 report.projectExists=typeof config.project==='string'&&existsSync(config.project);
 if(typeof config.state==='string'){
  const file=join(config.state,'queue.sqlite');report.databaseExists=existsSync(file);
  if(Number.isSafeInteger(task)&&task>0){const log=join(config.state,'tasks',String(task),'process.log');report.task=task;report.taskLog=existsSync(log)?sanitizeDiagnostic(readFileSync(log,'utf8'),config.token).slice(-16000):'Log file not found.';}
  if(report.databaseExists){let db;try{db=new DatabaseSync(file,{readOnly:true});const setting=key=>db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;report.paired=!!setting('owner');report.pairCodeExpired=report.paired?null:Number(setting('pairUntil')??0)<Date.now();report.jobs=db.prepare('SELECT state,COUNT(*) AS count FROM jobs GROUP BY state').all().map(row=>({state:row.state,count:Number(row.count)}));}catch{report.databaseError='Cannot read local queue.';}finally{db?.close();}}
 }
 if(offline)return report;
 if(typeof config.token!=='string'||!/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(config.token)){report.telegram='invalid-token-format';return report;}
 for(const method of ['getMe','getWebhookInfo']){
  try{
   const response=await fetcher(`https://api.telegram.org/bot${config.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)});
   const data=await response.json();if(!response.ok||!data.ok){report.telegram=data.error_code===401?'invalid-token':`api-error-${Number(data.error_code)||response.status}`;break;}
   if(method==='getMe')report.bot=typeof data.result?.username==='string'&&/^[A-Za-z0-9_]{5,32}$/.test(data.result.username)?`@${data.result.username}`:null;
   else{report.webhookConfigured=!!data.result?.url;report.pendingUpdates=Number(data.result?.pending_update_count??0);report.telegram='reachable';}
  }catch(error){report.telegram=error?.name==='TimeoutError'?'timeout':'network-error';break;}
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const index=process.argv.indexOf('--task'),task=index>=0?Number(process.argv[index+1]):null;console.log(JSON.stringify(await diagnose({task,offline:process.argv.includes('--offline')}),null,2));}
