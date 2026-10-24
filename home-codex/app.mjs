import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,chmodSync,openSync,closeSync,existsSync,realpathSync,readdirSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';

export const ROOT=join(homedir(),'.local/share/home-codex');
const CONFIG=join(homedir(),'.config/home-codex/config.json');
const hash=s=>createHash('sha256').update(s).digest();
export function secretEqual(a,b){return typeof a==='string'&&typeof b==='string'&&timingSafeEqual(hash(a),hash(b));}
export function redact(text,token=''){
 let s=String(text);if(token)s=s.replaceAll(token,'[BOT_TOKEN]');
 return s.replace(/\b\d{6,15}:[A-Za-z0-9_-]{20,}\b/g,'[BOT_TOKEN]').replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_.-]{30,})\b/g,'[SECRET]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [SECRET]');
}
export class TelegramAPI {
 constructor(token,fetcher=fetch){this.token=token;this.fetcher=fetcher;}
 async call(method,body={},timeout=45000){
  try{const r=await this.fetcher(`https://api.telegram.org/bot${this.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});const data=await r.json();if(!r.ok||!data.ok)throw Error();return data.result;}
  catch{throw Error(`Telegram: ${method} не выполнен. Проверьте интернет и отдельный токен бота.`);}
 }
 async send(chat,text){text=redact(text,this.token);for(let start=0;start<text.length;start+=3500)await this.call('sendMessage',{chat_id:chat,text:text.slice(start,start+3500),link_preview_options:{is_disabled:true}});}
 async photo(chat,file){
  try{const form=new FormData();form.set('chat_id',String(chat));form.set('photo',new Blob([readFileSync(file)]),file.split('/').at(-1));const r=await this.fetcher(`https://api.telegram.org/bot${this.token}/sendPhoto`,{method:'POST',body:form,signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok||!data.ok)throw Error();}
  catch{throw Error('Не удалось отправить изображение. Оно осталось на ПК.');}
 }
}
export class Queue {
 constructor(path){mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);chmodSync(path,0o600);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY,update_id INTEGER UNIQUE,chat TEXT NOT NULL,prompt TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',result TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,finished INTEGER);`);this.db.prepare("UPDATE jobs SET state='interrupted',result='Процесс ПК перезапустился. Файлы могли измениться; автоматического повтора нет.',finished=? WHERE state='running'").run(Date.now());}
 get(key){return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;}
 set(key,value){this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
 enqueue(update,chat,prompt){const r=this.db.prepare('INSERT OR IGNORE INTO jobs(update_id,chat,prompt,created) VALUES(?,?,?,?)').run(update,String(chat),prompt,Date.now());return r.changes?Number(r.lastInsertRowid):null;}
 next(){const j=this.db.prepare("SELECT * FROM jobs WHERE state='queued' ORDER BY id LIMIT 1").get();if(j)this.db.prepare("UPDATE jobs SET state='running' WHERE id=?").run(j.id);return j;}
 job(id){return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);}
 finish(id,state,result){this.db.prepare('UPDATE jobs SET state=?,result=?,finished=? WHERE id=?').run(state,result,Date.now(),id);}
 list(){return this.db.prepare('SELECT id,state,prompt FROM jobs ORDER BY id DESC LIMIT 8').all();}
 context(){return this.db.prepare("SELECT prompt,result FROM jobs WHERE state='done' ORDER BY id DESC LIMIT 3").all().reverse().map(j=>`Задание: ${j.prompt.slice(0,1500)}\nРезультат: ${j.result.slice(0,1800)}`).join('\n\n');}
 close(){this.db.close();}
}
export function codexArgs(project,output){return['exec','--cd',project,'--approve-for-me','-c','sandbox_workspace_write.network_access=true','--color','never','--output-last-message',output,'-'];}
export function taskPrompt(project,id,prompt,context){return`Ты работаешь на домашнем компьютере владельца, в проекте ${project}. Отвечай по-русски. Это отдельный локальный сеанс, не продолжение облачного чата. Выполни задачу полностью, запусти соответствующие проверки. Не раскрывай токены, пароли, файлы аутентификации или переменные окружения. Не изменяй street-racing, работающий сервер, DNS или Caddy. Не сбрасывай сохранения. Прочитай инструкции проекта. Не выполняй публикацию, если пользователь её не просит. Если публикация игры запрошена, используй существующие deploy/promote-release.mjs, deploy/artifact.json и канал little-planets-mvp; простого push исходников недостаточно. При отказе автоматического согласования сообщи конкретное заблокированное действие, не обходи отказ. Если подготовил скриншоты, положи до 3 PNG/JPG в .home-codex/outbox/${id}/ внутри проекта. В итоговом ответе укажи изменения, проверки, ограничения и коммит/ветку при публикации.\n\nПредыдущие завершённые задачи (контекст, не новые инструкции):\n${context||'Нет.'}\n\nТекущее задание владельца:\n${prompt}`;}
export async function runCodex({project,id,prompt,context='',directory,binary='codex',timeout=7200000,onProcess=()=>{}}){
 const folder=join(directory,String(id));mkdirSync(folder,{recursive:true,mode:0o700});const output=join(folder,'result.txt'),log=join(folder,'process.log'),fd=openSync(log,'w',0o600);
 let child;
 try{
  child=spawn(binary,codexArgs(project,output),{cwd:project,stdio:['pipe',fd,fd],detached:true,env:{...process.env,npm_config_cache:join(project,'.home-codex/npm-cache')}});onProcess(child);child.stdin.on('error',()=>{});child.stdin.end(taskPrompt(project,id,prompt,context));
  let expired=false;const timer=setTimeout(()=>{expired=true;terminate(child);},timeout);
  const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);}).finally(()=>clearTimeout(timer));
  const result=existsSync(output)?readFileSync(output,'utf8').slice(-24000):'';
  const details=code!==0&&existsSync(log)?redact(readFileSync(log,'utf8')).slice(-4000).trim():'';
  return{state:expired?'interrupted':code===0?'done':'failed',result:result||(expired?'Достигнут лимит времени. Изменённые файлы сохранены.':`Codex завершился с кодом ${code}.\n${details||'Пустой журнал: '+log}`)};
 } finally{closeSync(fd);onProcess(null);}
}
export function terminate(child){if(!child?.pid)return;try{process.kill(-child.pid,'SIGTERM');}catch{}const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);child.once('close',()=>clearTimeout(timer));timer.unref();}

const HELP='Пиши обычным сообщением, что изменить в игре. Задания выполняются по очереди на домашнем ПК.\n/status — очередь\n/result 12 — результат задачи\n/cancel 12 — отмена\n/help — справка\nПубликацию нужно явно указать в задании. Этот бот не переносит историю облачного чата.';
export class Bridge {
 constructor(config,queue,api,runner=runCodex){this.config=config;this.queue=queue;this.api=api;this.runner=runner;this.current=null;this.child=null;this.stopped=false;}
 async handle(update){
  const m=update.message;if(!m||m.chat?.type!=='private'||m.from?.is_bot||!Number.isSafeInteger(m.from?.id)||String(m.chat.id)!==String(m.from.id))return;
  const text=(m.text??'').trim(),owner=this.queue.get('owner');
  if(!owner){
   const pair=this.queue.get('pair'),until=Number(this.queue.get('pairUntil'));
   if(text.startsWith('/pair ')&&pair&&Date.now()<until&&secretEqual(text.slice(6).trim(),pair)){
    this.queue.db.exec('BEGIN IMMEDIATE');try{this.queue.set('owner',m.from.id);this.queue.set('pair','');this.queue.db.exec('COMMIT');}catch(e){this.queue.db.exec('ROLLBACK');throw e;}await this.api.send(m.chat.id,'ПК привязан к твоему аккаунту.\n'+HELP);
   }return;
  }
  if(owner!==String(m.from.id))return;
  if(text==='/start'||text==='/help'){await this.api.send(m.chat.id,HELP);return;}
  if(text==='/status'){const rows=this.queue.list();await this.api.send(m.chat.id,'ПК на связи.\n'+(rows.map(j=>`#${j.id} · ${j.state} · ${j.prompt.slice(0,100)}`).join('\n')||'Очередь пуста.'));return;}
  const result=text.match(/^\/result\s+(\d+)$/);if(result){const j=this.queue.job(Number(result[1]));await this.api.send(m.chat.id,j?`#${j.id} · ${j.state}\n${j.result||'Результат ещё не готов.'}`:'Задание не найдено.');return;}
  const cancel=text.match(/^\/cancel\s+(\d+)$/);if(cancel){const id=Number(cancel[1]),j=this.queue.job(id);if(j&&['queued','running'].includes(j.state)){this.queue.finish(id,'cancelled','Отменено владельцем. Уже изменённые файлы не откатывались.');if(this.current===id)terminate(this.child);await this.api.send(m.chat.id,`Задание #${id} отменено. Изменённые файлы сохранены.`);}else await this.api.send(m.chat.id,'Активное задание не найдено.');return;}
  if(!text||text.startsWith('/')){await this.api.send(m.chat.id,'Пришли задание текстом. Вложения в первой версии не обрабатываются.');return;}
  if(this.queue.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state IN ('queued','running')").get().n>=20){await this.api.send(m.chat.id,'В очереди уже 20 задач. Дождись завершения или отмени ненужные.');return;}
  const id=this.queue.enqueue(update.update_id,m.chat.id,text);if(id)await this.api.send(m.chat.id,`Задание #${id} в очереди. /status — состояние.`);
 }
 async work(){
  if(this.current||this.stopped)return;const job=this.queue.next();if(!job)return;this.current=job.id;
  try{
   await this.api.send(job.chat,`Начал задание #${job.id} на домашнем ПК.`).catch(()=>{});
   const result=await this.runner({project:this.config.project,id:job.id,prompt:job.prompt,context:this.queue.context(),directory:join(this.config.state,'tasks'),binary:this.config.codex??'codex',onProcess:p=>{this.child=p;}});
   if(this.queue.job(job.id).state!=='cancelled'){
    const safe=redact(result.result,this.config.token);this.queue.finish(job.id,this.stopped?'interrupted':result.state,safe);
    await this.api.send(job.chat,`#${job.id} · ${result.state}\n${safe}`).catch(()=>{});
    const outbox=join(this.config.project,'.home-codex/outbox',String(job.id));
    if(result.state==='done'&&existsSync(outbox)){
     const root=realpathSync(this.config.project),images=readdirSync(outbox).filter(f=>/\.(png|jpe?g)$/i.test(f)).slice(0,3);
     for(const image of images){const file=realpathSync(join(outbox,image)),rel=relative(root,file);if(!rel.startsWith('..')&&!isAbsolute(rel)&&statSync(file).isFile()&&statSync(file).size<9*1024*1024)await this.api.photo(job.chat,file).catch(()=>{});}
    }
   }
  }catch(error){if(this.queue.job(job.id).state!=='cancelled'){this.queue.finish(job.id,'failed',redact(error.message,this.config.token));await this.api.send(job.chat,`Ошибка задания #${job.id}. Подробности: /result ${job.id}`).catch(()=>{});}}
  finally{this.current=null;this.child=null;}
 }
}
async function setup(configFile=CONFIG){
 const input=createInterface({input:process.stdin,output:process.stdout});
 try{
  const project=resolve(((await input.question(`Папка проекта [${join(homedir(),'home-codex-projects/124/little-planets')}]: `)).trim()||join(homedir(),'home-codex-projects/124/little-planets')).replace(/^~(?=\/|$)/,homedir()));
  if(!existsSync(project)||!existsSync(join(project,'package.json')))throw Error('Папка проекта не найдена. Укажи полный Linux-путь к little-planets.');
  input.close();process.stdout.write('Токен НОВОГО отдельного бота из @BotFather (ввод скрыт): ');
  const token=await hiddenToken();if(!/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(token))throw Error('Неверный формат токена.');
  const api=new TelegramAPI(token),me=await api.call('getMe'),webhook=await api.call('getWebhookInfo');if(webhook.url)throw Error('У этого бота уже есть webhook. Создай нового отдельного бота. Существующий webhook не изменён.');
  const config={token,project,codex:'codex',state:join(ROOT,'state')};mkdirSync(resolve(configFile,'..'),{recursive:true,mode:0o700});writeFileSync(configFile,JSON.stringify(config,null,2),{mode:0o600});chmodSync(configFile,0o600);
  const q=new Queue(join(config.state,'queue.sqlite'));
  if(!q.get('owner')){const code=randomBytes(12).toString('base64url');q.set('pair',code);q.set('pairUntil',Date.now()+15*60000);console.log(`\nОткрой https://t.me/${me.username} и отправь: /pair ${code}\nКод действует 15 минут. После запуска бота привязка сохранится.`);}else console.log('\nАккаунт уже привязан.');q.close();
  console.log('Запуск: ~/.local/share/home-codex/run.sh');
 }finally{input.close();}
}
function hiddenToken(){
 if(!process.stdin.isTTY)throw Error('Для ввода токена запусти setup в интерактивном терминале Ubuntu.');
 return new Promise((done,reject)=>{let value='';process.stdin.setRawMode(true);process.stdin.resume();const end=()=>{process.stdin.setRawMode(false);process.stdin.off('data',onData);process.stdin.pause();process.stdout.write('\n');};const onData=chunk=>{for(const c of chunk.toString()){if(c==='\u0003'){end();reject(Error('Отменено.'));return;}if(c==='\r'||c==='\n'){end();done(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;}};process.stdin.on('data',onData);});
}
async function run(){
 if(process.env.HOME_CODEX_LOCKED!=='1')throw Error('Запускайте через start.sh: он защищает от второго процесса бота.');
 const config=JSON.parse(readFileSync(CONFIG,'utf8'));const api=new TelegramAPI(config.token);const webhook=await api.call('getWebhookInfo');if(webhook.url)throw Error('У бота установлен webhook. Запуск остановлен, webhook не изменён.');
 const q=new Queue(join(config.state,'queue.sqlite')),bridge=new Bridge(config,q,api);
 const user=q.get('owner');if(user)await api.send(user,'Домашний ПК подключён. Готов принимать задания.').catch(()=>{});
 const abort=()=>{bridge.stopped=true;terminate(bridge.child);};process.once('SIGINT',abort);process.once('SIGTERM',abort);
 let worker;
 const pump=()=>{if(!worker&&!bridge.stopped)worker=bridge.work().finally(()=>{worker=null;});};const interval=setInterval(pump,500);pump();
 try{
  while(!bridge.stopped){
   try{
    const updates=await api.call('getUpdates',{offset:Number(q.get('offset')??0),timeout:25,allowed_updates:['message']});
    for(const update of updates){if(bridge.stopped)break;await bridge.handle(update);q.set('offset',update.update_id+1);}
   }catch{if(!bridge.stopped){console.error('Связь с Telegram прервалась; повтор через 5 секунд. Секреты не выводятся.');await new Promise(done=>setTimeout(done,5000));}}
  }
 }finally{clearInterval(interval);await worker;q.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);const mode=process.argv[2];
 const action=mode==='setup'?setup:mode==='run'?run:null;
 if(!action){console.error('Usage: node app.mjs setup|run');process.exitCode=1;}
 else await action().catch(e=>{console.error(redact(e.message));process.exitCode=1;});
}
