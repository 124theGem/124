import { CarPhysics } from './CarPhysics';
import { CAR } from '../vehicles/CarConfig';
import type { RoadPoint } from '../tracks/CoastalTrack';
export interface RoadBoundary { barrierOffset: number; nearest(x:number,z:number): RoadPoint }
/** Three overlapping circles form a car-sized capsule, with impulses at contact points. */
export function resolveBarriers(car: CarPhysics, track: RoadBoundary) {
  let impact = 0;
  const radius = CAR.width / 2, half = CAR.length / 2 - radius;
  for (let iteration=0;iteration<6;iteration++) for (const along of [-half,0,half]) {
    const rx=Math.cos(car.heading)*along, rz=Math.sin(car.heading)*along;
    const road=track.nearest(car.x+rx,car.z+rz);
    const penetration=Math.abs(road.offset)+radius-track.barrierOffset;
    if(penetration < -0.025) continue;
    const side=Math.sign(road.offset), nx=-road.nx*side, nz=-road.nz*side;
    if(penetration>0){car.x+=nx*(penetration+0.002); car.z+=nz*(penetration+0.002);}
    const velocity=car.worldVelocity;
    const contactVx=velocity.x-car.yawRate*rz, contactVz=velocity.z+car.yawRate*rx;
    const normalSpeed=contactVx*nx+contactVz*nz;
    if(normalSpeed<0) {
      const cross=rx*nz-rz*nx;
      const impulse=-(1+CAR.restitution)*normalSpeed/(1/CAR.mass+cross*cross/CAR.inertia);
      velocity.x+=impulse*nx/CAR.mass; velocity.z+=impulse*nz/CAR.mass;
      // Small tangential friction without stopping a car scraping the wall.
      velocity.x*=0.985; velocity.z*=0.985;
      car.setWorldVelocity(velocity.x,velocity.z);
      car.yawRate+=cross*impulse/CAR.inertia;
      impact=Math.max(impact,-normalSpeed);
    }
  }
  return impact;
}
