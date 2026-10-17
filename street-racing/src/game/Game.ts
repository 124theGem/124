import * as T from 'three';
import { CarPhysics } from '../physics/CarPhysics';
import { resolveBarriers } from '../physics/Collision';
import { CoastalTrack } from '../tracks/CoastalTrack';
import { Car } from '../vehicles/Car';
import { DrivingEffects } from '../effects/DrivingEffects';
import { Controls } from '../controls/Controls';
import { HUD } from '../ui/HUD';
import { FixedStepper } from './GameLoop';
import { FollowCamera } from './Camera';
import { createScene } from './Scene';
import { RaceState } from './RaceState';

export class Game {
  readonly physics=new CarPhysics();
  readonly track=new CoastalTrack();
  readonly race=new RaceState();
  private renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  private world=createScene(this.renderer,this.track);
  private car=new Car();
  private camera=new FollowCamera();
  private hud=new HUD(this.track);
  private controls=new Controls();
  private effects=new DrivingEffects(this.world.scene);
  private clock=new FixedStepper();
  private abort=new AbortController();
  private paused=false;
  private previousTime=0;
  private fps=60;
  private fpsTime=0;
  private fpsFrames=0;
  private hudTimer=0;
  private started=false;
  private storedBestKey='coastline-best-v1';
  constructor(){
    this.renderer.domElement.className='game-canvas';
    document.querySelector('#app')!.prepend(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.world.scene.add(this.car.group);
    try{const saved=Number(localStorage.getItem(this.storedBestKey));if(saved>0&&Number.isFinite(saved))this.race.best=saved;}catch{/* Storage is optional in embedded browsers. */}
    this.controls.onReset=()=>this.reset();this.controls.onCamera=()=>this.camera.mode=1-this.camera.mode;this.controls.onPause=()=>this.pause(!this.paused);
    this.hud.button('reset',()=>this.reset());this.hud.button('camera',()=>this.camera.mode=1-this.camera.mode);
    this.hud.button('pause',()=>this.pause(!this.paused));this.hud.button('help',()=>this.pause(true,true));this.hud.button('resume',()=>this.pause(false));
    const signal=this.abort.signal;
    window.addEventListener('resize',()=>this.resize(),{signal});
    window.addEventListener('blur',()=>this.pause(true),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause(true);},{signal});
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.pause(true);this.hud.toast('Графический контекст потерян. Обновите страницу.');},{signal});
    window.addEventListener('pagehide',()=>this.dispose(),{signal,once:true});
    this.resize();this.reset();
    this.hud.toast(matchMedia('(pointer:coarse)').matches?'Удерживай газ и поворачивай. 〰 — ручник.':'W / ↑ — газ. Space — ручник. Побережье ждёт.');
    this.renderer.setAnimationLoop(this.frame);
    // Read-only diagnostics, enabled explicitly for browser smoke checks.
    if(new URLSearchParams(location.search).has('debug'))Object.defineProperty(window,'__coastline',{configurable:true,value:{
      snapshot:()=>({x:this.physics.x,z:this.physics.z,speed:this.physics.speed,slip:this.physics.slipAngle,rearGrip:this.physics.rearGrip,heading:this.physics.heading,
        steer:this.physics.steer,slipIntensity:this.physics.slipIntensity,lap:this.race.lap,score:this.race.score,paused:this.paused,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,fps:this.fps,...this.effects.stats})}});
  }
  private resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.resize();}
  private reset(){const p=this.track.point(0);this.physics.reset(p.x,p.z,Math.atan2(p.tz,p.tx));this.race.reset();this.started=false;this.clock.reset();this.camera.update(this.physics,1,true);this.car.update(this.physics,0,false);if(this.paused)this.pause(false);}
  private pause(paused:boolean,help=false){this.paused=paused;this.controls.clear();this.clock.reset();this.hud.pause(paused,help);}
  private frame=(time:number)=>{
    const rawElapsed=this.previousTime?(time-this.previousTime)/1000:0;this.previousTime=time;
    const elapsed=Math.min(rawElapsed,0.25);
    if(rawElapsed>0){this.fpsTime+=rawElapsed;this.fpsFrames++;if(this.fpsTime>=0.75){this.fps=this.fpsFrames/this.fpsTime;this.fpsTime=0;this.fpsFrames=0;}}
    const input=this.controls.read();
    if(!this.paused){
      this.clock.advance(elapsed,dt=>{
        const road=this.track.nearest(this.physics.x,this.physics.z);
        this.physics.surface=road.distance<=7?'asphalt':road.distance<=8?'shoulder':'grass';
        this.physics.step(input,dt);
        const impact=resolveBarriers(this.physics,this.track);
        this.effects.step(this.physics,dt,impact);
        if(this.physics.speed>0.5)this.started=true;
        if(this.started){const best=this.race.best;const progress=this.track.nearest(this.physics.x,this.physics.z).index/this.track.count;
          this.race.update(dt,progress,this.physics.speed,this.physics.slipAngle,this.physics.surface==='asphalt');
          if(best!==this.race.best){try{localStorage.setItem(this.storedBestKey,String(this.race.best));}catch{}this.hud.toast('Новый круг! Продолжай в том же ритме.');}}
      });
      this.car.update(this.physics,elapsed,input.brake>0||input.handbrake);this.camera.update(this.physics,elapsed);
    }
    this.world.sun.position.set(this.physics.x-60,100,this.physics.z+40);this.world.sun.target.position.set(this.physics.x,0,this.physics.z);this.world.sun.target.updateMatrixWorld();
    this.hudTimer+=elapsed;if(this.hudTimer>0.06){this.hud.update(this.physics,this.race,this.fps);this.hudTimer=0;}
    const cam=this.camera.camera;this.effects.render(innerHeight*this.renderer.getPixelRatio()/(cam.top-cam.bottom));
    this.renderer.render(this.world.scene,cam);
  };
  dispose(){
    this.renderer.setAnimationLoop(null);this.abort.abort();this.controls.dispose();this.effects.dispose();this.hud.dispose();
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
    this.world.scene.traverse(obj=>{if(obj instanceof T.Mesh||obj instanceof T.Points){geometries.add(obj.geometry);for(const material of Array.isArray(obj.material)?obj.material:[obj.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);}}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.world.dispose();this.renderer.dispose();
  }
}
