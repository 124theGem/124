import { RAID_SKINS,RAID_DURATION,RAID_EXIT_AT,raidBagValue,type RaidSnapshot,type RaidRun,type RaidPawn,type RaidSkin } from "../../shared/raid";
const round=(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number)=>{c.beginPath();c.roundRect(x,y,w,h,r);};
export class RaidView {
  readonly canvas=document.createElement("canvas");
  private ctx=this.canvas.getContext("2d",{alpha:false})!;
  private map=document.createElement("canvas");
  private mapType="";
  private runId="";
  private camera={x:0,z:23};
  private scale=28;
  private sprites=new Map<string,HTMLCanvasElement>();
  private lastPositions=new Map<string,{x:number;z:number}>();
  private seen=new Set<number>();
  private particles:{x:number;z:number;vx:number;vz:number;life:number;color:string}[]=[];
  private worldUnit=28;
  constructor(){this.canvas.className="rr-canvas";this.canvas.setAttribute("aria-label","Поле рейда RIFT RAID");this.resize();}
  resize(){const ratio=Math.min(devicePixelRatio,1.5);this.canvas.width=Math.round(innerWidth*ratio);this.canvas.height=Math.round(innerHeight*ratio);this.canvas.style.width=innerWidth+"px";this.canvas.style.height=innerHeight+"px";this.ctx.setTransform(ratio,0,0,ratio,0,0);this.scale=Math.min(31,Math.max(26,innerWidth/19));}
  private backdrop(time:number){
    const c=this.ctx,g=c.createLinearGradient(0,0,innerWidth,innerHeight);g.addColorStop(0,"#101d2b");g.addColorStop(0.55,"#12272e");g.addColorStop(1,"#0b131c");c.fillStyle=g;c.fillRect(0,0,innerWidth,innerHeight);
    c.save();c.globalAlpha=.25;
    for(let i=0;i<40;i++){const x=((i*197+time*2*(i%3+1))%(innerWidth+60))-30,y=(i*103)%innerHeight;c.fillStyle=i%3?"#65adbb":"#ffbd72";c.fillRect(x,y,1,1);}
    c.restore();
  }
  draw(snapshot:RaidSnapshot|undefined,dt:number,time:number,preview?:RaidSkin){
    this.backdrop(time);if(!snapshot)return;
    const run=snapshot.room.run,pawn=run?.pawns.find(p=>p.id===snapshot.me);
    if(!run||!pawn){
      const c=this.ctx;
      c.save();c.strokeStyle="#72c5b615";c.lineWidth=1;
      const ox=innerWidth*.72,oy=innerHeight*.39;
      for(let i=0;i<5;i++){c.beginPath();c.ellipse(ox,oy+120,120+i*35,36+i*13,0,0,Math.PI*2);c.stroke();}
      for(let i=0;i<12;i++){const x=(i*147)%innerWidth,h=80+(i*53)%150;c.fillStyle=i%2?"#1e343c":"#162932";c.fillRect(x,innerHeight*.64-h,55+i%3*15,h);c.fillStyle="#8bdac63a";for(let j=0;j<h;j+=19)c.fillRect(x+9,innerHeight*.64-j-12,19,2);}
      this.hero(c,ox,oy,Math.min(innerWidth/640,innerHeight/820)*1.05,preview??snapshot.profile.skin);
      c.restore();return;
    }
    if(this.mapType!==run.map){this.mapType=run.map;this.makeMap(run);}
    if(this.runId!==run.id){this.runId=run.id;this.camera={x:pawn.x,z:pawn.z};this.lastPositions.clear();this.seen.clear();this.particles=[];}
    const c=this.ctx,blend=1-Math.exp(-10*dt),at=this.lastPositions.get(pawn.id)??{x:pawn.x,z:pawn.z};
    at.x+=(pawn.x-at.x)*blend;at.z+=(pawn.z-at.z)*blend;this.lastPositions.set(pawn.id,at);
    this.camera.x+=(at.x-this.camera.x)*(1-Math.exp(-8*dt));this.camera.z+=(at.z-this.camera.z)*(1-Math.exp(-8*dt));
    c.save();c.translate(innerWidth/2,innerHeight*(innerHeight<500?.5:.53));c.scale(this.scale,this.scale);c.translate(-this.camera.x,-this.camera.z);
    c.drawImage(this.map,-this.map.width/this.worldUnit/2,-this.map.height/this.worldUnit/2,this.map.width/this.worldUnit,this.map.height/this.worldUnit);
    this.exit(c,run,time);
    for(const chest of run.chests){
      c.save();c.translate(chest.x,chest.z);c.shadowColor=chest.rare?"#d9a0ff":"#ffc379";c.shadowBlur=chest.opened?0:9;
      c.fillStyle=chest.opened?"#304049":chest.rare?"#9e78c1":"#c39962";round(c,-.55,-.42,1.1,.84,.1);c.fill();c.strokeStyle=chest.opened?"#536971":"#ffe4ae";c.lineWidth=.055;c.stroke();c.shadowBlur=0;
      c.strokeStyle="#263741";c.lineWidth=.1;c.beginPath();c.moveTo(-.5,0);c.lineTo(.5,0);c.stroke();
      if(!chest.opened){c.fillStyle=chest.rare?"#ecc7ff":"#ffe0a0";c.fillRect(-.08,-.1,.16,.2);c.globalAlpha=.3+.15*Math.sin(time*3);c.strokeStyle=c.fillStyle;c.lineWidth=.035;c.beginPath();c.arc(0,0,.95,0,Math.PI*2);c.stroke();}c.restore();
    }
    for(const drop of run.drops){
      c.save();c.translate(drop.x,drop.z);c.rotate(time*.7+drop.id);c.fillStyle=drop.kind==="core"?"#e7b4ff":drop.kind==="data"?"#97eeec":drop.kind==="med"?"#9af2bd":"#f3cd86";c.shadowColor=c.fillStyle;c.shadowBlur=10;
      if(drop.kind==="core"){c.beginPath();c.moveTo(0,-.3);c.lineTo(.23,0);c.lineTo(0,.3);c.lineTo(-.23,0);c.closePath();c.fill();}else c.fillRect(-.12,-.12,.24,.24);c.restore();
    }
    for(const enemy of run.enemies){
      c.save();c.translate(enemy.x,enemy.z);const big=enemy.kind==="brute",r=big?.85:enemy.kind==="drone"?.55:.4;
      c.fillStyle="#06101899";c.beginPath();c.ellipse(.1,.2,r*1.3,r*.75,0,0,Math.PI*2);c.fill();c.rotate(enemy.angle);
      if(enemy.kind==="drone"){c.strokeStyle="#76859d";c.lineWidth=.09;for(const side of[-1,1]){c.beginPath();c.moveTo(-.3,side*.2);c.lineTo(-.65,side*.55);c.lineTo(.25,side*.6);c.stroke();}}
      c.fillStyle=run.elapsed-enemy.hitAt<.1?"#f8ebe3":big?"#8f5d68":"#bf7182";round(c,-r,-r*.8,r*2,r*1.6,.13);c.fill();c.strokeStyle="#f0a6a8";c.lineWidth=.035;c.stroke();c.fillStyle="#1d2939";c.fillRect(-r*.1,-r*.55,r*.8,r*1.1);c.fillStyle=big?"#ffa663":"#ffb2b2";c.shadowColor=c.fillStyle;c.shadowBlur=8;c.fillRect(r*.4,-.1,r*.4,.2);c.restore();
      if(big||enemy.hp<enemy.maxHp){c.fillStyle="#08141c";c.fillRect(enemy.x-r,enemy.z-r-.28,r*2,.09);c.fillStyle="#ed8fa4";c.fillRect(enemy.x-r,enemy.z-r-.28,r*2*enemy.hp/enemy.maxHp,.09);}
    }
    for(const b of run.bullets){c.strokeStyle=b.enemy?"#ff829e":"#ffe4a5";c.lineWidth=b.enemy?.09:.065;c.beginPath();c.moveTo(b.x,b.z);const speed=Math.hypot(b.vx,b.vz);c.lineTo(b.x-b.vx/speed*.6,b.z-b.vz/speed*.6);c.stroke();}
    for(const p of run.pawns){
      if(p.state==="extracted"||p.state==="dead")continue;
      const pos=p.id===pawn.id?at:this.lastPositions.get(p.id)??{x:p.x,z:p.z};if(p.id!==pawn.id){pos.x+=(p.x-pos.x)*blend;pos.z+=(p.z-pos.z)*blend;this.lastPositions.set(p.id,pos);}
      c.save();c.translate(pos.x,pos.z);c.fillStyle="#06101880";c.beginPath();c.ellipse(.1,.25,.52,.3,0,0,Math.PI*2);c.fill();
      if(p.invulnerable>0){c.strokeStyle=p.dashLeft>0?"#fff3b5":"#a6f4e0";c.globalAlpha=.65;c.lineWidth=.045;c.beginPath();c.arc(0,0,.72,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
      c.rotate(p.angle+Math.PI/2);const sprite=this.sprite(p.skin);c.globalAlpha=p.state==="down"?.5:1;c.drawImage(sprite,-.7,-.75,1.4,1.5);c.restore();
      if(p.id!==pawn.id){c.fillStyle="#d0efe9";c.font=".32px sans-serif";c.textAlign="center";c.fillText(p.name,pos.x,pos.z-1);}
    }
    for(const e of run.events){if(this.seen.has(e.id)||run.elapsed-e.at>1)continue;this.seen.add(e.id);if(e.kind==="kill"||e.kind==="chest"||e.kind==="dash")for(let i=0;i<8;i++)this.particles.push({x:e.x,z:e.z,vx:Math.cos(i*.8)*2,vz:Math.sin(i*.8)*2,life:.5,color:e.kind==="kill"?"#efa8aa":"#ffe2a2"});}
    this.particles=this.particles.filter(p=>p.life>0).slice(-90);for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;c.globalAlpha=Math.max(0,p.life*1.5);c.fillStyle=p.color;c.fillRect(p.x,p.z,.055,.055);}c.globalAlpha=1;
    c.restore();
    const edge=c.createRadialGradient(innerWidth/2,innerHeight/2,innerWidth*.15,innerWidth/2,innerHeight/2,Math.max(innerHeight,innerWidth)*.65);edge.addColorStop(0,"#06101800");edge.addColorStop(1,"#061018bb");c.fillStyle=edge;c.fillRect(0,0,innerWidth,innerHeight);
    if(pawn.hp/pawn.maxHp<.25&&pawn.state==="alive"){c.fillStyle=`rgba(170,35,65,${.04+Math.sin(time*4)*.02})`;c.fillRect(0,0,innerWidth,innerHeight);}
  }
  private makeMap(run:RaidRun){
    this.map.width=1536;this.map.height=2048;const c=this.map.getContext("2d")!,u=this.worldUnit;c.translate(768,1024);c.scale(u,u);
    c.fillStyle=run.map==="lab"?"#182334":"#1d3035";c.fillRect(-23,-29,46,58);
    for(let x=-22;x<22;x+=2)for(let z=-28;z<28;z+=2){const n=((x*13+z*7+137)%7+7)%7;c.fillStyle=run.map==="lab"?`rgb(${25+n},${35+n},${48+n})`:`rgb(${28+n},${44+n},${48+n})`;c.fillRect(x+.02,z+.02,1.96,1.96);}
    c.strokeStyle="#82979c15";c.lineWidth=.025;for(let x=-22;x<=22;x+=2){c.beginPath();c.moveTo(x,-28);c.lineTo(x,28);c.stroke();}for(let z=-28;z<=28;z+=2){c.beginPath();c.moveTo(-22,z);c.lineTo(22,z);c.stroke();}
    c.strokeStyle="#e5c08533";c.lineWidth=.05;c.setLineDash([.4,.3]);c.strokeRect(-21,-27,42,54);c.setLineDash([]);
    for(let i=0;i<120;i++){const x=Math.sin(i*45.3)*21,z=Math.cos(i*19.1)*27;c.fillStyle=i%3?"#0c1a202f":"#91afac12";c.fillRect(x,z,.08+(i%4)*.1,.02);}
    c.font=".36px monospace";c.textAlign="center";for(let i=-20;i<20;i+=8){c.fillStyle="#afc7bf28";c.fillText(run.map==="dock"?"LOADING ZONE / 07":"RESEARCH / 99",0,i);}
    for(const w of run.walls){
      const x=w.x-w.w/2,z=w.z-w.d/2;
      c.fillStyle="#06101966";round(c,x+.35,z+.65,w.w+.15,w.d+.2,.15);c.fill();
      c.fillStyle=w.kind==="building"?"#17242e":"#293d44";round(c,x,z,w.w,w.d,.1);c.fill();
      const g=c.createLinearGradient(x,z,x+w.w,z+w.d);g.addColorStop(0,w.kind==="building"?"#435662":"#65716c");g.addColorStop(1,"#263b45");c.fillStyle=g;round(c,x+.05,z+.05,w.w-.1,w.d-.3,.12);c.fill();
      c.strokeStyle="#acbaba66";c.lineWidth=.035;c.stroke();
      c.strokeStyle="#111e2f88";c.lineWidth=.08;for(let t=.5;t<w.w;t+=.8){c.beginPath();c.moveTo(x+t,z+.15);c.lineTo(x+t,z+w.d-.4);c.stroke();}
      c.fillStyle=run.map==="lab"?"#a8a4e9":"#93dbcc";c.shadowColor=c.fillStyle;c.shadowBlur=9;c.fillRect(x+.22,z+w.d-.23,w.w-.44,.055);c.shadowBlur=0;
      if(w.kind==="building"){
        const r=Math.min(w.w,w.d)*.2;c.fillStyle="#1c303d";c.beginPath();c.arc(w.x,w.z,r,0,Math.PI*2);c.fill();c.strokeStyle="#70878c";c.lineWidth=.035;for(let j=0;j<8;j++){const a=j/8*Math.PI*2;c.beginPath();c.moveTo(w.x,w.z);c.lineTo(w.x+Math.cos(a)*r,w.z+Math.sin(a)*r);c.stroke();}
        c.fillStyle="#d7e3dc66";c.font=".4px monospace";c.fillText(w.w>5?"RR / 028":"C / 04",w.x,z+.7);
      }else{c.fillStyle="#e7bf74";c.fillRect(x+.17,z+.15,.12,.3);c.fillRect(x+w.w-.3,z+.15,.12,.3);}
    }
    c.strokeStyle="#8dd5cb33";c.lineWidth=.12;c.strokeRect(-22,-28,44,56);
  }
  private exit(c:CanvasRenderingContext2D,run:RaidRun,time:number){
    const enabled=run.elapsed>=RAID_EXIT_AT;c.save();c.translate(0,24);c.fillStyle=enabled?"#70edb712":"#7da8b808";c.beginPath();c.arc(0,0,3,0,Math.PI*2);c.fill();c.strokeStyle=enabled?"#89e3b2":"#63848f";c.lineWidth=.055;c.setLineDash([.35,.18]);c.beginPath();c.arc(0,0,3,0,Math.PI*2);c.stroke();c.setLineDash([]);c.font=".32px monospace";c.textAlign="center";c.fillStyle=enabled?"#adf0c9":"#8ca8b0";c.fillText(enabled?"ЭВАКУАЦИЯ / УДЕРЖИВАЙ E":`ШЛЮЗ ЧЕРЕЗ ${Math.ceil(RAID_EXIT_AT-run.elapsed)} С`,0,0);c.restore();
  }
  private sprite(skin:RaidSkin){
    if(this.sprites.has(skin))return this.sprites.get(skin)!;
    const canvas=document.createElement("canvas");canvas.width=96;canvas.height=104;const c=canvas.getContext("2d")!,color=RAID_SKINS[skin];
    c.fillStyle="#142b35";round(c,18,38,60,48,12);c.fill();c.fillStyle=color.color;round(c,23,28,50,54,13);c.fill();
    c.fillStyle="#1a3040";round(c,30,36,36,25,8);c.fill();c.strokeStyle=color.glow;c.lineWidth=3;c.beginPath();c.moveTo(32,48);c.lineTo(64,48);c.stroke();
    c.fillStyle="#203746";round(c,14,45,13,37,5);c.fill();round(c,69,45,13,37,5);c.fill();
    c.fillStyle=color.color;round(c,12,33,18,20,5);c.fill();round(c,66,33,18,20,5);c.fill();
    c.fillStyle="#122532";round(c,35,3,26,38,6);c.fill();c.fillStyle=color.glow;c.fillRect(40,4,16,4);
    c.fillStyle="#1c303c";c.beginPath();c.ellipse(48,28,23,20,0,0,Math.PI*2);c.fill();c.strokeStyle=color.color;c.lineWidth=4;c.stroke();c.fillStyle=color.glow;c.fillRect(32,16,32,4);
    this.sprites.set(skin,canvas);return canvas;
  }
  private hero(c:CanvasRenderingContext2D,x:number,y:number,scale:number,skin:RaidSkin){
    const p=RAID_SKINS[skin];c.save();c.translate(x,y);c.scale(scale,scale);
    c.fillStyle="#030b1480";c.beginPath();c.ellipse(0,190,100,18,0,0,Math.PI*2);c.fill();
    c.strokeStyle="#b5d9cc66";c.lineWidth=1;c.setLineDash([3,6]);c.beginPath();c.arc(0,0,170,0,Math.PI*2);c.stroke();c.setLineDash([]);
    const suit=c.createLinearGradient(-90,-100,90,180);suit.addColorStop(0,p.color);suit.addColorStop(.5,"#6d8588");suit.addColorStop(1,"#223b4c");
    for(const side of[-1,1]){
      c.fillStyle="#1a2c3c";round(c,side<0?-43:8,83,35,104,8);c.fill();c.fillStyle="#344e59";round(c,side<0?-49:5,170,47,25,5);c.fill();c.fillStyle=suit;round(c,side<0?-44:9,72,35,70,8);c.fill();
      c.fillStyle="#142b3a";round(c,side<0?-90:55,-29,34,116,9);c.fill();c.fillStyle=suit;round(c,side<0?-94:57,-40,40,57,9);c.fill();c.strokeStyle=p.glow;c.lineWidth=3;c.beginPath();c.moveTo(side*70,-27);c.lineTo(side*70,-9);c.stroke();
    }
    c.fillStyle=suit;round(c,-56,-55,112,143,18);c.fill();c.fillStyle="#213947";round(c,-36,-15,72,61,9);c.fill();c.strokeStyle="#8ba8a0";c.lineWidth=2;c.stroke();
    c.fillStyle=p.glow;c.shadowColor=p.glow;c.shadowBlur=15;c.fillRect(-22,3,44,4);c.fillRect(-22,15,15,3);c.shadowBlur=0;
    c.fillStyle="#152a38";round(c,-55,63,110,19,5);c.fill();c.fillStyle="#b9b59d";c.fillRect(-11,66,22,13);
    for(let i=0;i<4;i++){c.fillStyle="#294351";round(c,-47+i*25,49,19,24,3);c.fill();c.fillStyle="#d1c59a";c.fillRect(-43+i*25,53,11,2);}
    const helmet=c.createRadialGradient(-15,-116,4,0,-104,53);helmet.addColorStop(0,"#416c80");helmet.addColorStop(.5,"#122a3a");helmet.addColorStop(1,"#071421");
    c.fillStyle=p.color;c.beginPath();c.ellipse(0,-99,48,47,0,0,Math.PI*2);c.fill();c.fillStyle=helmet;c.beginPath();c.ellipse(0,-106,43,36,0,0,Math.PI*2);c.fill();c.strokeStyle=p.glow;c.lineWidth=3;c.beginPath();c.moveTo(-33,-87);c.lineTo(29,-87);c.stroke();
    c.save();c.translate(18,25);c.rotate(-.4);c.fillStyle="#0b1e2c";round(c,-57,-8,150,23,5);c.fill();c.fillStyle="#718888";round(c,-21,-13,75,19,4);c.fill();c.fillStyle=p.glow;c.fillRect(68,-3,25,5);c.fillStyle="#d4b87e";c.fillRect(11,-10,19,5);c.restore();
    c.strokeStyle="#adc5b35a";c.lineWidth=1;c.beginPath();c.moveTo(90,-70);c.lineTo(142,-95);c.lineTo(184,-95);c.stroke();c.fillStyle="#b0c9c1";c.font="9px monospace";c.fillText("R / 01",146,-103);c.restore();
  }
  dispose(){this.sprites.clear();this.canvas.remove();this.map.width=this.map.height=1;}
}
