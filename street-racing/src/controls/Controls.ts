import type { Input } from '../physics/CarPhysics';
export class Controls {
  private keys=new Set<string>();
  private pointers=new Map<number,string>();
  private abort=new AbortController();
  onReset=()=>{};onCamera=()=>{};onPause=()=>{};
  constructor() {
    const signal=this.abort.signal;
    window.addEventListener('keydown',e=>{
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);if(e.repeat)return;
      if(e.code==='KeyR')this.onReset();if(e.code==='KeyC')this.onCamera();if(e.code==='Escape'||e.code==='KeyP')this.onPause();
    },{signal});
    window.addEventListener('keyup',e=>this.keys.delete(e.code),{signal});
    window.addEventListener('blur',()=>this.clear(),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();},{signal});
    for(const button of document.querySelectorAll<HTMLElement>('[data-control]')) {
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,button.dataset.control!);this.refresh();},{signal});
      const release=(e:PointerEvent)=>{this.pointers.delete(e.pointerId);this.refresh();};
      button.addEventListener('pointerup',release,{signal});button.addEventListener('pointercancel',release,{signal});button.addEventListener('lostpointercapture',release,{signal});
      button.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
    }
  }
  private active(action:string,...codes:string[]) {return [...this.pointers.values()].includes(action)||codes.some(c=>this.keys.has(c));}
  read():Input {
    return {throttle:+this.active('gas','KeyW','ArrowUp'),brake:+this.active('brake','KeyS','ArrowDown'),
      steer:+this.active('right','KeyD','ArrowRight')-+this.active('left','KeyA','ArrowLeft'),handbrake:this.active('drift','Space')};
  }
  private refresh(){for(const button of document.querySelectorAll<HTMLElement>('[data-control]'))button.classList.toggle('pressed',[...this.pointers.values()].includes(button.dataset.control!));}
  clear(){this.keys.clear();this.pointers.clear();this.refresh();}
  dispose(){this.abort.abort();this.clear();}
}
