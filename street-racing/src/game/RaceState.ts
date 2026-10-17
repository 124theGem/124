export class RaceState {
  lap=1; elapsed=0; best:number|null=null; score=0; chain=0; drifting=false;
  private previous=0; private gate=1; private chainGrace=0;
  reset(progress=0){this.elapsed=0;this.gate=1;this.previous=progress;this.chain=0;this.chainGrace=0;this.drifting=false;}
  update(dt:number,progress:number,speed:number,slip:number,onRoad:boolean) {
    this.elapsed+=dt;
    if(this.gate<=3 && progress>=this.gate/4 && progress<this.gate/4+0.08 && progress>=this.previous)this.gate++;
    if(this.previous>0.94&&progress<0.06&&this.gate===4){this.best=this.best===null?this.elapsed:Math.min(this.best,this.elapsed);this.lap++;this.elapsed=0;this.gate=1;}
    this.previous=progress;
    const angle=Math.abs(slip)*180/Math.PI;
    this.drifting=speed>5&&angle>10&&angle<80&&onRoad;
    if(this.drifting){this.chainGrace=0.9;const points=dt*speed*angle*0.16;this.chain+=points;this.score+=points;}
    else {this.chainGrace-=dt;if(this.chainGrace<=0)this.chain=0;}
  }
}
