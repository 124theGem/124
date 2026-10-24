import {describe,it,expect} from 'vitest';
import {RaidMotion} from '../src/raid/RaidMotion';
import {createRaid,freshRaidProfile,raidBlocked,tickRaid,type RaidSnapshot,type RaidRun,type RaidInput} from '../shared/raid';
const idle:RaidInput={x:0,z:0,dash:false,interact:false};
const right={...idle,x:1};
function world(){const run=createRaid('motion','dock',31,[{id:'me',profile:freshRaidProfile('Pilot',0)}]);run.enemies=[];run.nextSpawn=999;return run;}
function packet(run:RaidRun):RaidSnapshot{return{session:'fixture',me:'me',serverTime:0,profile:freshRaidProfile('Pilot',0),room:{code:'ABCDEF',owner:'me',members:[],run:structuredClone(run)},leaderboard:[],shop:{enabled:false,botUsername:null}};}
describe('RIFT RAID frame-rate independent presentation',()=>{
 it('reacts to direction and release in one frame without changing authoritative coordinates or rewards',()=>{
  const motion=new RaidMotion(),s=packet(world()),before=structuredClone(s);motion.accept(s,0);
  const moving=motion.frame(1/60,1/60,right)!;expect(moving.pawns[0].x).toBeCloseTo(5.6/60);
  const stopped=motion.frame(2/60,1/60,idle)!;expect(stopped.pawns[0].x).toBe(moving.pawns[0].x);expect(s).toEqual(before);
 });
 it('interpolates enemy movement continuously between infrequent network packets',()=>{
  const motion=new RaidMotion(),run=world();run.enemies=[{id:44,kind:'crawler',x:0,z:0,hp:42,maxHp:42,hitAt:-1,attackAt:0,angle:0}];motion.accept(packet(run),0);
  for(let i=1;i<12;i++)motion.frame(i/60,1/60,idle);
  run.elapsed=.2;run.enemies[0].x=.6;motion.accept(packet(run),.2,.12);
  const positions=Array.from({length:12},(_,i)=>motion.frame(.2+(i+1)/60,1/60,idle)!.enemies[0].x),changes=positions.slice(1).map((x,i)=>x-positions[i]);
  expect(changes.filter(d=>d>.001).length).toBeGreaterThanOrEqual(9);expect(Math.max(...changes)).toBeLessThan(.09);
 });
 it('renders a shot even when both its birth and impact occur between received snapshots',()=>{
  const motion=new RaidMotion(),run=world();motion.accept(packet(run),0);for(let i=1;i<20;i++)motion.frame(i/60,1/60,idle);
  run.elapsed=.35;run.events=[{id:100,kind:'shot',at:.1,x:0,z:0,shot:{owner:'me',enemy:false,rounds:[{id:99,vx:28,vz:0,life:.3}]}},{id:101,kind:'impact',at:.32,x:6.16,z:0,impact:99}];motion.accept(packet(run),.35,.25);
  const samples=Array.from({length:35},(_,i)=>motion.frame(.35+(i+1)/60,1/60,idle)!);
  const visible=samples.filter(s=>s.bullets.length);expect(visible.length).toBeGreaterThan(4);
  for(const s of visible){expect(s.bullets[0].x).toBeCloseTo((s.elapsed-.1)*28);expect(s.bullets[0].damage).toBe(0);expect(s.elapsed).toBeLessThan(.32);}
  expect(samples.at(-1)!.bullets).toHaveLength(0);expect(run.bullets).toHaveLength(0);
 });
 it('turns through the shortest arc instead of spinning when angles cross PI',()=>{
  const motion=new RaidMotion(),run=world();run.enemies=[{id:44,kind:'crawler',x:0,z:0,hp:42,maxHp:42,hitAt:-1,attackAt:0,angle:Math.PI-.05}];motion.accept(packet(run),0);motion.frame(.15,.05,idle);
  run.elapsed=.2;run.enemies[0].angle=-Math.PI+.05;motion.accept(packet(run),.2);
  const visual=motion.frame(.22,.02,idle)!;expect(Math.abs(visual.enemies[0].angle)).toBeGreaterThan(3);
 });
 it('uses real collision and dash rules for prediction and stops extrapolation after disconnection',()=>{
  const motion=new RaidMotion(),run=world();run.pawns[0].x=-5;run.pawns[0].z=12;motion.accept(packet(run),0);
  let last=0;
  for(let i=1;i<=120;i++){const p=motion.frame(i/60,1/60,{...idle,x:-1,dash:true})!.pawns[0];expect(raidBlocked(run.walls,p.x,p.z)).toBe(false);if(i===60)last=p.x;if(i===120)expect(p.x).toBe(last);}
 });
 it('freezes solo perk selection and discards history when a new raid starts',()=>{
  const motion=new RaidMotion(),run=world();run.pawns[0].choices=['damage'];motion.accept(packet(run),0);
  expect(motion.frame(.05,.05,right)!.pawns[0].x).toBe(0);
  const next=world();next.id='next-raid';next.pawns[0].x=10;motion.accept(packet(next),1);
  expect(motion.frame(1.01,.01,idle)!.pawns[0].x).toBe(10);expect(motion.debug()!.bullets).toHaveLength(0);
 });
 it('stays smooth and reconciles with the actual simulation under 140–240 ms variable round trips',()=>{
  const motion=new RaidMotion(),run=world(),queue:{at:number;sent:number;input:RaidInput}[]=[],responses:{at:number;sent:number;state:RaidSnapshot}[]=[];
  motion.accept(packet(run),0);let serverInput=idle,nextSend=0,previous=0,maxStep=0,initial=0,frames=0;
  for(let i=1;i<=210;i++){
   const now=i/60,input=now<.8?right:now<1?idle:now<1.8?{...idle,x:-1}:idle;
   if(now>=nextSend){nextSend=now+.066;queue.push({at:now+.065+.025*Math.sin(i),sent:now,input});}
   while(queue[0]&&queue[0].at<=now){const q=queue.shift()!;serverInput=q.input;responses.push({at:now+.085+.025*Math.cos(i),sent:q.sent,state:packet(run)});}
   tickRaid(run,1/60,{me:serverInput});
   while(responses[0]&&responses[0].at<=now){const response=responses.shift()!;motion.accept(response.state,now,response.sent);}
   const p=motion.frame(now,1/60,input)!.pawns[0];maxStep=Math.max(maxStep,Math.abs(p.x-previous));if(Math.abs(p.x-previous)>.001)frames++;previous=p.x;if(i===3)initial=p.x;
  }
  expect(initial).toBeGreaterThan(.2);expect(maxStep).toBeLessThan(.3);expect(frames).toBeGreaterThan(80);expect(Math.abs(previous-run.pawns[0].x)).toBeLessThan(.2);
 });
 it('preserves the authoritative fire and impact endpoints for every emitted round',()=>{
  const run=createRaid('fire','dock',31,[{id:'me',profile:freshRaidProfile('Pilot',0)}]);
  for(let i=0;i<60;i++)tickRaid(run,1/60,{me:idle});
  const shots=run.events.filter(e=>e.shot),impacts=run.events.filter(e=>e.impact!==undefined);expect(shots.length).toBeGreaterThan(0);expect(impacts.length).toBeGreaterThan(0);
  const rounds=new Set(shots.flatMap(e=>e.shot!.rounds.map(r=>r.id)));expect(impacts.every(e=>rounds.has(e.impact!))).toBe(true);
 });
});
