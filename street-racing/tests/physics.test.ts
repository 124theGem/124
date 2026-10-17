import { describe,it,expect } from 'vitest';
import { CarPhysics,IDLE,type Input } from '../src/physics/CarPhysics';
import { CAR } from '../src/vehicles/CarConfig';
import { tireForce } from '../src/physics/TireForces';
import { FixedStepper } from '../src/game/GameLoop';
import { resolveBarriers } from '../src/physics/Collision';
import { RaceState } from '../src/game/RaceState';
const gas={...IDLE,throttle:1};
function run(car:CarPhysics,seconds:number,input:Input=gas){for(let i=0;i<Math.round(seconds*60);i++)car.step(input,CAR.fixedStep);}

describe('dynamic bicycle vehicle',()=>{
  it('accelerates gradually to 100 km/h in approximately seven seconds',()=>{
    const car=new CarPhysics();run(car,1);expect(car.vx).toBeGreaterThan(3);expect(car.vx).toBeLessThan(7);
    let t=1;while(car.vx<100/3.6&&t<12){run(car,1/60);t+=1/60;}
    expect(t).toBeGreaterThan(5.5);expect(t).toBeLessThan(8.5);expect(car.vy).toBe(0);
  });
  it('has a bounded top speed near 180 km/h',()=>{const car=new CarPhysics();run(car,60);expect(car.speed*3.6).toBeGreaterThan(165);expect(car.speed*3.6).toBeLessThanOrEqual(181);});
  it('coasts with inertia and brakes substantially faster',()=>{
    const coast=new CarPhysics(),brake=new CarPhysics();coast.vx=brake.vx=25;
    run(coast,2,IDLE);run(brake,2,{...IDLE,brake:1});
    expect(coast.vx).toBeGreaterThan(22);expect(coast.vx).toBeLessThan(25);expect(brake.vx).toBeLessThan(10);
  });
  it('engages reverse only after braking and can return to forward motion',()=>{const car=new CarPhysics();run(car,3,{...IDLE,brake:1});expect(car.vx).toBeLessThan(-2);expect(car.vx).toBeGreaterThan(-10);run(car,4,gas);expect(car.vx).toBeGreaterThan(2);});
  it('limits combined longitudinal and lateral forces to the friction circle',()=>{
    for(const slip of [-1,-0.2,0,0.2,1])for(const drive of [-10000,0,3000,10000]){const {fx,fy,limit}=tireForce(slip,65000,6000,0.9,drive);expect(Math.hypot(fx,fy)).toBeLessThanOrEqual(limit+1e-6);}
  });
  it('steers smoothly and produces actual lateral motion rather than model-only rotation',()=>{
    const car=new CarPhysics();car.vx=23;run(car,0.8,{...gas,steer:0.7,handbrake:true});
    expect(car.steer).toBeGreaterThan(0);expect(Math.abs(car.yawRate)).toBeGreaterThan(0.1);
    expect(Math.abs(car.vy)).toBeGreaterThan(1);expect(Math.abs(car.slipAngle)).toBeGreaterThan(0.1);
    expect(car.rearGrip).toBeCloseTo(CAR.handbrakeGrip);expect(car.slipIntensity).toBeGreaterThan(0);
  });
  it('restores grip progressively and permits recovery with countersteering',()=>{
    const car=new CarPhysics();car.vx=20;run(car,0.55,{...gas,steer:0.7,handbrake:true});
    const before=Math.abs(car.slipAngle);expect(before).toBeGreaterThan(0.08);
    car.step({...IDLE,steer:-0.5},CAR.fixedStep);expect(car.rearGrip).toBeGreaterThan(CAR.handbrakeGrip);expect(car.rearGrip).toBeLessThan(1);
    // Driver feedback: countersteer into the slide and reduce throttle until aligned.
    for(let i=0;i<240;i++){const steer=Math.max(-1,Math.min(1,car.slipAngle*2.4-car.yawRate*0.8));car.step({...IDLE,throttle:0.25,steer},CAR.fixedStep);}
    expect(car.rearGrip).toBe(1);expect(Math.abs(car.slipAngle)).toBeLessThan(before);expect(Math.abs(car.slipAngle)).toBeLessThan(0.12);expect(Number.isFinite(car.x)).toBe(true);
  });
  it('has less available grip off asphalt',()=>{const road=new CarPhysics(),grass=new CarPhysics();road.vx=grass.vx=20;grass.surface='grass';road.step({...IDLE,steer:1},1/60);grass.step({...IDLE,steer:1},1/60);expect(Math.abs(grass.frontForce)).toBeLessThan(Math.abs(road.frontForce));});
  it('stays finite under extended changing inputs',()=>{const car=new CarPhysics();for(let i=0;i<12000;i++){car.step({throttle:i%600<400?1:0,brake:i%600>=500?1:0,steer:Math.sin(i/90),handbrake:i%450<40},1/60);expect(Number.isFinite(car.speed+car.heading+car.x+car.z)).toBe(true);expect(car.speed).toBeLessThan(65);}});
});
describe('fixed step and collision safety',()=>{
  it('simulates the same motion at 30, 60 and 144 render FPS',()=>{
    const result=[30,60,144].map(fps=>{const car=new CarPhysics(),clock=new FixedStepper();let steps=0;for(let frame=0;frame<fps*5;frame++)clock.advance(1/fps,dt=>{car.step(gas,dt);steps++;});return {car,steps};});
    for(const r of result){expect(r.steps).toBe(300);expect(r.car.x).toBeCloseTo(result[0].car.x,8);expect(r.car.vx).toBeCloseTo(result[0].car.vx,8);}
  });
  it('bounds catch-up after a long pause',()=>{const clock=new FixedStepper();expect(clock.advance(10,()=>{})).toBe(15);});
  it('resolves capsule penetration and dissipates impact energy without rotating position',()=>{
    const track={barrierOffset:10.7,nearest:(x:number,z:number)=>({x,z:0,tx:1,tz:0,nx:0,nz:1,index:0,distance:Math.abs(z),offset:z})};
    const car=new CarPhysics();car.z=10.5;car.vx=10;car.vy=8;const energy=car.speed**2;
    const impact=resolveBarriers(car,track);expect(impact).toBeGreaterThan(0);expect(car.z+CAR.width/2).toBeLessThanOrEqual(10.701);expect(car.worldVelocity.z).toBeLessThanOrEqual(0);expect(car.speed**2).toBeLessThan(energy);expect(car.heading).toBe(0);
  });
});
describe('lap and drift scoring',()=>{
  it('requires all ordered sectors and a forward start crossing',()=>{const race=new RaceState();race.update(10,0.98,20,0,true);race.update(1,0.01,20,0,true);expect(race.lap).toBe(1);for(const p of [0.26,0.51,0.76,0.97,0.01])race.update(1,p,20,0,true);expect(race.lap).toBe(2);expect(race.best).toBe(16);});
  it('does not award stationary, offroad or reverse-facing spin points',()=>{const race=new RaceState();race.update(1,0,0,0.5,true);race.update(1,0,20,0.5,false);race.update(1,0,20,2,true);expect(race.score).toBe(0);race.update(1,0,20,0.5,true);expect(race.score).toBeGreaterThan(0);});
});
