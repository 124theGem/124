import {
  moveRaidPawn,raidMove,RAID_WEAPONS,
  type RaidRun,type RaidPawn,type RaidInput,type RaidSnapshot,type RaidBullet,
} from '../../shared/raid';

const idle=():RaidInput=>({x:0,z:0,dash:false,interact:false});
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
type Frame={run:RaidRun;received:number};
type Control={at:number;input:RaidInput};
type Trace={id:number;owner:string;enemy:boolean;x:number;z:number;vx:number;vz:number;born:number;life:number;end?:number};

/** Presentation only: never mutates snapshots, applies damage or grants rewards. */
export class RaidMotion {
  private frames:Frame[]=[];
  private controls:Control[]=[];
  private traces=new Map<number,Trace>();
  private eventId=0;
  private me='';
  private pawn?:RaidPawn;
  private predictedAt=0;
  private predictedElapsed=0;
  private offset={x:0,z:0};
  private heading=0;
  private playhead=0;
  private interval=.08;
  private delay=.1;
  private rendered:RaidRun|null=null;

  accept(snapshot:RaidSnapshot,received:number,sent=received){
    const run=snapshot.room.run;
    if(!run){this.reset();return;}
    const previous=this.frames.at(-1),fresh=previous?.run.id!==run.id;
    if(fresh){this.reset();this.me=snapshot.me;this.playhead=Math.max(0,run.elapsed-.1);}
    else if(run.elapsed<previous.run.elapsed)return;
    if(previous&&!fresh&&run.elapsed>previous.run.elapsed){
      this.interval+= (clamp(received-previous.received,.03,.5)-this.interval)*.15;
      // Leave enough history for the next packet, including typical mobile jitter.
      this.delay=clamp(this.interval*1.4,.1,.28);
    }
    if(this.frames.at(-1)?.run.elapsed===run.elapsed)this.frames.pop();
    this.frames.push({run,received});this.frames=this.frames.slice(-16);
    this.ingest(run);
    const authoritative=run.pawns.find(p=>p.id===this.me);
    if(!authoritative)return;
    const old=this.pawn,visible=old?{x:old.x+this.offset.x,z:old.z+this.offset.z}:undefined;
    this.pawn=structuredClone(authoritative);
    // The server samples its old held input before acknowledging this request.
    // Replay the local control timeline since that request, rather than pulling
    // the player back to the delayed server coordinate on every response.
    const from=Math.max(sent,received-.65);
    this.predictedElapsed=run.elapsed;
    if(!this.paused(run))this.replay(from,received,run);
    this.predictedAt=received;
    if(!fresh&&visible&&old?.state===authoritative.state&&Math.hypot(visible.x-this.pawn.x,visible.z-this.pawn.z)<4){
      this.offset={x:visible.x-this.pawn.x,z:visible.z-this.pawn.z};
    }else{this.offset={x:0,z:0};this.heading=this.pawn.angle;}
  }

  frame(now:number,dt:number,input:RaidInput):RaidRun|null{
    const newest=this.frames.at(-1);
    if(!newest||!this.pawn)return this.rendered=null;
    const last=this.controls.at(-1)?.input;
    if(!last||last.x!==input.x||last.z!==input.z||last.dash!==input.dash||last.interact!==input.interact)this.controls.push({at:now-Math.max(0,dt),input:{...input}});
    while(this.controls.length>1&&this.controls[1].at<now-2)this.controls.shift();
    const run=newest.run,paused=this.paused(run),age=Math.max(0,now-newest.received);
    const duration=clamp(now-this.predictedAt,0,.05);this.predictedAt=now;
    if(!paused&&age<.65){this.predictedElapsed+=duration;moveRaidPawn(run.walls,this.pawn,input,duration,this.predictedElapsed);}
    // Settle small network corrections smoothly; a stale connection never causes
    // unlimited extrapolation. Collision rules constrain both prediction and correction.
    const decay=Math.exp(-18*Math.max(0,dt));this.offset.x*=decay;this.offset.z*=decay;
    const target=run.elapsed+Math.min(age,.1)-this.delay;
    const maxTime=paused?run.elapsed:run.elapsed+Math.min(age,.1);
    this.playhead=Math.min(maxTime,this.playhead+Math.max(0,dt)*clamp(1+(target-this.playhead)*6,0,1.25));
    const visual=this.sample(this.playhead);
    const own=visual.pawns.findIndex(p=>p.id===this.me);
    if(own>=0){
      const pos={x:this.pawn.x,z:this.pawn.z};raidMove(run.walls,pos,this.offset.x,this.offset.z);
      // Use the server's aim while a target is in weapon range; interpolate angles
      // through the shortest arc so crossing -PI/PI never spins the character.
      const auth=run.pawns.find(p=>p.id===this.me)!;
      const aiming=run.enemies.some(e=>Math.hypot(e.x-pos.x,e.z-pos.z)<RAID_WEAPONS[auth.weapon].range);
      this.heading=angle(this.heading,aiming?auth.angle:this.pawn.angle,1-Math.exp(-22*Math.max(0,dt)));
      visual.pawns[own]={...this.pawn,...pos,angle:this.heading};
    }
    this.rendered=visual;return visual;
  }

  private paused(run:RaidRun){return run.status!=='active'||(run.pawns.length===1&&run.pawns[0].choices.length>0);}
  private replay(from:number,to:number,run:RaidRun){
    let at=from,input=idle();
    for(const control of this.controls){
      if(control.at<=from){input=control.input;continue;}
      if(control.at>=to)break;
      this.integrate(run,input,control.at-at);at=control.at;input=control.input;
    }
    this.integrate(run,input,to-at);
  }
  private integrate(run:RaidRun,input:RaidInput,duration:number){
    while(duration>.00001){const dt=Math.min(1/60,duration);this.predictedElapsed+=dt;moveRaidPawn(run.walls,this.pawn!,input,dt,this.predictedElapsed);duration-=dt;}
  }

  private sample(time:number):RaidRun{
    let a=this.frames[0],b=a;
    for(const frame of this.frames){if(frame.run.elapsed<=time)a=frame;if(frame.run.elapsed>=time){b=frame;break;}b=frame;}
    const span=b.run.elapsed-a.run.elapsed,t=span>0?clamp((time-a.run.elapsed)/span,0,1):0;
    const latest=this.frames.at(-1)!,extra=clamp(time-a.run.elapsed,0,.1);
    const lerp=<T extends {id:string|number;x:number;z:number;angle:number}>(from:T[],to:T[],radius:number)=>{
      const targets=new Map(to.map(p=>[p.id,p]));
      return from.map(p=>{
        const end=targets.get(p.id);
        if(span>0&&end)return{...p,x:p.x+(end.x-p.x)*t,z:p.z+(end.z-p.z)*t,angle:angle(p.angle,end.angle,t)};
        if(a===latest&&extra>0&&!this.paused(latest.run)){
          const previous=this.frames.at(-2)?.run;
          const old=previous&&(radius===.4?previous.pawns:previous.enemies).find(e=>e.id===p.id);
          if(old&&previous){const d=latest.run.elapsed-previous.elapsed;if(d>.001){const pos={x:p.x,z:p.z},vx=(p.x-old.x)/d,vz=(p.z-old.z)/d;raidMove(a.run.walls,pos,vx*extra,vz*extra,radius);return{...p,...pos};}}
        }
        return{...p};
      });
    };
    const pawns=lerp(a.run.pawns,b.run.pawns,.4),enemies=lerp(a.run.enemies,b.run.enemies,.45);
    const bullets:RaidBullet[]=[];
    for(const trace of this.traces.values()){
      const age=time-trace.born;
      if(age<0||age>trace.life||time>=(trace.end??Infinity))continue;
      bullets.push({id:trace.id,owner:trace.owner,enemy:trace.enemy,x:trace.x+trace.vx*age,z:trace.z+trace.vz*age,vx:trace.vx,vz:trace.vz,left:trace.life-age,damage:0,pierce:0,hit:[]});
    }
    return{...a.run,elapsed:time,pawns,enemies,bullets,events:latest.run.events.filter(e=>e.at<=time)};
  }
  private ingest(run:RaidRun){
    for(const event of run.events){
      if(event.id<=this.eventId)continue;this.eventId=event.id;
      if(event.shot)for(const round of event.shot.rounds)this.traces.set(round.id,{id:round.id,owner:event.shot.owner,enemy:event.shot.enemy,x:event.x,z:event.z,vx:round.vx,vz:round.vz,born:event.at,life:round.life});
      if(event.impact!==undefined){const trace=this.traces.get(event.impact);if(trace)trace.end=event.at;}
    }
    // A late join/reconnect may no longer have the original fire event in history.
    for(const bullet of run.bullets)if(!this.traces.has(bullet.id)){
      const owner=run.pawns.find(p=>p.id===bullet.owner),weapon=owner?RAID_WEAPONS[owner.weapon]:null;
      const life=bullet.enemy?2.1:weapon?weapon.range/weapon.speed:bullet.left;
      const age=Math.max(0,life-bullet.left);
      this.traces.set(bullet.id,{id:bullet.id,owner:bullet.owner,enemy:bullet.enemy,x:bullet.x-bullet.vx*age,z:bullet.z-bullet.vz*age,vx:bullet.vx,vz:bullet.vz,born:run.elapsed-age,life});
    }
    for(const[id,trace]of this.traces)if(trace.born+trace.life<run.elapsed-1)this.traces.delete(id);
  }
  debug(){return this.rendered;}
  private reset(){this.frames=[];this.traces.clear();this.controls=[];this.eventId=0;this.pawn=undefined;this.offset={x:0,z:0};this.rendered=null;this.interval=.08;this.delay=.1;}
}
