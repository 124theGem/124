import * as T from 'three';
import type { CarPhysics } from '../physics/CarPhysics';
import { CAR } from './CarConfig';

export class Car {
  readonly group=new T.Group();
  private body=new T.Group();
  private frontWheels:T.Group[]=[];
  private tires:T.Group[]=[];
  private wheelAngle=0;
  private brakeMaterial=new T.MeshStandardMaterial({color:0xff3425,emissive:0xff1100,emissiveIntensity:0.5});
  constructor() {
    const paint=new T.MeshPhysicalMaterial({color:0xd72a27,metalness:0.5,roughness:0.24,clearcoat:1});
    const dark=new T.MeshStandardMaterial({color:0x16262c,roughness:0.55});
    const glass=new T.MeshPhysicalMaterial({color:0x203f4c,metalness:0.55,roughness:0.13,clearcoat:1});
    const lamp=new T.MeshStandardMaterial({color:0xfff4ce,emissive:0xffecc0,emissiveIntensity:1});
    const mesh=(geometry:T.BufferGeometry, material:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.body) => {
      const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
    };
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:T.Material,parent:T.Object3D=this.body)=>mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent);
    box(0,0.57,0,4.25,0.5,1.8,paint);
    box(0.98,0.83,0,1.95,0.22,1.69,paint);
    box(-1.48,0.86,0,1.1,0.20,1.75,paint);
    const cabin=mesh(new T.CylinderGeometry(0.85,1.02,0.68,4,1,false,Math.PI/4),glass,-0.28,1.11,0);
    cabin.scale.set(1.52,1,0.96);
    box(-0.37,1.47,0,1.24,0.10,1.34,paint);
    // Window pillars and mirrors give the silhouette a recognizable coupe profile.
    for(const side of [-1,1]) {
      box(-0.38,1.17,side*0.78,0.09,0.52,0.07,paint);
      box(0.48,1.01,side*1.01,0.32,0.13,0.2,paint);
      box(0,0.43,side*0.94,3.3,0.12,0.1,dark);
      box(1.94,0.76,side*0.58,0.12,0.14,0.45,lamp);
      box(-2.14,0.78,side*0.60,0.06,0.12,0.52,this.brakeMaterial);
      box(0.82,0.96,side*0.48,0.48,0.025,0.19,dark);
      box(-1.83,1.08,side*0.61,0.12,0.45,0.10,dark);
    }
    box(2.12,0.43,0,0.18,0.20,1.77,dark);
    box(-2.13,0.40,0,0.18,0.25,1.8,dark);
    box(2.20,0.54,0,0.06,0.16,0.78,dark);
    box(-1.88,1.31,0,0.39,0.11,2.02,dark);
    box(-2.25,0.36,-0.58,0.16,0.13,0.23,new T.MeshStandardMaterial({color:0xabab9f,metalness:0.9}));
    const rubber=new T.MeshStandardMaterial({color:0x172126,roughness:0.95});
    const alloy=new T.MeshStandardMaterial({color:0xb7c6c9,metalness:0.8,roughness:0.22});
    const tireGeo=new T.CylinderGeometry(CAR.wheelRadius,CAR.wheelRadius,0.28,12);tireGeo.rotateX(Math.PI/2);
    const rimGeo=new T.CylinderGeometry(0.23,0.23,0.29,10);rimGeo.rotateX(Math.PI/2);
    for(const x of [CAR.frontAxle,-CAR.rearAxle]) for(const side of [-1,1]) {
      const pivot=new T.Group();pivot.position.set(x,0.37,side*0.92);this.group.add(pivot);
      const wheel=new T.Group();pivot.add(wheel);
      mesh(tireGeo,rubber,0,0,0,wheel);mesh(rimGeo,alloy,0,0,0,wheel);
      box(0,0,side*0.155,0.4,0.045,0.012,dark,wheel);
      box(0,0,side*0.16,0.045,0.4,0.012,dark,wheel);
      this.tires.push(wheel);if(x>0)this.frontWheels.push(pivot);
    }
    this.group.add(this.body);
  }
  update(car:CarPhysics,dt:number,braking:boolean) {
    this.group.position.set(car.x,0.14,car.z);this.group.rotation.y=-car.heading;
    for(const wheel of this.frontWheels)wheel.rotation.y=-car.steer;
    this.wheelAngle+=car.vx/CAR.wheelRadius*dt;
    for(const tire of this.tires)tire.rotation.z=-this.wheelAngle;
    const blend=1-Math.exp(-8*dt);
    this.body.rotation.z+=(-car.acceleration*0.006-this.body.rotation.z)*blend;
    this.body.rotation.x+=(car.yawRate*car.vx*0.003-this.body.rotation.x)*blend;
    this.brakeMaterial.emissiveIntensity=braking?3:0.6;
  }
}
