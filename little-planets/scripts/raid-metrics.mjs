import { DatabaseSync } from 'node:sqlite';
const path=process.argv[2]??process.env.DATABASE_PATH;
if(!path)throw new Error('Usage: node scripts/raid-metrics.mjs /path/to/planets.sqlite');
const db=new DatabaseSync(path,{readOnly:true});
try{
 const now=Date.now(),day=ms=>new Date(ms).toISOString().slice(0,10),today=day(now),cutoff=now-7*86400000;
 const count=(sql,...args)=>Number(db.prepare(sql).get(...args).n);
 const profiles=db.prepare('SELECT user_id,profile FROM raid_profiles').all().map(row=>({id:row.user_id,p:JSON.parse(row.profile)}));
 const visits=new Set(db.prepare('SELECT user_id,day FROM raid_daily_users').all().map(row=>`${row.user_id}:${row.day}`));
 const retention=offset=>{
  const mature=profiles.filter(({p})=>day(p.joinedAt+offset*86400000)<today);
  const returned=mature.filter(({id,p})=>visits.has(`${id}:${day(p.joinedAt+offset*86400000)}`)).length;
  return{eligible:mature.length,returned,percent:mature.length?Math.round(returned/mature.length*1000)/10:null};
 };
 const results=db.prepare('SELECT receipt FROM raid_results WHERE at>=?').all(cutoff).map(row=>JSON.parse(row.receipt));
 const extracted=results.filter(r=>r.outcome==='extracted');
 const payments=db.prepare('SELECT state,amount FROM raid_payments WHERE at>=?').all(cutoff);
 const funnel=Object.fromEntries(['session','raid_start','raid_end','invite_share','friend_extraction','invoice_created','purchase','refund'].map(event=>[event,count('SELECT COUNT(*) AS n FROM raid_events WHERE event=? AND at>=?',event,cutoff)]));
 console.log(JSON.stringify({at:new Date(now).toISOString(),registered:profiles.length,dau:count('SELECT COUNT(*) AS n FROM raid_daily_users WHERE day=?',today),wau:count('SELECT COUNT(DISTINCT user_id) AS n FROM raid_daily_users WHERE day>=?',day(now-6*86400000)),d1:retention(1),d7:retention(7),last7days:{funnel,finishedRaids:results.length,extractionPercent:results.length?Math.round(extracted.length/results.length*1000)/10:null,meanRaidSeconds:results.length?Math.round(results.reduce((s,r)=>s+r.duration,0)/results.length):null,starsGross:payments.reduce((s,p)=>s+p.amount,0),starsRefunded:Number(db.prepare("SELECT COALESCE(SUM(json_extract(meta,'$.stars')),0) AS n FROM raid_events WHERE event='refund' AND at>=?").get(cutoff).n),refundsPending:payments.filter(p=>p.state==='refund_pending').length},note:'XTR gross is not net revenue. No Telegram IDs or names are exported. D1/D7 use complete UTC cohorts; null means insufficient data.'},null,2));
} finally{db.close();}
