/** RIFT RAID: deterministic cooperative extraction simulation. No client-provided damage or rewards. */
export type RaidMap = "dock" | "lab";
export type RaidWeapon = "pulse" | "scatter" | "arc";
export type RaidSkin = "ghost" | "mint" | "coral" | "solar" | "void" | "founder";
export const RAID_DURATION = 180;
export const RAID_EXIT_AT = 45;
export const RAID_SKINS = {
  ghost: { name: "Призрак", color: "#c9dce1", glow: "#87eff0", credits: 0 },
  mint: { name: "Мята", color: "#6ee3bf", glow: "#d0ffea", credits: 0 },
  coral: { name: "Коралл", color: "#ed8b9e", glow: "#ffe7b8", credits: 0 },
  solar: { name: "Солнечный", color: "#ffbf65", glow: "#fff2b0", credits: 1800 },
  void: { name: "Спектр", color: "#a991f4", glow: "#f0bcff", credits: 3200 },
  founder: { name: "Пионер", color: "#f2d0a4", glow: "#ffffff", credits: 4800 },
} as const;
export const RAID_WEAPONS = {
  pulse: { name: "ПУЛЬС", description: "Точный автомат. Универсальный выбор.", damage: 23, rate: 0.3, speed: 28, range: 8, unlock: 0 },
  scatter: { name: "ШТОРМ", description: "Четыре заряда. Смертелен вблизи.", damage: 15, rate: 0.7, speed: 25, range: 7, unlock: 2 },
  arc: { name: "РАЗРЯД", description: "Пробивает строй противников.", damage: 34, rate: 0.52, speed: 34, range: 9.5, unlock: 5 },
} as const;
export const RAID_PERKS = {
  damage: { name: "Перегрузка", text: "+20% к урону", icon: "bolt" },
  rate: { name: "Быстрый затвор", text: "+15% к темпу огня", icon: "cross" },
  vitality: { name: "Второе дыхание", text: "+25 здоровья и лечение", icon: "heart" },
  magnet: { name: "Магнит", text: "+1 м к сбору добычи", icon: "loot" },
  speed: { name: "Лёгкий шаг", text: "+12% к скорости", icon: "dash" },
  repair: { name: "Ремкомплект", text: "+2 здоровья за убийство", icon: "shield" },
} as const;
export type RaidPerk = keyof typeof RAID_PERKS;
export type RaidInput = { x: number; z: number; dash: boolean; interact: boolean };
export interface RaidBag { scrap: number; data: number; core: number }
export const emptyRaidBag = (): RaidBag => ({ scrap: 0, data: 0, core: 0 });
export const raidBagValue = (bag: RaidBag) => bag.scrap * 4 + bag.data * 15 + bag.core * 60;
export interface RaidReceipt {
  id: string; outcome: "extracted" | "lost" | "interrupted"; map: RaidMap;
  loot: RaidBag; value: number; credits: number; xp: number; kills: number; chests: number; duration: number; at: number;
}
export interface RaidProfile {
  name: string; joinedAt: number; lastSeenAt: number; credits: number; xp: number;
  skin: RaidSkin; skins: RaidSkin[]; weapon: RaidWeapon;
  upgrades: { vitality: number; power: number; magnet: number };
  stats: { runs: number; extracts: number; kills: number; bestLoot: number; streak: number };
  daily: { day: string; kills: number; chests: number; extracts: number; claimed: string[] };
  season: { id: string; xp: number; claimed: number[] };
  lastRun: RaidReceipt | null;
}
export const raidDay = (now: number) => new Date(now).toISOString().slice(0, 10);
export const raidSeason = (now: number) => new Date(now).toISOString().slice(0, 7);
export const raidName = (name: string) => name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/g, "").trim().slice(0, 24) || "Рейдер";
export function freshRaidProfile(name: string, now: number): RaidProfile {
  return { name: raidName(name), joinedAt: now, lastSeenAt: now, credits: 150, xp: 0,
    skin: "ghost", skins: ["ghost", "mint", "coral"], weapon: "pulse", upgrades: { vitality: 0, power: 0, magnet: 0 },
    stats: { runs: 0, extracts: 0, kills: 0, bestLoot: 0, streak: 0 },
    daily: { day: raidDay(now), kills: 0, chests: 0, extracts: 0, claimed: [] },
    season: { id: raidSeason(now), xp: 0, claimed: [] }, lastRun: null };
}
export function refreshRaidProfile(profile: RaidProfile, now: number) {
  if (profile.daily.day !== raidDay(now)) profile.daily = { day: raidDay(now), kills: 0, chests: 0, extracts: 0, claimed: [] };
  if (profile.season.id !== raidSeason(now)) profile.season = { id: raidSeason(now), xp: 0, claimed: [] };
  profile.lastSeenAt = now;
}
export const RAID_CONTRACTS = [
  { id: "kills", title: "Зачистка", text: "Уничтожить 20 противников", target: 20, reward: 120 },
  { id: "chests", title: "Тайники", text: "Открыть 3 контейнера", target: 3, reward: 100 },
  { id: "extracts", title: "Вернуться живым", text: "Успешно эвакуироваться", target: 1, reward: 160 },
] as const;
export const raidUpgradeCost = (level: number) => 100 * (level + 1) ** 2;
export const raidLevel = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 100));
export interface RaidWall { x: number; z: number; w: number; d: number; kind: "crate" | "building" | "barrier" }
export interface RaidPawn {
  id: string; name: string; skin: RaidSkin; weapon: RaidWeapon;
  x: number; z: number; vx: number; vz: number; angle: number;
  hp: number; maxHp: number; state: "alive" | "down" | "dead" | "extracted";
  dashAt: number; dashLeft: number; invulnerable: number; shootAt: number; downLeft: number;
  bag: RaidBag; kills: number; chests: number; xp: number; level: number;
  perks: Record<RaidPerk, number>; choices: RaidPerk[]; interactProgress: number; interactTarget?:string;
  damageMultiplier: number; magnet: number;
}
export interface RaidEnemy { id: number; kind: "crawler" | "drone" | "brute"; x: number; z: number; hp: number; maxHp: number; hitAt: number; attackAt: number; angle: number }
export interface RaidBullet { id: number; owner: string; x: number; z: number; vx: number; vz: number; damage: number; left: number; enemy: boolean; pierce: number; hit: number[] }
export interface RaidDrop { id: number; kind: keyof RaidBag | "med"; x: number; z: number; amount: number }
export interface RaidChest { id: number; x: number; z: number; opened: boolean; rare: boolean }
export interface RaidEvent {
  id: number; kind: "shot" | "impact" | "hit" | "kill" | "chest" | "dash" | "level" | "extract"; x: number; z: number; at: number;
  shot?: { owner:string; enemy:boolean; rounds:{id:number;vx:number;vz:number;life:number}[] };
  impact?: number;
}
export interface RaidRun {
  id: string; map: RaidMap; seed: number; rng: number; elapsed: number; counter: number; status: "active" | "complete";
  pawns: RaidPawn[]; walls: RaidWall[]; enemies: RaidEnemy[]; bullets: RaidBullet[]; drops: RaidDrop[]; chests: RaidChest[];
  events: RaidEvent[]; nextSpawn: number; boss: boolean;
}
export interface RaidLobbyMember { id: string; name: string; skin: RaidSkin; ready: boolean; owner: boolean }
export interface RaidSnapshot {
  session: string; me: string; serverTime: number; profile: RaidProfile;
  room: { code: string; owner: string; members: RaidLobbyMember[]; run: RaidRun | null };
  leaderboard: { name: string; skin: RaidSkin; score: number }[];
  shop: { enabled: boolean; botUsername: string | null };
}
export type RaidCommand =
  | { type: "start"; map: RaidMap } | { type: "ready" } | { type: "leave" } | { type: "home" }
  | { type: "perk"; perk: RaidPerk } | { type: "upgrade"; upgrade: "vitality" | "power" | "magnet" }
  | { type: "equip"; skin: RaidSkin; weapon: RaidWeapon; name: string }
  | { type: "buySkin"; skin: RaidSkin } | { type: "daily"; contract: string } | { type: "season"; tier: number };
export const raidDistance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function random(run: RaidRun) { let x = run.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; run.rng = x >>> 0 || 1; return run.rng / 4294967296; }
function event(run: RaidRun, kind: RaidEvent["kind"], at: { x: number; z: number }, detail:Partial<Pick<RaidEvent,"shot"|"impact"|"at">>={}) { run.events.push({ id: ++run.counter, kind, x: at.x, z: at.z, at: run.elapsed,...detail }); if (run.events.length > 120) run.events.shift(); }
export function raidWalls(map: RaidMap): RaidWall[] {
  const walls: RaidWall[] = [
    {x:-10,z:12,w:7,d:4,kind:"building"},{x:10,z:10,w:6,d:5,kind:"building"},
    {x:-10,z:-2,w:5,d:7,kind:"building"},{x:10,z:-7,w:7,d:5,kind:"building"},
    {x:-2,z:-17,w:9,d:4,kind:"building"},{x:-18,z:-16,w:3,d:7,kind:"building"},
    {x:18,z:20,w:3,d:6,kind:"barrier"},{x:-17,z:23,w:5,d:1.2,kind:"barrier"},
    {x:-3,z:8,w:2,d:2,kind:"crate"},{x:4,z:2,w:2,d:2,kind:"crate"},
    {x:16,z:-19,w:2.4,d:2.4,kind:"crate"},{x:-1,z:-6,w:2.5,d:1.5,kind:"crate"},
  ];
  if (map === "lab") return walls.map((p, i) => ({...p, x: -p.x, z: p.z + (i % 2 ? 1 : -1), kind: i < 6 ? "building" : p.kind}));
  return walls;
}
export function raidBlocked(walls: RaidWall[], x: number, z: number, radius = 0.4) {
  return Math.abs(x) > 22 - radius || Math.abs(z) > 28 - radius || walls.some(w => Math.abs(x - w.x) < w.w / 2 + radius && Math.abs(z - w.z) < w.d / 2 + radius);
}
export function raidMove(walls: RaidWall[], at: { x: number; z: number }, x: number, z: number, radius = 0.4) {
  if (!raidBlocked(walls, at.x + x, at.z, radius)) at.x += x;
  if (!raidBlocked(walls, at.x, at.z + z, radius)) at.z += z;
}
/** Identical collision, speed and dash rules for authoritative movement and visual prediction. */
export function moveRaidPawn(walls:RaidWall[],p:RaidPawn,controls:RaidInput,dt:number,elapsed:number){
  if(p.state!=="alive"){p.vx=p.vz=0;return false;}
  dt=clamp(dt,0,.05);p.dashLeft=Math.max(0,p.dashLeft-dt);
  const dashed=controls.dash&&elapsed-p.dashAt>=4;
  if(dashed){p.dashAt=elapsed;p.dashLeft=.2;p.invulnerable=.25;}
  const n=Math.max(1,Math.hypot(controls.x,controls.z)),dx=controls.x/n,dz=controls.z/n;
  const speed=p.dashLeft>0?21:5.6*(1+p.perks.speed*.12);
  p.vx=dx*speed;p.vz=dz*speed;
  if(p.dashLeft>0&&Math.hypot(dx,dz)<.1){p.vx=Math.cos(p.angle)*speed;p.vz=Math.sin(p.angle)*speed;}
  raidMove(walls,p,p.vx*dt,p.vz*dt);
  if(Math.hypot(dx,dz)>.1)p.angle=Math.atan2(dz,dx);
  return dashed;
}
export function createRaid(id: string, map: RaidMap, seed: number, players: { id: string; profile: RaidProfile }[]): RaidRun {
  const run: RaidRun = { id, map, seed, rng: seed >>> 0 || 1, elapsed: 0, counter: 0, status: "active", pawns: [], walls: raidWalls(map), enemies: [], bullets: [], drops: [], chests: [], events: [], nextSpawn: 0.7, boss: false };
  run.pawns = players.map(({id, profile}, i) => ({ id, name: profile.name, skin: profile.skin, weapon: profile.weapon, x: (i - (players.length - 1) / 2) * 1.2, z: 23,
    vx: 0, vz: 0, angle: -Math.PI/2, hp: 100 + profile.upgrades.vitality * 12, maxHp: 100 + profile.upgrades.vitality * 12,
    state: "alive", dashAt: -10, dashLeft: 0, invulnerable: 1.5, shootAt: 0, downLeft: 0, bag: emptyRaidBag(), kills: 0, chests: 0, xp: 0, level: 1,
    perks: { damage:0,rate:0,vitality:0,magnet:0,speed:0,repair:0 }, choices: [], interactProgress: 0,
    damageMultiplier: 1 + profile.upgrades.power * 0.06, magnet: 1.25 + profile.upgrades.magnet * 0.25 }));
  [{x:0,z:18},{x:-15,z:5},{x:0,z:-1},{x:16,z:-12},{x:-7,z:-23},{x:13,z:23},{x:-17,z:-24}].forEach((p,i)=>run.chests.push({...p,id:++run.counter,opened:false,rare:i===4||i===6}));
  run.enemies.push({id:++run.counter,kind:"crawler",x:5,z:19,hp:42,maxHp:42,hitAt:-1,attackAt:0,angle:0});
  return run;
}
export function raidInteraction(run: RaidRun, pawn: RaidPawn): { kind: "revive" | "chest" | "exit"; id: string | number; title: string; seconds: number } | null {
  const down = run.pawns.find(p=>p.id!==pawn.id&&p.state==="down"&&raidDistance(p,pawn)<2.2);
  if(down)return{kind:"revive",id:down.id,title:`Поднять: ${down.name}`,seconds:1.8};
  const chest=run.chests.find(p=>!p.opened&&raidDistance(p,pawn)<2.1);
  if(chest)return{kind:"chest",id:chest.id,title:chest.rare?"Редкий контейнер":"Открыть контейнер",seconds:0.65};
  if(run.elapsed>=RAID_EXIT_AT&&raidDistance(pawn,{x:0,z:24})<3)return{kind:"exit",id:"exit",title:"Эвакуация",seconds:2.5};
  return null;
}
function clearShot(walls: RaidWall[], a: {x:number;z:number}, b:{x:number;z:number}) {
  const distance=raidDistance(a,b),steps=Math.ceil(distance/0.6);
  for(let i=1;i<steps;i++)if(raidBlocked(walls,a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,0.05))return false;
  return true;
}
function offerPerks(run: RaidRun, p: RaidPawn) {
  if(p.choices.length)return;
  const choices=(Object.keys(RAID_PERKS) as RaidPerk[]).filter(k=>p.perks[k]<3);
  for(let i=choices.length-1;i>0;i--){const j=Math.floor(random(run)*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
  p.choices=choices.slice(0,3); p.invulnerable=Math.max(p.invulnerable,3.5); event(run,"level",p);
}
export function selectRaidPerk(run: RaidRun, id: string, perk: RaidPerk) {
  const p=run.pawns.find(p=>p.id===id);
  if(!p||p.state!=="alive"||!p.choices.includes(perk))throw new Error("Улучшение сейчас недоступно.");
  p.perks[perk]++; p.choices=[];
  if(perk==="vitality"){p.maxHp+=25;p.hp=Math.min(p.maxHp,p.hp+45);}
  if(p.level-1>Object.values(p.perks).reduce((a,b)=>a+b,0))offerPerks(run,p);
}
function hurt(run: RaidRun, pawn: RaidPawn, damage: number) {
  if(pawn.state!=="alive"||pawn.invulnerable>0)return;
  pawn.hp=Math.max(0,pawn.hp-damage); pawn.invulnerable=0.45; event(run,"hit",pawn);
  if(pawn.hp===0){pawn.state=run.pawns.some(p=>p!==pawn&&p.state==="alive")?"down":"dead";pawn.downLeft=20;}
}
function enemyDeath(run: RaidRun, enemy: RaidEnemy, owner: string) {
  const pawn=run.pawns.find(p=>p.id===owner); if(pawn){pawn.kills++;pawn.hp=Math.min(pawn.maxHp,pawn.hp+pawn.perks.repair*2);}
  run.drops.push({id:++run.counter,kind:enemy.kind==="brute"?"core":"scrap",x:enemy.x,z:enemy.z,amount:enemy.kind==="brute"?2:2+Math.floor(random(run)*3)});
  if(random(run)<0.08)run.drops.push({id:++run.counter,kind:"med",x:enemy.x+0.4,z:enemy.z,amount:18});
  for(const p of run.pawns.filter(p=>p.state==="alive")){
    p.xp+=enemy.kind==="brute"?45:9;
    if(p.xp>=p.level*35){p.xp-=p.level*35;p.level++;offerPerks(run,p);}
  }
  event(run,"kill",enemy);
}
/** Fixed-step server combat. Input is direction/buttons only; all outcomes are derived. */
export function tickRaid(run: RaidRun, dt: number, input: Record<string,RaidInput>) {
  if(run.status!=="active")return;
  dt=clamp(dt,0,0.05);run.elapsed+=dt;
  const alive=run.pawns.filter(p=>p.state==="alive");
  for(const p of run.pawns){
    if(p.state==="down"){p.downLeft-=dt;if(p.downLeft<=0||!alive.length)p.state="dead";continue;}
    if(p.state!=="alive")continue;
    p.invulnerable=Math.max(0,p.invulnerable-dt);
    const controls=input[p.id]??{x:0,z:0,dash:false,interact:false};
    if(moveRaidPawn(run.walls,p,controls,dt,run.elapsed))event(run,"dash",p);
    const target=run.enemies.filter(e=>e.hp>0&&raidDistance(e,p)<RAID_WEAPONS[p.weapon].range&&clearShot(run.walls,p,e)).sort((a,b)=>raidDistance(a,p)-raidDistance(b,p))[0];
    if(target&&run.elapsed>=p.shootAt){
      const weapon=RAID_WEAPONS[p.weapon],angle=Math.atan2(target.z-p.z,target.x-p.x);p.angle=angle;
      p.shootAt=run.elapsed+weapon.rate*Math.max(0.4,1-p.perks.rate*0.15);
      const spread=p.weapon==="scatter"?[-0.18,-0.06,0.06,0.18]:[0];
      const firstRound=run.bullets.length;
      for(const offset of spread)run.bullets.push({id:++run.counter,owner:p.id,x:p.x,z:p.z,vx:Math.cos(angle+offset)*weapon.speed,vz:Math.sin(angle+offset)*weapon.speed,damage:weapon.damage*p.damageMultiplier*(1+p.perks.damage*0.2),left:weapon.range/weapon.speed,enemy:false,pierce:p.weapon==="arc"?2:0,hit:[]});
      event(run,"shot",p,{at:run.elapsed-dt,shot:{owner:p.id,enemy:false,rounds:run.bullets.slice(firstRound).map(b=>({id:b.id,vx:b.vx,vz:b.vz,life:b.left}))}});
    }
    const interaction=raidInteraction(run,p);
    const interactionKey=interaction?`${interaction.kind}:${interaction.id}`:undefined;
    if(p.interactTarget!==interactionKey){p.interactTarget=interactionKey;p.interactProgress=0;}
    if(controls.interact&&interaction){
      p.interactProgress+=dt;
      if(p.interactProgress>=interaction.seconds){
        if(interaction.kind==="chest"){
          const chest=run.chests.find(c=>c.id===interaction.id)!;
          if(!chest.opened){chest.opened=true;p.chests++;p.bag.scrap+=chest.rare?14:8;p.bag.data+=chest.rare?3:1;if(chest.rare)p.bag.core++;event(run,"chest",chest);}
        }else if(interaction.kind==="revive"){
          const friend=run.pawns.find(f=>f.id===interaction.id)!;
          if(friend.state==="down"){friend.state="alive";friend.hp=Math.round(friend.maxHp*0.4);friend.invulnerable=2;}
        }else{p.state="extracted";event(run,"extract",p);}
        p.interactProgress=0;
      }
    }else p.interactProgress=0;
    for(const drop of run.drops){
      if(drop.amount<=0||raidDistance(drop,p)>p.magnet+p.perks.magnet)continue;
      if(drop.kind==="med"){if(p.hp>=p.maxHp)continue;p.hp=Math.min(p.maxHp,p.hp+drop.amount);}
      else p.bag[drop.kind]+=drop.amount;
      drop.amount=0;
    }
  }
  if(run.elapsed>=run.nextSpawn&&alive.length&&run.enemies.length<55){
    const amount=run.elapsed>100?3:run.elapsed>45?2:1;
    for(let i=0;i<amount;i++){
      const angle=random(run)*Math.PI*2,focus=alive[Math.floor(random(run)*alive.length)],distance=9+random(run)*5;
      let x=clamp(focus.x+Math.cos(angle)*distance,-20.5,20.5),z=clamp(focus.z+Math.sin(angle)*distance,-26.5,26.5);
      if(raidBlocked(run.walls,x,z,0.5)||alive.some(p=>raidDistance(p,{x,z})<7))continue;
      const kind=random(run)<0.22?"drone":"crawler",hp=kind==="drone"?65:42+Math.floor(run.elapsed/40)*8;
      run.enemies.push({id:++run.counter,kind,x,z,hp,maxHp:hp,hitAt:-1,attackAt:run.elapsed+1,angle:0});
    }
    run.nextSpawn=run.elapsed+Math.max(0.55,1.25-run.elapsed/180);
  }
  if(!run.boss&&run.elapsed>90&&alive.length){run.boss=true;const at={x:0,z:-24};run.enemies.push({id:++run.counter,kind:"brute",...at,hp:700,maxHp:700,hitAt:-1,attackAt:0,angle:0});}
  for(const enemy of run.enemies){
    if(enemy.hp<=0)continue;
    const target=alive.filter(p=>p.state==="alive").sort((a,b)=>raidDistance(a,enemy)-raidDistance(b,enemy))[0];if(!target)continue;
    const distance=raidDistance(enemy,target),angle=Math.atan2(target.z-enemy.z,target.x-enemy.x);enemy.angle=angle;
    const speed=enemy.kind==="brute"?1.5:enemy.kind==="drone"?2.4:2.0+Math.min(0.8,run.elapsed/180);
    if(distance>(enemy.kind==="drone"?7:0.9)){
      const move={x:Math.cos(angle)*speed*dt,z:Math.sin(angle)*speed*dt};
      if(raidBlocked(run.walls,enemy.x+move.x,enemy.z+move.z,0.45)){
        const sign=enemy.id%2?1:-1;
        raidMove(run.walls,enemy,-Math.sin(angle)*speed*dt*sign,Math.cos(angle)*speed*dt*sign,0.45);
      }else raidMove(run.walls,enemy,move.x,move.z,0.45);
    }
    if(enemy.kind==="drone"&&distance<8&&run.elapsed>=enemy.attackAt&&clearShot(run.walls,enemy,target)){
      enemy.attackAt=run.elapsed+1.8;
      run.bullets.push({id:++run.counter,owner:"enemy",x:enemy.x,z:enemy.z,vx:Math.cos(angle)*8,vz:Math.sin(angle)*8,damage:14,left:2.1,enemy:true,pierce:0,hit:[]});
      const bullet=run.bullets.at(-1)!;event(run,"shot",enemy,{at:run.elapsed-dt,shot:{owner:"enemy",enemy:true,rounds:[{id:bullet.id,vx:bullet.vx,vz:bullet.vz,life:bullet.left}]}});
    }else if(distance<1.1&&run.elapsed>=enemy.attackAt){enemy.attackAt=run.elapsed+0.8;hurt(run,target,enemy.kind==="brute"?24:11);}
  }
  for(const bullet of run.bullets){
    if(bullet.left<=0)continue;
    const parts=Math.max(1,Math.ceil(Math.hypot(bullet.vx,bullet.vz)*dt/0.35));
    for(let i=0;i<parts&&bullet.left>0;i++){
      bullet.x+=bullet.vx*dt/parts;bullet.z+=bullet.vz*dt/parts;bullet.left-=dt/parts;
      if(raidBlocked(run.walls,bullet.x,bullet.z,0.05)){bullet.left=0;break;}
      if(bullet.enemy){const pawn=run.pawns.find(p=>p.state==="alive"&&raidDistance(p,bullet)<0.5);if(pawn){hurt(run,pawn,bullet.damage);bullet.left=0;}}
      else{const enemy=run.enemies.find(e=>e.hp>0&&!bullet.hit.includes(e.id)&&raidDistance(e,bullet)<(e.kind==="brute"?0.95:0.55));if(enemy){enemy.hp-=bullet.damage;enemy.hitAt=run.elapsed;bullet.hit.push(enemy.id);if(enemy.hp<=0)enemyDeath(run,enemy,bullet.owner);if(bullet.pierce--<=0)bullet.left=0;}}
    }
  }
  for(const bullet of run.bullets)if(bullet.left<=0)event(run,"impact",bullet,{impact:bullet.id});
  run.enemies=run.enemies.filter(e=>e.hp>0);run.bullets=run.bullets.filter(b=>b.left>0).slice(-180);run.drops=run.drops.filter(d=>d.amount>0).slice(-180);
  if(run.elapsed>=RAID_DURATION){for(const p of run.pawns)if(p.state==="alive"||p.state==="down")p.state="dead";}
  if(run.pawns.every(p=>p.state==="extracted"||p.state==="dead")){run.status="complete";}
}
export function raidReceipt(run: RaidRun,pawn: RaidPawn,now:number): RaidReceipt {
  const extracted=pawn.state==="extracted",value=raidBagValue(pawn.bag);
  return{id:run.id,outcome:extracted?"extracted":"lost",map:run.map,loot:extracted?{...pawn.bag}:emptyRaidBag(),value:extracted?value:0,credits:extracted?value+70:0,xp:Math.max(5,Math.floor((pawn.kills*10+pawn.chests*20+(extracted?100:0))*(extracted?1:0.3))),kills:pawn.kills,chests:pawn.chests,duration:Math.round(run.elapsed),at:now};
}
export function applyRaidReceipt(profile:RaidProfile,receipt:RaidReceipt){
  refreshRaidProfile(profile,receipt.at);profile.credits+=receipt.credits;profile.xp+=receipt.xp;profile.season.xp+=receipt.xp;profile.stats.runs++;profile.stats.kills+=receipt.kills;profile.daily.kills+=receipt.kills;profile.daily.chests+=receipt.chests;
  if(receipt.outcome==="extracted"){profile.stats.extracts++;profile.stats.streak++;profile.stats.bestLoot=Math.max(profile.stats.bestLoot,receipt.value);profile.daily.extracts++;}else profile.stats.streak=0;
  profile.lastRun=receipt;
}
export function updateRaidProfile(profile:RaidProfile,command:RaidCommand,now:number){
  refreshRaidProfile(profile,now);
  if(command.type==="equip"){
    if(!profile.skins.includes(command.skin))throw new Error("Сначала откройте этот образ.");
    if(profile.stats.extracts<RAID_WEAPONS[command.weapon].unlock)throw new Error("Это оружие откроется после успешных эвакуаций.");
    profile.name=raidName(command.name);profile.skin=command.skin;profile.weapon=command.weapon;
  }else if(command.type==="upgrade"){
    const level=profile.upgrades[command.upgrade];if(level>=5)throw new Error("Достигнут максимальный уровень.");
    const cost=raidUpgradeCost(level);if(profile.credits<cost)throw new Error("Не хватает жетонов. Вынесите добычу из рейда.");profile.credits-=cost;profile.upgrades[command.upgrade]++;
  }else if(command.type==="buySkin"){
    if(profile.skins.includes(command.skin))throw new Error("Образ уже открыт.");
    const cost=RAID_SKINS[command.skin].credits;if(profile.credits<cost)throw new Error("Не хватает жетонов.");profile.credits-=cost;profile.skins.push(command.skin);
  }else if(command.type==="daily"){
    const contract=RAID_CONTRACTS.find(c=>c.id===command.contract);if(!contract)throw new Error("Контракт не найден.");
    if(profile.daily.claimed.includes(contract.id)||profile.daily[contract.id]<contract.target)throw new Error("Контракт ещё не выполнен или награда уже получена.");
    profile.daily.claimed.push(contract.id);profile.credits+=contract.reward;profile.season.xp+=50;
  }else if(command.type==="season"){
    if(profile.season.xp<command.tier*150||profile.season.claimed.includes(command.tier)||command.tier<1||command.tier>8)throw new Error("Награда пока недоступна или уже получена.");
    profile.season.claimed.push(command.tier);profile.credits+=100+command.tier*25;
  }else throw new Error("Эта команда не меняет профиль.");
}
