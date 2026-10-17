import * as T from 'three';
import type { CarPhysics } from '../physics/CarPhysics';

interface Particle { x:number;y:number;z:number;vx:number;vy:number;vz:number;life:number;max:number;size:number;spark:boolean }
export class DrivingEffects {
  private readonly capacity=128;
  private particles:Particle[]=Array.from({length:this.capacity},()=>({x:0,y:-100,z:0,vx:0,vy:0,vz:0,life:0,max:1,size:1,spark:false}));
  private cursor=0;
  private positions=new Float32Array(this.capacity*3);
  private colors=new Float32Array(this.capacity*3);
  private sizes=new Float32Array(this.capacity);
  private alphas=new Float32Array(this.capacity);
  private geometry=new T.BufferGeometry();
  private material:T.ShaderMaterial;
  private points:T.Points;
  private skidGeometry=new T.BufferGeometry();
  private skidPositions=new Float32Array(1500*18);
  private skidMesh:T.Mesh;
  private skidCursor=0;
  private previous:(T.Vector3|null)[]=[null,null];
  get stats(){return {smokeParticles:this.particles.filter(p=>p.life>0&&!p.spark).length,skidSegments:Math.min(this.skidCursor,1500)};}
  constructor(scene:T.Scene) {
    this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    this.geometry.setAttribute('color',new T.BufferAttribute(this.colors,3));
    this.geometry.setAttribute('aSize',new T.BufferAttribute(this.sizes,1));
    this.geometry.setAttribute('aAlpha',new T.BufferAttribute(this.alphas,1));
    this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,uniforms:{pixelScale:{value:12}},
      vertexShader:'attribute float aSize; attribute float aAlpha; varying vec3 vColor; varying float vAlpha; uniform float pixelScale; void main(){vColor=color;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize*pixelScale;}',
      fragmentShader:'varying vec3 vColor; varying float vAlpha; void main(){float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0)discard;gl_FragColor=vec4(vColor,vAlpha*smoothstep(1.0,0.15,d));}'});
    this.points=new T.Points(this.geometry,this.material);this.points.frustumCulled=false;scene.add(this.points);
    this.skidGeometry.setAttribute('position',new T.BufferAttribute(this.skidPositions,3).setUsage(T.DynamicDrawUsage));this.skidGeometry.setDrawRange(0,0);
    this.skidMesh=new T.Mesh(this.skidGeometry,new T.MeshBasicMaterial({color:0x20292c,transparent:true,opacity:0.48,depthWrite:false,side:T.DoubleSide}));this.skidMesh.frustumCulled=false;scene.add(this.skidMesh);
  }
  step(car:CarPhysics,dt:number,impact:number) {
    const c=Math.cos(car.heading),s=Math.sin(car.heading);
    for(let side=0;side<2;side++) {
      const offset=side?0.85:-0.85;
      const p=new T.Vector3(car.x-1.4*c-offset*s,0.16,car.z-1.4*s+offset*c);
      if(car.slipIntensity>0.13&&car.surface==='asphalt') {
        const prev=this.previous[side];
        if(prev&&prev.distanceTo(p)>0.09&&prev.distanceTo(p)<3){
          const dx=p.x-prev.x,dz=p.z-prev.z,len=Math.hypot(dx,dz),nx=-dz/len*0.14,nz=dx/len*0.14;
          const verts=[prev.x+nx,0.16,prev.z+nz,prev.x-nx,0.16,prev.z-nz,p.x+nx,0.16,p.z+nz,p.x+nx,0.16,p.z+nz,prev.x-nx,0.16,prev.z-nz,p.x-nx,0.16,p.z-nz];
          this.skidPositions.set(verts,(this.skidCursor%1500)*18);this.skidCursor++;
          this.skidGeometry.setDrawRange(0,Math.min(this.skidCursor,1500)*6);this.skidGeometry.attributes.position.needsUpdate=true;
        }
        this.previous[side]=p;
        if(car.slipIntensity>0.23) this.emit(p.x,0.4,p.z,false,car.slipIntensity);
      }else this.previous[side]=null;
    }
    if(impact>1.5)for(let i=0;i<8;i++)this.emit(car.x+c*1.7,0.45,car.z+s*1.7,true,1);
    for(const p of this.particles)if(p.life>0){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.spark)p.vy-=8*dt;else {p.size+=dt*1.4;p.vx*=0.985;p.vz*=0.985;}}
  }
  private emit(x:number,y:number,z:number,spark:boolean,intensity:number){
    const p=this.particles[this.cursor++%this.capacity];
    Object.assign(p,{x,y,z,vx:(Math.random()-0.5)*(spark?8:1.3),vy:spark?2+Math.random()*3:0.7,vz:(Math.random()-0.5)*(spark?8:1.3),life:spark?0.4:0.75+intensity*0.6,max:spark?0.4:0.75+intensity*0.6,size:spark?0.17:0.6,spark});
  }
  render(pixelScale:number) {
    this.material.uniforms.pixelScale.value=pixelScale;
    this.particles.forEach((p,i)=>{this.positions.set([p.x,p.y,p.z],i*3);this.colors.set(p.spark?[1,0.63,0.18]:[0.84,0.85,0.81],i*3);this.sizes[i]=p.size;this.alphas[i]=Math.max(0,p.life/p.max)*(p.spark?1:0.3);});
    for(const key of ['position','color','aSize','aAlpha'])this.geometry.attributes[key].needsUpdate=true;
  }
  dispose(){this.geometry.dispose();this.material.dispose();this.skidGeometry.dispose();(this.skidMesh.material as T.Material).dispose();}
}
