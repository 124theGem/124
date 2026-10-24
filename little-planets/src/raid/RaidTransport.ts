import { freshRaidProfile,createRaid,tickRaid,raidReceipt,applyRaidReceipt,selectRaidPerk,updateRaidProfile, type RaidSnapshot,type RaidInput,type RaidCommand,type RaidProfile,type RaidRun } from "../../shared/raid";
export class RaidTransport {
  readonly local:boolean;
  sampledAt=0;
  receivedAt=0;
  private session="";
  private profile?:RaidProfile;
  private run:RaidRun|null=null;
  private controls:RaidInput={x:0,z:0,dash:false,interact:false};
  private settled=false;
  private seq=0;
  constructor(private initData:string){this.local=import.meta.env.DEV&&!initData;}
  private async request(path:string,body?:unknown){
    const sent=performance.now()/1000;
    const r=await fetch(new URL(`./api/raid${path}`,location.href),{method:body?"POST":"GET",headers:{Authorization:`tma ${this.initData}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",signal:AbortSignal.timeout(8000)});
    const data=await r.json();if(!path){this.sampledAt=sent;this.receivedAt=performance.now()/1000;}if(!r.ok){const error=new Error(data.error||"Нет связи со штабом.");Object.assign(error,{status:r.status});throw error;}return data;
  }
  private save(){localStorage.setItem("rift-raid-v1",JSON.stringify(this.profile));}
  private snapshot():RaidSnapshot{this.sampledAt=this.receivedAt=performance.now()/1000;return{session:"local",me:"local-raider",serverTime:Date.now(),profile:structuredClone(this.profile!),room:{code:"LOCAL1",owner:"local-raider",members:[{id:"local-raider",name:this.profile!.name,skin:this.profile!.skin,ready:true,owner:true}],run:this.run?structuredClone(this.run):null},leaderboard:[],shop:{enabled:false,botUsername:null}};}
  async hello(invite?:string):Promise<RaidSnapshot>{
    if(!this.local){const data=await this.request("",{type:"hello",...(invite?{invite}:{})});this.session=data.session;return data;}
    const raw=localStorage.getItem("rift-raid-v1");this.profile=raw?JSON.parse(raw):freshRaidProfile("Рейдер",Date.now());
    if(!this.profile?.stats||!Array.isArray(this.profile.skins))throw new Error("Не удалось прочитать локальный профиль. Сохранение не удалено.");
    this.save();return this.snapshot();
  }
  setControls(controls:RaidInput){this.controls={...controls};}
  advance(dt:number){
    if(!this.local||!this.run||this.run.status!=="active"||this.run.pawns[0].choices.length)return;
    tickRaid(this.run,dt,{"local-raider":this.controls});
    const pawn=this.run.pawns[0];if(!this.settled&&["extracted","dead"].includes(pawn.state)){this.settled=true;applyRaidReceipt(this.profile!,raidReceipt(this.run,pawn,Date.now()));this.save();}
  }
  async poll(controls?:RaidInput):Promise<RaidSnapshot>{
    if(!this.local)return this.request("",controls?{type:"input",session:this.session,seq:++this.seq,...controls}:{type:"poll",session:this.session});
    if(controls)this.controls={...controls};return this.snapshot();
  }
  async command(command:RaidCommand):Promise<RaidSnapshot>{
    if(!this.local)return this.request("",{type:"command",session:this.session,command});
    if(command.type==="start"){if(this.run?.status==="active")throw new Error("Рейд уже начался.");this.run=createRaid(crypto.randomUUID(),command.map,Math.floor(Math.random()*2**32),[{id:"local-raider",profile:this.profile!}]);this.settled=false;}
    else if(command.type==="home"){if(this.run?.pawns[0].state==="alive")throw new Error("Сначала вернитесь из рейда.");this.run=null;}
    else if(command.type==="leave"){if(this.run&&!this.settled){this.run.pawns[0].state="dead";applyRaidReceipt(this.profile!,raidReceipt(this.run,this.run.pawns[0],Date.now()));}this.run=null;this.settled=false;}
    else if(command.type==="perk"){if(!this.run)throw new Error("Рейд не начат.");selectRaidPerk(this.run,"local-raider",command.perk);}
    else if(command.type!=="ready")updateRaidProfile(this.profile!,command,Date.now());
    this.save();return this.snapshot();
  }
  async invite(){if(this.local)return{code:"LOCAL1",url:null};return this.request("/invite",{session:this.session}) as Promise<{code:string;url:string|null}>;}
  async invoice(sku:string){return this.request("/invoice",{sku}) as Promise<{url:string}>;}
  async purchases(){if(this.local)return{purchases:[]};return this.request("/purchases") as Promise<{purchases:{id:string;sku:string;amount:number;state:string;at:number}[]}>;}
  async refund(id:string){return this.request("/refund",{id});}
}
