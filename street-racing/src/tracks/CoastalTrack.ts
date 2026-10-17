import * as T from 'three';

export interface RoadPoint { x: number; z: number; tx: number; tz: number; nx: number; nz: number; index: number; distance: number; offset: number }
export class CoastalTrack {
  readonly halfWidth = 7;
  readonly barrierOffset = 10.7;
  readonly samples: T.Vector3[];
  readonly tangents: T.Vector3[];
  readonly curve: T.CatmullRomCurve3;
  readonly length: number;
  readonly group = new T.Group();
  readonly count = 480;
  constructor() {
    this.curve = new T.CatmullRomCurve3([
      [0, 0], [60, 0], [101, -28], [99, -68], [65, -97], [32, -82],
      [17, -124], [-32, -153], [-86, -129], [-105, -78], [-69, -35], [-80, 12], [-39, 38],
    ].map(([x,z]) => new T.Vector3(x, 0, z)), true, 'centripetal');
    this.length = this.curve.getLength();
    this.samples = Array.from({length: this.count}, (_,i) => this.curve.getPointAt(i / this.count));
    this.tangents = Array.from({length: this.count}, (_,i) => this.curve.getTangentAt(i / this.count));
    this.build();
  }
  point(index: number) {
    const i = ((index % this.count) + this.count) % this.count;
    const p = this.samples[i], t = this.tangents[i];
    return { x: p.x, z: p.z, tx: t.x, tz: t.z, nx: -t.z, nz: t.x, index: i };
  }
  nearest(x: number, z: number): RoadPoint {
    let best = Infinity, result!: RoadPoint;
    for (let i = 0; i < this.count; i++) {
      const a = this.samples[i], b = this.samples[(i + 1) % this.count];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = T.MathUtils.clamp(((x-a.x)*dx + (z-a.z)*dz) / (dx*dx+dz*dz), 0, 1);
      const px = a.x+dx*t, pz = a.z+dz*t, d = (x-px)**2+(z-pz)**2;
      if (d < best) {
        best = d; const len = Math.hypot(dx,dz), tx = dx/len, tz = dz/len;
        result = {x:px,z:pz,tx,tz,nx:-tz,nz:tx,index:i,distance:Math.sqrt(d),offset:(x-px)*-tz+(z-pz)*tx};
      }
    }
    return result;
  }
  private ribbon(inner: number, outer: number, color: number, height: number, roughness = 0.9) {
    const positions: number[] = [], indices: number[] = [];
    for (let i=0; i<=this.count; i++) {
      const p = this.point(i);
      for (const w of [inner, outer]) positions.push(p.x+p.nx*w,height,p.z+p.nz*w);
      if (i<this.count) { const k=i*2; indices.push(k,k+2,k+1,k+1,k+2,k+3); }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness,side:T.DoubleSide}));
    mesh.receiveShadow = true; this.group.add(mesh); return mesh;
  }
  private build() {
    this.ribbon(-10.7,10.7,0xc6bb9e,0.07);
    this.ribbon(-7.35,7.35,0xeae5d5,0.10);
    const road = this.ribbon(-7,7,0x434b50,0.115);
    const canvas = document.createElement('canvas'); canvas.width=128; canvas.height=128;
    const ctx=canvas.getContext('2d')!; ctx.fillStyle='#7c8284'; ctx.fillRect(0,0,128,128);
    let seed=19; for(let i=0;i<6000;i++) { seed=(seed*16807)%2147483647; const x=seed%128; seed=(seed*16807)%2147483647; ctx.fillStyle=i%2?'#969b9c':'#61676a'; ctx.fillRect(x,seed%128,1,1); }
    const texture = new T.CanvasTexture(canvas); texture.wrapS=texture.wrapT=T.RepeatWrapping; texture.repeat.set(1,1);
    const uv: number[]=[]; for(let i=0;i<=this.count;i++) uv.push(0,i/2,3.5,i/2);
    road.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); (road.material as T.MeshStandardMaterial).map=texture;
    this.ribbon(-6.66,-6.52,0xf2efe0,0.13); this.ribbon(6.52,6.66,0xf2efe0,0.13);
    const matrix = new T.Matrix4(), q=new T.Quaternion(), scale=new T.Vector3();
    const dash=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0xf5ce68}),Math.floor(this.count/5));
    for(let k=0;k<dash.count;k++) { const p=this.point(k*5); q.setFromAxisAngle(new T.Vector3(0,1,0),-Math.atan2(p.tz,p.tx)); scale.set(2.2,0.02,0.16); matrix.compose(new T.Vector3(p.x,0.14,p.z),q,scale); dash.setMatrixAt(k,matrix); }
    this.group.add(dash);
    const barriers = new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0xe4dfce,roughness:0.85}),this.count*2);
    const curbs = new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({roughness:0.8}),this.count*2);
    for(let i=0;i<this.count;i++) {
      const p=this.point(i), next=this.samples[(i+1)%this.count], len=this.samples[i].distanceTo(next);
      q.setFromAxisAngle(new T.Vector3(0,1,0),-Math.atan2(p.tz,p.tx));
      for(let side=0;side<2;side++) {
        const sign=side?1:-1, n=i*2+side;
        scale.set(len+0.15,0.9,0.55); matrix.compose(new T.Vector3(p.x+p.tx*len/2+p.nx*10.98*sign,0.52,p.z+p.tz*len/2+p.nz*10.98*sign),q,scale); barriers.setMatrixAt(n,matrix);
        scale.set(len+0.1,0.08,0.48); matrix.compose(new T.Vector3(p.x+p.tx*len/2+p.nx*7.4*sign,0.14,p.z+p.tz*len/2+p.nz*7.4*sign),q,scale); curbs.setMatrixAt(n,matrix); curbs.setColorAt(n,new T.Color(Math.floor(i/3)%2?0xf5e9d7:0xd16651));
      }
    }
    barriers.castShadow=true; barriers.receiveShadow=true; this.group.add(barriers,curbs);
    const start=this.point(0);
    const stripe = new T.Group();
    for(let row=0;row<2;row++) for(let col=0;col<14;col++) {
      const square=new T.Mesh(new T.PlaneGeometry(0.7,1),new T.MeshStandardMaterial({color:(row+col)%2?0xf1ead9:0x182d35,side:T.DoubleSide}));
      square.rotation.x=-Math.PI/2; square.position.set(row*0.7-0.35,0.15,col-6.5); stripe.add(square);
    }
    stripe.rotation.y=-Math.atan2(start.tz,start.tx); stripe.position.set(start.x,0,start.z); this.group.add(stripe);
  }
}
