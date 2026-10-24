// Stop only this user's exact installed bridge entry point; never terminate the WSL distro.
import {readdirSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function bridgeProcess(pid,app){
 try{if(statSync(`/proc/${pid}`).uid!==process.getuid())return false;const args=readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);return args.length===3&&args[2]==='run'&&realpathSync(args[1])===realpathSync(app);}catch{return false;}
}
export async function stopBridge(app,{timeout=30000}={}){
 const pids=readdirSync('/proc').filter(id=>/^\d+$/.test(id)&&Number(id)!==process.pid&&bridgeProcess(id,app));
 for(const pid of pids)try{process.kill(Number(pid),'SIGTERM');}catch{}
 const until=Date.now()+timeout;
 while(pids.some(pid=>bridgeProcess(pid,app))&&Date.now()<until)await new Promise(done=>setTimeout(done,100));
 for(const pid of pids)if(bridgeProcess(pid,app))try{process.kill(Number(pid),'SIGKILL');}catch{}
 return pids.length;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const count=await stopBridge(fileURLToPath(new URL('./app.mjs',import.meta.url)));console.log(`Home Codex processes stopped: ${count}`);}
