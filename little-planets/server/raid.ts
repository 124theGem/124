import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  freshRaidProfile, refreshRaidProfile, createRaid, tickRaid, raidReceipt, applyRaidReceipt,
  selectRaidPerk, raidDay, raidSeason, raidUpgradeCost, RAID_SKINS, RAID_WEAPONS, RAID_CONTRACTS,
  raidName, updateRaidProfile, type RaidProfile, type RaidRun, type RaidInput, type RaidCommand, type RaidSnapshot, type RaidReceipt,
} from "../shared/raid";
const skin=z.enum(["ghost","mint","coral","solar","void","founder"]), weapon=z.enum(["pulse","scatter","arc"]);
const commands=z.discriminatedUnion("type",[
  z.object({type:z.literal("start"),map:z.enum(["dock","lab"])}).strict(),
  z.object({type:z.literal("ready")}).strict(),z.object({type:z.literal("leave")}).strict(),z.object({type:z.literal("home")}).strict(),
  z.object({type:z.literal("perk"),perk:z.enum(["damage","rate","vitality","magnet","speed","repair"])}).strict(),
  z.object({type:z.literal("upgrade"),upgrade:z.enum(["vitality","power","magnet"])}).strict(),
  z.object({type:z.literal("equip"),skin,weapon,name:z.string().min(1).max(64)}).strict(),
  z.object({type:z.literal("buySkin"),skin}).strict(),z.object({type:z.literal("daily"),contract:z.enum(["kills","chests","extracts"])}).strict(),
  z.object({type:z.literal("season"),tier:z.number().int().min(1).max(8)}).strict(),
]);
export const raidRequest=z.discriminatedUnion("type",[
  z.object({type:z.literal("hello"),invite:z.string().regex(/^[A-Z2-9]{6}$/).optional()}).strict(),
  z.object({type:z.literal("poll"),session:z.string().uuid()}).strict(),
  z.object({type:z.literal("input"),session:z.string().uuid(),seq:z.number().int().positive().max(2**40),x:z.number().finite().min(-1).max(1),z:z.number().finite().min(-1).max(1),dash:z.boolean(),interact:z.boolean()}).strict(),
  z.object({type:z.literal("command"),session:z.string().uuid(),command:commands}).strict(),
]);
export class RaidError extends Error { constructor(message:string,readonly statusCode=400){super(message);} }
interface Member { user:number; id:string; name:string; session:string; room:string; ready:boolean; lastAt:number; inputAt:number; seq:number; input:RaidInput; activeDay?:string }
interface Room { code:string; owner:string; members:Member[]; run:RaidRun|null; simAt:number; settled:Set<string>; createdAt:number }
const idleInput=():RaidInput=>({x:0,z:0,dash:false,interact:false});
const dayWeek=(now:number)=>{const date=new Date(now);date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));return date.toISOString().slice(0,10);};
/** Server-owned PvE sessions and durable rewards. Existing colony tables are never read or changed. */
export class RaidServer {
  readonly db:DatabaseSync;
  private members=new Map<number,Member>();
  private rooms=new Map<string,Room>();
  private timer?:ReturnType<typeof setInterval>;
  private board: RaidSnapshot["leaderboard"]=[];
  private boardAt=0;
  shop={enabled:false,botUsername:null as string|null};
  constructor(database:string,clock=true,private seed=()=>randomBytes(4).readUInt32LE()){
    this.db=new DatabaseSync(database);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS raid_profiles(user_id TEXT PRIMARY KEY,profile TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS raid_results(run_id TEXT NOT NULL,user_id TEXT NOT NULL,receipt TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(run_id,user_id));
      CREATE TABLE IF NOT EXISTS raid_active(run_id TEXT NOT NULL,user_id TEXT NOT NULL,map TEXT NOT NULL,state TEXT NOT NULL,started_at INTEGER NOT NULL,PRIMARY KEY(run_id,user_id));
      CREATE TABLE IF NOT EXISTS raid_daily_users(user_id TEXT NOT NULL,day TEXT NOT NULL,PRIMARY KEY(user_id,day));
      CREATE TABLE IF NOT EXISTS raid_events(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,event TEXT NOT NULL,at INTEGER NOT NULL,meta TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS raid_referrals(invitee TEXT PRIMARY KEY,inviter TEXT NOT NULL,paid INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS raid_weekly(user_id TEXT NOT NULL,week TEXT NOT NULL,name TEXT NOT NULL,skin TEXT NOT NULL,score INTEGER NOT NULL,PRIMARY KEY(user_id,week));
      CREATE INDEX IF NOT EXISTS raid_events_at ON raid_events(at);`);
    this.recoverInterrupted();
    if(clock){this.timer=setInterval(()=>{try{this.tick(Date.now());}catch{console.error("RIFT RAID simulation paused after a storage failure; rewards will be retried.");}},50);this.timer.unref();}
  }
  profile(user:number,name="Рейдер",now=Date.now()):RaidProfile {
    const row=this.db.prepare("SELECT profile FROM raid_profiles WHERE user_id=?").get(String(user)) as {profile:string}|undefined;
    const profile: RaidProfile=row?JSON.parse(row.profile):freshRaidProfile(name,now);
    if(!profile||typeof profile.credits!=="number"||!profile.stats||!profile.upgrades||!Array.isArray(profile.skins))throw new Error("Raid profile is invalid; refusing to reset saved progress");
    refreshRaidProfile(profile,now);return profile;
  }
  private save(user:number,profile:RaidProfile){this.db.prepare("INSERT INTO raid_profiles VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile").run(String(user),JSON.stringify(profile));}
  mutate(user:number,change:(profile:RaidProfile)=>void,now=Date.now()){
    this.db.exec("BEGIN IMMEDIATE");try{const profile=this.profile(user,undefined,now);change(profile);this.save(user,profile);this.db.exec("COMMIT");return profile;}catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  event(user:number,event:string,meta:Record<string,unknown>={},now=Date.now()){
    this.db.prepare("INSERT INTO raid_events(user_id,event,at,meta) VALUES(?,?,?,?)").run(String(user),event,now,JSON.stringify(meta));
  }
  private recoverInterrupted(){
    const rows=this.db.prepare("SELECT * FROM raid_active WHERE state='active'").all() as {run_id:string;user_id:string;map:"dock"|"lab"}[];
    for(const row of rows){
      const now=Date.now();this.db.exec("BEGIN IMMEDIATE");
      try{
        const profile=this.profile(Number(row.user_id),undefined,now);
        profile.lastRun={id:row.run_id,outcome:"interrupted",map:row.map,loot:{scrap:0,data:0,core:0},value:0,credits:0,xp:0,kills:0,chests:0,duration:0,at:now};
        this.save(Number(row.user_id),profile);this.db.prepare("UPDATE raid_active SET state='interrupted' WHERE run_id=? AND user_id=?").run(row.run_id,row.user_id);this.db.exec("COMMIT");
      }catch(error){this.db.exec("ROLLBACK");throw error;}
    }
  }
  private newRoom(member:Member,now:number){
    if(this.rooms.size>=80)throw new RaidError("Все шлюзы заняты. Попробуйте ещё раз через минуту.",503);
    let code="";do{code=randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,6);}while(code.length!==6||this.rooms.has(code));
    const room:Room={code,owner:member.id,members:[member],run:null,simAt:now,settled:new Set(),createdAt:now};
    member.room=code;member.ready=true;this.rooms.set(code,room);return room;
  }
  private detach(member:Member,now:number){
    const room=this.rooms.get(member.room);if(!room)return;
    const pawn=room.run?.pawns.find(p=>p.id===member.id);
    if(pawn?.state==="alive"||pawn?.state==="down"){pawn.state="dead";this.settle(room,now);}
    room.members=room.members.filter(m=>m!==member);
    if(!room.members.length)this.rooms.delete(room.code);else if(room.owner===member.id){room.owner=room.members[0].id;room.members[0].ready=true;}
  }
  private settle(room:Room,now:number){
    if(!room.run)return;
    if(room.run.status==="complete"&&room.settled.size===room.run.pawns.length)return;
    for(const pawn of room.run.pawns){
      if(!["dead","extracted"].includes(pawn.state)||room.settled.has(pawn.id))continue;
      const member=room.members.find(m=>m.id===pawn.id);if(!member)continue;
      const receipt=raidReceipt(room.run,pawn,now);
      this.db.exec("BEGIN IMMEDIATE");
      try{
        const inserted=this.db.prepare("INSERT OR IGNORE INTO raid_results VALUES(?,?,?,?)").run(room.run.id,String(member.user),JSON.stringify(receipt),now);
        if(inserted.changes){
          const profile=this.profile(member.user,member.name,now);applyRaidReceipt(profile,receipt);this.save(member.user,profile);
          if(receipt.outcome==="extracted")this.db.prepare("INSERT INTO raid_weekly VALUES(?,?,?,?,?) ON CONFLICT(user_id,week) DO UPDATE SET score=MAX(score,excluded.score),name=excluded.name,skin=excluded.skin").run(String(member.user),dayWeek(now),profile.name,profile.skin,receipt.value);
          this.event(member.user,"raid_end",{outcome:receipt.outcome,value:receipt.value,duration:receipt.duration},now);
        }
        this.db.prepare("UPDATE raid_active SET state='complete' WHERE run_id=? AND user_id=?").run(room.run.id,String(member.user));
        this.db.exec("COMMIT");room.settled.add(pawn.id);this.boardAt=0;
      }catch(error){this.db.exec("ROLLBACK");throw error;}
    }
    const extracted=room.members.filter(m=>room.run!.pawns.find(p=>p.id===m.id)?.state==="extracted");
    for(const member of extracted){
      const referral=this.db.prepare("SELECT inviter FROM raid_referrals WHERE invitee=? AND paid=0").get(String(member.user)) as {inviter:string}|undefined;
      if(!referral||!extracted.some(m=>String(m.user)===referral.inviter))continue;
      this.db.exec("BEGIN IMMEDIATE");
      try{
        const updated=this.db.prepare("UPDATE raid_referrals SET paid=1 WHERE invitee=? AND paid=0").run(String(member.user));
        if(updated.changes)for(const id of [member.user,Number(referral.inviter)]){const profile=this.profile(id,undefined,now);profile.credits+=200;this.save(id,profile);this.event(id,"friend_extraction",{},now);}
        this.db.exec("COMMIT");
      }catch(error){this.db.exec("ROLLBACK");throw error;}
    }
  }
  tick(now:number){
    for(const room of this.rooms.values()){
      if(room.run){
        let elapsed=Math.min(0.25,Math.max(0,(now-room.simAt)/1000));room.simAt=now;
        const choosing=room.run.pawns.length===1&&room.run.pawns[0].choices.length>0;
        if(!choosing&&room.run.status==="active"&&room.members.some(m=>now-m.lastAt<3000))while(elapsed>0.00001){
          const dt=Math.min(0.05,elapsed),inputs:Record<string,RaidInput>={};
          for(const member of room.members)inputs[member.id]=now-member.inputAt<650?member.input:idleInput();
          tickRaid(room.run,dt,inputs);elapsed-=dt;
        }
        this.settle(room,now);
      }
      if(room.members.every(m=>now-m.lastAt>30*60000)){
        for(const member of [...room.members]){this.detach(member,now);this.members.delete(member.user);}
      }
    }
  }
  request(user:number,name:string,raw:unknown,now=Date.now()):RaidSnapshot{
    const body=raidRequest.parse(raw);this.tick(now);
    let member=this.members.get(user);
    if(body.type==="hello"){
      let profile=this.profile(user,name,now);this.save(user,profile);
      this.event(user,"session",{},now);
      if(!member){member={user,id:randomUUID(),session:randomUUID(),room:"",name:profile.name,ready:false,lastAt:now,inputAt:now,seq:0,input:idleInput()};this.members.set(user,member);}
      member.session=randomUUID();member.seq=0;member.input=idleInput();member.lastAt=now;
      if(body.invite&&body.invite!==member.room){
        const target=this.rooms.get(body.invite);
        if(!target)throw new RaidError("Этот отряд уже ушёл. Создайте свой и пригласите друга.");
        if(target.run?.status==="active")throw new RaidError("Отряд уже в рейде. Дождитесь возвращения.");
        if(target.members.length>=3)throw new RaidError("В отряде уже три рейдера.");
        if(target.run?.status==="complete"){target.run=null;target.settled.clear();}
        this.detach(member,now);member.room=target.code;member.ready=false;target.members.push(member);
        const owner=target.members.find(m=>m.id===target.owner)!;
        if(owner.user!==user&&now-profile.joinedAt<7*86400000)this.db.prepare("INSERT OR IGNORE INTO raid_referrals(invitee,inviter) VALUES(?,?)").run(String(user),String(owner.user));
      }else if(!this.rooms.has(member.room))this.newRoom(member,now);
    }else{
      if(!member||member.session!==body.session)throw new RaidError("Игра открыта в другом окне. Перезагрузите Mini App.",409);
      member.lastAt=now;
    }
    if(!member)throw new RaidError("Не удалось подключиться.",409);
    const day=raidDay(now);if(member.activeDay!==day){this.db.prepare("INSERT OR IGNORE INTO raid_daily_users VALUES(?,?)").run(String(user),day);member.activeDay=day;}
    let room=this.rooms.get(member.room);if(!room)room=this.newRoom(member,now);
    if(body.type==="input"&&body.seq>member.seq){member.seq=body.seq;member.input={x:body.x,z:body.z,dash:body.dash,interact:body.interact};member.inputAt=now;}
    if(body.type==="command"){
      const command=body.command;
      if(command.type==="leave"){this.detach(member,now);room=this.newRoom(member,now);}
      else if(command.type==="home"){
        const pawn=room.run?.pawns.find(p=>p.id===member!.id);
        if(pawn?.state==="alive"||pawn?.state==="down")throw new RaidError("Сначала эвакуируйтесь или завершите рейд.");
        if(room.run?.status==="active"){this.detach(member,now);room=this.newRoom(member,now);}else{room.run=null;room.settled.clear();}
      }else if(command.type==="ready"){member.ready=!member.ready;}
      else if(command.type==="start"){
        if(room.owner!==member.id)throw new RaidError("Рейд запускает лидер отряда.");
        if(room.run?.status==="active")throw new RaidError("Рейд уже идёт.");
        if(!room.members.every(m=>m.ready))throw new RaidError("Дождитесь готовности всех участников.");
        room.run=createRaid(randomUUID(),command.map,this.seed(),room.members.map(m=>({id:m.id,profile:this.profile(m.user,m.name,now)})));
        room.simAt=now;room.settled.clear();
        this.db.exec("BEGIN IMMEDIATE");try{for(const m of room.members){this.db.prepare("INSERT INTO raid_active VALUES(?,?,?,?,?)").run(room.run.id,String(m.user),command.map,"active",now);this.event(m.user,"raid_start",{map:command.map,squad:room.members.length},now);}this.db.exec("COMMIT");}catch(error){this.db.exec("ROLLBACK");room.run=null;throw error;}
      }else if(command.type==="perk"){
        if(!room.run)throw new RaidError("Рейд не начат.");try{selectRaidPerk(room.run,member.id,command.perk);}catch(error){throw new RaidError((error as Error).message);}
      }else{
        if(room.run?.pawns.some(p=>p.id===member!.id&&(p.state==="alive"||p.state==="down")))throw new RaidError("Снаряжение меняется на базе.");
        this.profileCommand(member,command,now);
      }
    }
    return this.snapshot(member,room,now);
  }
  private profileCommand(member:Member,command:RaidCommand,now:number){
    try { const updated=this.mutate(member.user,profile=>updateRaidProfile(profile,command,now),now); member.name=updated.name; }
    catch(error) { if(error instanceof RaidError)throw error; throw new RaidError((error as Error).message); }
  }
  invite(user:number,session:string){
    const member=this.members.get(user);if(!member||member.session!==session)throw new RaidError("Соединение устарело.",409);
    this.event(user,"invite_share",{room:member.room});return member.room;
  }
  private snapshot(member:Member,room:Room,now:number):RaidSnapshot{
    const profile=this.profile(member.user,member.name,now);
    if(now-this.boardAt>5000){this.board=this.db.prepare("SELECT name,skin,score FROM raid_weekly WHERE week=? ORDER BY score DESC LIMIT 10").all(dayWeek(now)) as RaidSnapshot["leaderboard"];this.boardAt=now;}
    return{session:member.session,me:member.id,serverTime:now,profile,
      room:{code:room.code,owner:room.owner,members:room.members.map(m=>{const p=this.profile(m.user,m.name,now);return{id:m.id,name:p.name,skin:p.skin,owner:m.id===room.owner,ready:m.ready};}),run:room.run?structuredClone(room.run):null},
      leaderboard:this.board.map(p=>({...p})),shop:{...this.shop}};
  }
  close(){clearInterval(this.timer);this.db.close();}
}
