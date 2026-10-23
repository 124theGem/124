import {describe,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {RaidServer} from "../server/raid";
import {RaidPayments} from "../server/raid-payments";
import {createRaid,freshRaidProfile,tickRaid,raidBlocked,selectRaidPerk,RAID_EXIT_AT,raidBagValue,type RaidSnapshot} from "../shared/raid";
function pilot(server:RaidServer,id=1,invite?:string){
 let now=100000,seq=0,s=server.request(id,`Pilot ${id}`,{type:"hello",...(invite?{invite}:{})},now);
 return{get state(){return s;},get now(){return now;},hello(){s=server.request(id,"Pilot",{type:"hello"},now);seq=0;return s;},command(command:any){s=server.request(id,"Pilot",{type:"command",session:s.session,command},now);return s;},input(x=0,z=0,interact=false,dash=false){now+=50;s=server.request(id,"Pilot",{type:"input",session:s.session,seq:++seq,x,z,interact,dash},now);return s;},extract(){
   this.command({type:"start",map:"dock"});
   for(let i=0;i<1400;i++){
    const p=s.room.run!.pawns.find(p=>p.id===s.me)!;
    if(p.state==="dead"||p.state==="extracted")break;
    if(p.choices.length){this.command({type:"perk",perk:p.choices.includes("vitality")?"vitality":p.choices[0]});continue;}
    if(!p.chests){if(p.z>19)this.input(0,-1);else this.input(0,0,true);}
    else if(p.z<23)this.input(0,1);else this.input(0,0,true);
   }
   expect(s.room.run!.pawns.find(p=>p.id===s.me)!.state).toBe("extracted");return s;
 }};
}
describe("RIFT RAID combat and durable progression",()=>{
 it("fires actual projectiles, defeats the first enemy, collides with cover and gates early extraction",()=>{
  const profile=freshRaidProfile("Raider",0),run=createRaid("test","dock",31,[{id:"one",profile}]);
  for(let i=0;i<100;i++)tickRaid(run,.05,{one:{x:0,z:0,dash:false,interact:true}});
  expect(run.pawns[0].kills).toBeGreaterThan(0);expect(run.pawns[0].state).toBe("alive");expect(run.elapsed).toBeLessThan(RAID_EXIT_AT);
  expect(raidBlocked(run.walls,-10,12)).toBe(true);expect(run.bullets.every(b=>!raidBlocked(run.walls,b.x,b.z,.05))).toBe(true);
 });
 it("prevents client position/damage injection and limits world time independently of request count",()=>{
  const server=new RaidServer(":memory:",false,()=>31);try{const p=pilot(server);p.command({type:"start",map:"dock"});
   expect(()=>server.request(1,"Pilot",{type:"input",session:p.state.session,seq:1,x:1,z:0,dash:false,interact:false,damage:999},p.now)).toThrow();
   for(let i=0;i<100;i++)server.request(1,"Pilot",{type:"input",session:p.state.session,seq:i+1,x:1,z:0,dash:false,interact:false},p.now);
   const s=server.request(1,"Pilot",{type:"poll",session:p.state.session},p.now);expect(s.room.run!.elapsed).toBe(0);
  }finally{server.close();}
 });
 it("does not transfer container interaction progress into extraction",()=>{
  const run=createRaid("interaction","dock",31,[{id:"one",profile:freshRaidProfile("Raider",0)}]),pawn=run.pawns[0];
  pawn.x=0;pawn.z=18;run.elapsed=50;run.nextSpawn=100;
  for(let i=0;i<8;i++)tickRaid(run,.05,{one:{x:0,z:0,dash:false,interact:true}});
  expect(pawn.interactProgress).toBeGreaterThan(.3);pawn.z=24;
  tickRaid(run,.05,{one:{x:0,z:0,dash:false,interact:true}});expect(pawn.interactProgress).toBeCloseTo(.05);expect(pawn.state).toBe("alive");
 });
 it("requires squad readiness and ownership, shares one simulation, caps parties and expires old client sessions",()=>{
  const server=new RaidServer(":memory:",false,()=>31);try{
   const a=pilot(server,1),b=pilot(server,2,a.state.room.code),c=pilot(server,3,a.state.room.code);
   expect(()=>pilot(server,4,a.state.room.code)).toThrow(/три/);
   expect(()=>b.command({type:"start",map:"dock"})).toThrow(/лидер/);
   expect(()=>a.command({type:"start",map:"dock"})).toThrow(/готовности/);
   b.command({type:"ready"});c.command({type:"ready"});a.command({type:"start",map:"dock"});
   expect(a.state.room.run!.pawns).toHaveLength(3);const before=a.state.session;a.hello();
   expect(()=>server.request(1,"Pilot",{type:"poll",session:before},a.now)).toThrow(/другом/);
   expect(a.state.room.run!.id).toBeDefined();expect(a.state.room.members.every(p=>!Object.hasOwn(p,"user"))).toBe(true);
  }finally{server.close();}
 });
 it("extracts a real container, banks its contents exactly once, upgrades the base and survives database reopening",()=>{
  const root=mkdtempSync(join(tmpdir(),"rift-raid-")),path=join(root,"game.sqlite");let server=new RaidServer(path,false,()=>31);
  try{
   const p=pilot(server);const state=p.extract(),receipt=state.profile.lastRun!;
   expect(receipt.outcome).toBe("extracted");expect(receipt.credits).toBe(receipt.value+70);expect(receipt.value).toBeGreaterThan(0);expect(receipt.loot.scrap).toBeGreaterThan(0);
   const credits=state.profile.credits;for(let i=0;i<30;i++)p.input();expect(p.state.profile.credits).toBe(credits);
   p.command({type:"home"});p.command({type:"upgrade",upgrade:"vitality"});expect(p.state.profile.upgrades.vitality).toBe(1);expect(p.state.profile.credits).toBe(credits-100);
   const saved=p.state.profile;server.close();server=new RaidServer(path,false,()=>31);const reopened=server.request(1,"Pilot",{type:"hello"},p.now);
   expect(reopened.profile.stats).toEqual(saved.stats);expect(reopened.profile.upgrades).toEqual(saved.upgrades);expect(reopened.profile.credits).toBe(saved.credits);
  }finally{server.close();rmSync(root,{recursive:true,force:true});}
 });
 it("keeps banked currency on failure, blocks repeated contracts, unaffordable skins and unavailable perks",()=>{
  const server=new RaidServer(":memory:",false,()=>31);try{const p=pilot(server);p.command({type:"start",map:"lab"});p.command({type:"leave"});expect(p.state.profile.credits).toBe(150);expect(p.state.profile.lastRun!.outcome).toBe("lost");
   expect(()=>p.command({type:"daily",contract:"extracts"})).toThrow();expect(()=>p.command({type:"buySkin",skin:"void"})).toThrow(/жетонов/);
   const run=createRaid("t","dock",1,[{id:"a",profile:freshRaidProfile("A",0)}]);expect(()=>selectRaidPerk(run,"a","damage")).toThrow();
   server.mutate(1,p=>{p.daily.extracts=1;},p.now);p.command({type:"daily",contract:"extracts"});const balance=p.state.profile.credits;expect(()=>p.command({type:"daily",contract:"extracts"})).toThrow();expect(p.state.profile.credits).toBe(balance);
  }finally{server.close();}
 });
 it("recovers interrupted runs after a server restart without spending or resetting inventory",()=>{
  const root=mkdtempSync(join(tmpdir(),"rift-recover-")),path=join(root,"game.sqlite");let server=new RaidServer(path,false,()=>31);
  try{const p=pilot(server);p.command({type:"start",map:"dock"});server.close();server=new RaidServer(path,false,()=>31);const s=server.request(1,"Pilot",{type:"hello"});expect(s.profile.lastRun?.outcome).toBe("interrupted");expect(s.profile.credits).toBe(150);expect(s.profile.stats.runs).toBe(0);}finally{server.close();rmSync(root,{recursive:true,force:true});}
 });
});
describe("Telegram Stars verification",()=>{
 async function setup(){const raid=new RaidServer(":memory:",false,()=>31);raid.request(1,"Buyer",{type:"hello"});const calls:{method:string;body:any}[]=[];const config={enabled:true,secret:"test-secret-with-more-than-24-characters",appURL:"https://example.test/planets"};
 const pay=new RaidPayments(raid,"synthetic-token",config,async(method,body)=>{calls.push({method,body});if(method==="getWebhookInfo")return{url:config.appURL+"/api/raid/payments/telegram"};if(method==="createInvoiceLink")return"https://t.me/$synthetic-invoice";return true;});await pay.initialize();return{raid,pay,calls,secret:config.secret};}
 it("stays closed until an explicitly configured webhook is verified",async()=>{const raid=new RaidServer(":memory:",false,()=>31);try{const pay=new RaidPayments(raid,"fake",{},async()=>{throw new Error("Should not call the real bot");});await pay.initialize();expect(pay.enabled).toBe(false);await expect(pay.invoice(1,"solar")).rejects.toThrow(/не открыты/);}finally{raid.close();}});
 it("creates a fixed-price native XTR invoice, verifies precheckout, delivers once and refunds only the owner's purchase",async()=>{
  const{raid,pay,calls,secret}=await setup();try{
   const before=raid.profile(1);await pay.invoice(1,"solar",1000);const invoice=calls.find(c=>c.method==="createInvoiceLink")!.body;expect(invoice.currency).toBe("XTR");expect(invoice.prices[0].amount).toBe(49);expect(raid.profile(1).skins).not.toContain("solar");
   const query={id:"q1",from:{id:1},currency:"XTR",total_amount:49,invoice_payload:invoice.payload};
   await expect(pay.webhook("bad",{update_id:1,pre_checkout_query:query},2000)).rejects.toThrow(/Forbidden/);
   await pay.webhook(secret,{update_id:1,pre_checkout_query:query},2000);expect(calls.at(-1)!.body.ok).toBe(true);
   const message={from:{id:1},successful_payment:{currency:"XTR",total_amount:49,invoice_payload:invoice.payload,telegram_payment_charge_id:"charge-1"}};
   await expect(pay.webhook(secret,{update_id:2,message:{...message,from:{id:2}}},2001)).rejects.toThrow(/rejected/);
   await pay.webhook(secret,{update_id:3,message},2002);await pay.webhook(secret,{update_id:3,message},2003);
   expect(raid.profile(1).skins.filter(s=>s==="solar")).toHaveLength(1);expect(pay.purchases(1)).toHaveLength(1);expect(raid.profile(1).upgrades).toEqual(before.upgrades);expect(raid.profile(1).credits).toBe(before.credits);
   await expect(pay.refund(2,"charge-1")).rejects.toThrow(/не найдена/);await pay.refund(1,"charge-1");await pay.refund(1,"charge-1");expect(calls.filter(c=>c.method==="refundStarPayment")).toHaveLength(1);expect(raid.profile(1).skins).not.toContain("solar");
  }finally{raid.close();}
 });
 it("rejects expired orders, wrong totals and client-supplied pseudo payment receipts",async()=>{const{raid,pay,calls,secret}=await setup();try{await pay.invoice(1,"void",1000);const payload=calls.find(c=>c.method==="createInvoiceLink")!.body.payload;
   await pay.webhook(secret,{update_id:1,pre_checkout_query:{id:"x",from:{id:1},currency:"XTR",total_amount:1,invoice_payload:payload}},2000);expect(calls.at(-1)!.body.ok).toBe(false);
   await pay.webhook(secret,{update_id:2,pre_checkout_query:{id:"x",from:{id:1},currency:"XTR",total_amount:99,invoice_payload:payload}},1000000);expect(calls.at(-1)!.body.ok).toBe(false);
   await expect(pay.webhook(secret,{update_id:3,message:{from:{id:1},successful_payment:{currency:"XTR",total_amount:99,invoice_payload:payload,telegram_payment_charge_id:"forged"}}})).rejects.toThrow(/rejected/);expect(raid.profile(1).skins).not.toContain("void");
  }finally{raid.close();}});
 it("serializes duplicate invoices and refunds and allows only one precheckout per order",async()=>{
  const{raid,pay,calls,secret}=await setup();try{
   const invoices=await Promise.all([pay.invoice(1,"solar",1000),pay.invoice(1,"solar",1000)]);
   expect(invoices[0]).toEqual(invoices[1]);expect(calls.filter(c=>c.method==="createInvoiceLink")).toHaveLength(1);
   const payload=calls.find(c=>c.method==="createInvoiceLink")!.body.payload;
   const query={id:"original",from:{id:1},currency:"XTR",total_amount:49,invoice_payload:payload};
   await pay.webhook(secret,{update_id:1,pre_checkout_query:query},2000);expect(calls.at(-1)!.body.ok).toBe(true);
   await pay.webhook(secret,{update_id:2,pre_checkout_query:{...query,id:"second-charge"}},2001);expect(calls.at(-1)!.body.ok).toBe(false);
   await pay.webhook(secret,{update_id:3,pre_checkout_query:query},2002);expect(calls.at(-1)!.body.ok).toBe(true);
   const message={from:{id:1},successful_payment:{currency:"XTR",total_amount:49,invoice_payload:payload,telegram_payment_charge_id:"concurrent-charge"}};
   await pay.webhook(secret,{update_id:4,message},2003);
   await Promise.all([pay.refund(1,"concurrent-charge"),pay.refund(1,"concurrent-charge")]);
   expect(calls.filter(c=>c.method==="refundStarPayment")).toHaveLength(1);expect(raid.profile(1).skins).not.toContain("solar");
   await pay.webhook(secret,{update_id:4,message},2004);expect(raid.profile(1).skins).not.toContain("solar");
  }finally{raid.close();}
 });
});
