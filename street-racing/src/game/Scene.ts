import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CoastalTrack } from '../tracks/CoastalTrack';

export function createScene(renderer:T.WebGLRenderer,track:CoastalTrack) {
  const scene=new T.Scene();
  scene.background=new T.Color(0x080e20);
  scene.fog=new T.Fog(0x080e20,125,380);
  const environment=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
  const env=pmrem.fromScene(environment,0.05);
  scene.environment=env.texture;scene.environmentIntensity=0.45;
  environment.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0x829eee,0x17112c,1.4));
  const sun=new T.DirectionalLight(0x9dbbff,2.2);
  sun.position.set(-60,100,40);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60,far:220});
  sun.shadow.normalBias=0.06;sun.shadow.bias=-0.0003;sun.shadow.radius=3;
  scene.add(sun,sun.target);

  const ground=new T.Mesh(new T.PlaneGeometry(1800,1800),new T.MeshStandardMaterial({color:0x101c30,roughness:0.72,metalness:0.2}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-0.18;ground.receiveShadow=true;
  scene.add(ground,track.group);
  const matrix=new T.Matrix4(),rotation=new T.Quaternion(),scale=new T.Vector3();
  const yAxis=new T.Vector3(0,1,0);
  let seed=7321;
  const random=()=>{seed=seed*16807%2147483647;return (seed-1)/2147483646;};
  const blocks:{x:number;z:number;w:number;d:number;h:number;color:T.Color}[]=[];
  for(let x=-190;x<=190;x+=27)for(let z=-230;z<=115;z+=27){
    const bx=x+(random()-.5)*5,bz=z+(random()-.5)*5;
    const w=10+random()*7,d=10+random()*7;
    const distance=track.nearest(bx,bz).distance;
    if(distance<15+Math.hypot(w,d)/2)continue;
    // Buildings near the road are low enough to keep the chase view unobstructed.
    const h=Math.max(5,Math.min(9+random()*32,(distance-10)*0.8));
    blocks.push({x:bx,z:bz,w,d,h,color:new T.Color().setHSL(0.61+random()*.12,.25,.09+random()*.10)});
  }
  const buildings=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({roughness:.6,metalness:.3}),blocks.length);
  const strips:{matrix:T.Matrix4;color:T.Color}[]=[],windows:{matrix:T.Matrix4;color:T.Color}[]=[];
  const cyan=new T.Color(0x43e4ff),pink=new T.Color(0xff46bb),amber=new T.Color(0xffc46b);
  blocks.forEach((b,i)=>{
    matrix.compose(new T.Vector3(b.x,b.h/2,b.z),rotation.identity(),scale.set(b.w,b.h,b.d));buildings.setMatrixAt(i,matrix);buildings.setColorAt(i,b.color);
    const accent=i%3?cyan:pink;
    for(let side=0;side<4;side++){
      const alongX=side<2,sign=side%2?1:-1;
      const wx=alongX?b.x:b.x+sign*(b.w/2+.03),wz=alongX?b.z+sign*(b.d/2+.03):b.z;
      rotation.setFromAxisAngle(yAxis,alongX?0:Math.PI/2);
      matrix.compose(new T.Vector3(wx,b.h-.5,wz),rotation,scale.set((alongX?b.w:b.d)*.85,.09,1));strips.push({matrix:matrix.clone(),color:accent});
      const floors=Math.min(8,Math.floor(b.h/3));
      for(let floor=0;floor<floors;floor++)for(let col=0;col<4;col++){
        if(random()>.64)continue;
        const offset=(col-1.5)*(alongX?b.w:b.d)/5;
        matrix.compose(new T.Vector3(wx+(alongX?offset:0),1.6+floor*3,wz+(alongX?0:offset)),rotation,scale.set(1.05,1.15,1));
        windows.push({matrix:matrix.clone(),color:random()>.55?amber:accent});
      }
    }
  });
  buildings.castShadow=true;buildings.receiveShadow=true;scene.add(buildings);
  function emissiveInstances(entries:{matrix:T.Matrix4;color:T.Color}[]){
    const mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,toneMapped:false}),entries.length);
    entries.forEach((e,i)=>{mesh.setMatrixAt(i,e.matrix);mesh.setColorAt(i,e.color);});scene.add(mesh);
  }
  emissiveInstances(windows);emissiveInstances(strips);

  // Lamp geometry and projected light pools are instanced: no light per street lamp.
  const lampCount=Math.floor(track.count/13);
  const steel=new T.MeshStandardMaterial({color:0x26364d,metalness:.75,roughness:.4});
  const poles=new T.InstancedMesh(new T.CylinderGeometry(.09,.14,7.2,5),steel,lampCount);
  const arms=new T.InstancedMesh(new T.BoxGeometry(1,1,1),steel,lampCount);
  const lamps=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xd5efff,toneMapped:false}),lampCount);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,1,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,.65)');gradient.addColorStop(.45,'rgba(255,255,255,.22)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const glow=new T.CanvasTexture(canvas);
  const poolGeo=new T.PlaneGeometry(1,1);poolGeo.rotateX(-Math.PI/2);
  const pools=new T.InstancedMesh(poolGeo,new T.MeshBasicMaterial({map:glow,transparent:true,opacity:.68,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}),lampCount);
  const reflections=new T.InstancedMesh(poolGeo,new T.MeshBasicMaterial({map:glow,transparent:true,opacity:.3,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}),lampCount*3);
  for(let i=0;i<lampCount;i++){
    const p=track.point(i*13),side=i%2?1:-1,accent=i%3?cyan:pink;
    matrix.makeTranslation(p.x+p.nx*12.3*side,3.6,p.z+p.nz*12.3*side);poles.setMatrixAt(i,matrix);
    rotation.setFromAxisAngle(yAxis,-Math.atan2(p.tz,p.tx));
    matrix.compose(new T.Vector3(p.x+p.nx*10.8*side,7.1,p.z+p.nz*10.8*side),rotation,scale.set(.14,.14,3.2));arms.setMatrixAt(i,matrix);
    matrix.compose(new T.Vector3(p.x+p.nx*9.3*side,7,p.z+p.nz*9.3*side),rotation,scale.set(.65,.12,1.2));lamps.setMatrixAt(i,matrix);
    matrix.compose(new T.Vector3(p.x+p.nx*3.8*side,.15,p.z+p.nz*3.8*side),rotation,scale.set(16,1,13));pools.setMatrixAt(i,matrix);pools.setColorAt(i,accent);
    for(let k=0;k<3;k++){
      matrix.compose(new T.Vector3(p.x+p.nx*(k*2-2),.152,p.z+p.nz*(k*2-2)),rotation,scale.set(.3+random()*.4,1,3+random()*3));
      reflections.setMatrixAt(i*3+k,matrix);reflections.setColorAt(i*3+k,accent);
    }
  }
  scene.add(poles,arms,lamps,pools,reflections);

  // Small neon garages frame the start area, with all footprints outside the barriers.
  for(const [i,title,color] of [[12,'NIGHT RUN',0x52eaff],[107,'AFTER HOURS',0xff48bc],[310,'GARAGE 01',0x52eaff]] as const){
    const p=track.point(i),x=p.x+p.nx*20,z=p.z+p.nz*20;
    const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;
    const sc=signCanvas.getContext('2d')!;sc.fillStyle='#0b1021';sc.fillRect(0,0,512,128);sc.strokeStyle=`#${color.toString(16)}`;sc.lineWidth=4;sc.strokeRect(6,6,500,116);sc.fillStyle=`#${color.toString(16)}`;sc.font='bold 48px Arial';sc.textAlign='center';sc.fillText(title,256,82);
    const facade=new T.Mesh(new T.BoxGeometry(12,4.5,8),new T.MeshStandardMaterial({color:0x1e2840,metalness:.3,roughness:.55}));facade.position.set(x,2.1,z);facade.castShadow=true;scene.add(facade);
    const sign=new T.Mesh(new T.PlaneGeometry(10,2.5),new T.MeshBasicMaterial({map:new T.CanvasTexture(signCanvas),side:T.DoubleSide,toneMapped:false}));sign.position.set(x,4.6,z+4.06);scene.add(sign);
  }
  return {scene,sun,dispose:()=>env.dispose()};
}
