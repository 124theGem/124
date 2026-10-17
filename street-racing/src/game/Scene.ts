import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CoastalTrack } from '../tracks/CoastalTrack';

export function createScene(renderer:T.WebGLRenderer,track:CoastalTrack) {
  const scene=new T.Scene();scene.background=new T.Color(0xb2d8db);scene.fog=new T.Fog(0xb2d8db,180,550);
  const environment=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
  const env=pmrem.fromScene(environment,0.04);scene.environment=env.texture;scene.environmentIntensity=0.55;
  environment.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xd8f1ff,0x817d51,2.3));
  const sun=new T.DirectionalLight(0xffedcb,3.4);sun.position.set(-60,100,40);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;sun.shadow.camera.far=220;sun.shadow.normalBias=0.06;
  sun.shadow.bias=-0.0003;sun.shadow.radius=3;scene.add(sun,sun.target);
  const ocean=new T.Mesh(new T.PlaneGeometry(2000,2000),new T.MeshStandardMaterial({color:0x338d9e,metalness:0.25,roughness:0.28}));
  ocean.rotation.x=-Math.PI/2;ocean.position.y=-1.2;scene.add(ocean);
  const contour:T.Vector2[]=[];
  for(let i=0;i<track.count;i+=3) { const p=track.point(i),w=24+4*Math.sin(i*0.13)+3*Math.sin(i*0.047);contour.push(new T.Vector2(p.x+p.nx*w,-p.z-p.nz*w)); }
  const landGeo=new T.ShapeGeometry(new T.Shape(contour));landGeo.rotateX(-Math.PI/2);
  const sand=new T.Mesh(landGeo,new T.MeshStandardMaterial({color:0xdbcba3,roughness:1}));sand.position.y=-0.22;sand.receiveShadow=true;scene.add(sand);
  const greenContour:T.Vector2[]=[];
  for(let i=0;i<track.count;i+=3) { const p=track.point(i),w=19+3*Math.sin(i*0.13);greenContour.push(new T.Vector2(p.x+p.nx*w,-p.z-p.nz*w)); }
  const greenGeo=new T.ShapeGeometry(new T.Shape(greenContour));greenGeo.rotateX(-Math.PI/2);
  const grass=new T.Mesh(greenGeo,new T.MeshStandardMaterial({color:0x80966b,roughness:1}));grass.position.y=-0.12;grass.receiveShadow=true;scene.add(grass,track.group);
  const matrix=new T.Matrix4(),q=new T.Quaternion(),sc=new T.Vector3();
  const palmLocations:T.Vector3[]=[];
  for(let i=0;i<track.count;i+=11) { const p=track.point(i),side=i%22?1:-1; palmLocations.push(new T.Vector3(p.x+p.nx*side*(15+(i%7)),0,p.z+p.nz*side*(15+(i%7)))); }
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(0.19,0.33,5.3,6),new T.MeshStandardMaterial({color:0x947257}),palmLocations.length);
  const leaves=new T.InstancedMesh(new T.ConeGeometry(1,1,4),new T.MeshStandardMaterial({color:0x355f49,side:T.DoubleSide}),palmLocations.length*7);
  palmLocations.forEach((p,i)=>{
    matrix.makeTranslation(p.x,2.6,p.z);trunks.setMatrixAt(i,matrix);
    for(let j=0;j<7;j++) {
      const a=j*Math.PI*2/7+i;
      q.setFromEuler(new T.Euler(Math.sin(a)*1.3,a,Math.cos(a)*1.3));sc.set(0.65,3.5,0.24);
      matrix.compose(new T.Vector3(p.x+Math.cos(a)*1.1,5.05,p.z+Math.sin(a)*1.1),q,sc);leaves.setMatrixAt(i*7+j,matrix);
    }
  });trunks.castShadow=true;leaves.castShadow=true;scene.add(trunks,leaves);
  const rocks=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),new T.MeshStandardMaterial({color:0x8d9488,roughness:1}),85);
  for(let i=0;i<85;i++){const p=track.point(i*17),side=i%3?1:-1,w=15+i%8; q.setFromEuler(new T.Euler(i,i*0.7,i*0.3));sc.set(1+i%3,1.2+i%4*0.5,1+i%2);matrix.compose(new T.Vector3(p.x+p.nx*side*w,0.1,p.z+p.nz*side*w),q,sc);rocks.setMatrixAt(i,matrix);}rocks.castShadow=true;rocks.receiveShadow=true;scene.add(rocks);
  // Low white coastal houses in the infield, kept clear of the driving corridor.
  const plaster=new T.MeshStandardMaterial({color:0xf1e7cd,roughness:0.9}),roofMat=new T.MeshStandardMaterial({color:0xc37a60});
  for(const [x,z,w,d] of [[-15,-55,10,8],[-32,-67,8,11],[-9,-73,9,7],[-45,-85,12,8],[13,-42,7,9]]) {
    const body=new T.Mesh(new T.BoxGeometry(w,4,d),plaster);body.position.set(x,2,z);body.castShadow=true;body.receiveShadow=true;
    const roof=new T.Mesh(new T.BoxGeometry(w+0.7,0.45,d+0.7),roofMat);roof.position.set(x,4.2,z);roof.castShadow=true;
    scene.add(body,roof);
    for(let k=0;k<3;k++){const window=new T.Mesh(new T.BoxGeometry(1.2,1.6,0.1),new T.MeshStandardMaterial({color:0x3d7681}));window.position.set(x-w/2+2+k*2.5,2,z+d/2+0.06);scene.add(window);}
  }
  // Ocean glints are pooled instances rather than animated transparent planes.
  const glints=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:0x94d1cd,transparent:true,opacity:0.32,depthWrite:false}),180);
  for(let i=0;i<180;i++) { q.setFromEuler(new T.Euler(-Math.PI/2,0,0));sc.set(2+i%4,0.12,1);matrix.compose(new T.Vector3((i*43%600)-300,-1.15,(i*79%600)-300),q,sc);glints.setMatrixAt(i,matrix); }scene.add(glints);
  return {scene,sun,dispose:()=>env.dispose()};
}
