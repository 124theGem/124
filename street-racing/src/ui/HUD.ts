import type { CarPhysics } from '../physics/CarPhysics';
import type { RaceState } from '../game/RaceState';
import type { CoastalTrack } from '../tracks/CoastalTrack';
import { CAR } from '../vehicles/CarConfig';

export function timeLabel(seconds:number|null){if(seconds===null)return '—:——.——';const min=Math.floor(seconds/60),sec=(seconds%60).toFixed(2).padStart(5,'0');return `${min}:${sec}`;}
export class HUD {
  readonly root:HTMLElement;
  private elements:Record<string,HTMLElement>={};
  constructor(track:CoastalTrack){
    this.root=document.createElement('div');this.root.className='hud';
    const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    const route=track.samples.map(p=>`${(p.x+125)*0.65},${(p.z+170)*0.65}`).join(' ');
    this.root.innerHTML=`
      <header class="brand"><span class="brand-mark">c<span>${arrow}</span></span><div><div class="wordmark">COASTLINE<span> / 03</span></div><div class="eyebrow">AFTER DARK / STREET SESSION</div></div></header>
      <section class="track-title"><div class="live-label"><i></i> СВОБОДНЫЙ ЗАЕЗД</div><h1>Ночной<br>район<span>${arrow}</span></h1><p>НОЧЬ · НЕОНОВЫЙ ГОРОД <span> / </span> АСФАЛЬТ</p></section>
      <section class="timing panel"><div><span class="label">КРУГ</span><strong id="lap">01<span> / ∞</span></strong></div><div><span class="label">ВРЕМЯ КРУГА</span><strong id="time">0:00.00</strong></div><div class="best-time"><span class="label">ЛУЧШИЙ</span><strong id="best">—:——.——</strong></div></section>
      <section class="map panel"><div class="map-head"><span class="label">CITY CIRCUIT</span><span id="surface">АСФАЛЬТ</span></div><svg viewBox="0 0 165 145" aria-label="Карта трассы"><polyline points="${route} ${route.split(' ')[0]}" fill="none" stroke="#34506f" stroke-width="6" stroke-linejoin="round"/><polyline points="${route} ${route.split(' ')[0]}" fill="none" stroke="#55dbe7" stroke-width="2"/><circle cx="81.25" cy="110.5" r="4" fill="#f3b94e"/><circle id="map-car" r="4.5" fill="#ff4da9" stroke="#e8faff" stroke-width="2"/></svg><div class="map-foot"><span>${Math.round(track.length)} М</span><span>13 ПОВОРОТОВ</span></div></section>
      <div class="top-actions"><button id="fullscreen" title="На весь экран" aria-label="Полноэкранный режим" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><button id="camera" title="Камера · C" aria-label="Переключить камеру"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zM7 3v3m10-3v3M7 18v3m10-3v3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><button id="pause" title="Пауза · Esc" aria-label="Пауза">II</button><button id="reset" title="На старт · R" aria-label="Перезапустить заезд">↺</button><button id="help" aria-label="Как играть">?</button></div>
      <section class="speed panel"><div class="speed-top"><span class="label">VELOCITY</span><span class="gear" id="gear">N</span></div><div class="speed-value"><strong id="speed">000</strong><span>КМ/Ч</span></div><div class="speed-bars">${'<i></i>'.repeat(24)}</div><div class="telemetry"><span>УГОЛ СКОЛЬЖЕНИЯ <b id="angle">0°</b></span><span id="fps"></span></div></section>
      <section id="drift-box" class="drift-box"><div><span class="drift-icon">〰</span> <span id="drift-label">НАЙДИ СВОЮ ТРАЕКТОРИЮ</span></div><strong id="chain">0</strong><span class="drift-caption">DRIFT POINTS</span><div class="drift-meter"><i id="drift-meter"></i></div></section>
      <div class="bottom-note"><span class="status-dot"></span> RWD · ${CAR.mass.toLocaleString('ru')} КГ <span class="divider">/</span> <span id="total">0 ОЧКОВ</span></div>
      <div class="keyboard-hint"><kbd>W A S D</kbd> УПРАВЛЕНИЕ <span>·</span> <kbd>SPACE</kbd> ДРИФТ <span>·</span> <kbd>R</kbd> НА СТАРТ</div>
      <div class="touch-controls"><div class="steering"><button data-control="left" aria-label="Поворот налево">‹</button><button data-control="right" aria-label="Поворот направо">›</button></div><div class="pedals"><button data-control="drift" class="drift-button" aria-label="Ручной тормоз">〰<span>ДРИФТ</span></button><button data-control="brake" class="brake-button" aria-label="Тормоз или задний ход">II<span>ТОРМОЗ</span></button><button data-control="gas" class="gas-button" aria-label="Газ">↑<span>ГАЗ</span></button></div></div>
      <div id="pause-overlay" class="overlay hidden"><div class="dialog"><div class="live-label">COASTLINE / 03</div><h2 id="overlay-title">Небольшая остановка</h2><p>W / ↑ — газ · S / ↓ — тормоз и задний ход<br>A / D или ← / → — руль<br>Space — ручник · R — на старт · C — камера</p><p class="tip">Обычные повороты проходи на газу. Для заноса коротко нажми ручник и отпусти; контрруление помогает выбрать траекторию.</p><button id="resume">ПОЕХАЛИ ↗</button></div></div>
      <div id="toast" class="toast">W / ↑ — газ. Ночной город ждёт.</div>`;
    document.querySelector('#app')!.append(this.root);
    for(const el of this.root.querySelectorAll<HTMLElement>('[id]'))this.elements[el.id]=el;
    if(!new URLSearchParams(location.search).has('debug'))this.elements.fps.style.display='none';
  }
  button(id:string,callback:()=>void){this.elements[id].addEventListener('click',callback);}
  pause(paused:boolean,help=false){this.elements['pause-overlay'].classList.toggle('hidden',!paused);this.elements['overlay-title'].textContent=help?'Поймай свой ритм':'Небольшая остановка';}
  toast(text:string){this.elements.toast.textContent=text;this.elements.toast.classList.remove('fade');setTimeout(()=>this.elements.toast.classList.add('fade'),4200);}
  update(car:CarPhysics,race:RaceState,fps:number){
    const set=(id:string,text:string)=>{this.elements[id].textContent=text;};
    set('speed',Math.round(car.speed*3.6).toString().padStart(3,'0'));set('gear',car.vx< -0.7?'R':car.speed<0.5?'N':String(Math.min(5,1+Math.floor(car.speed/10))));
    set('lap',String(race.lap).padStart(2,'0'));set('time',timeLabel(race.elapsed));set('best',timeLabel(race.best));set('angle',`${Math.round(Math.abs(car.slipAngle)*180/Math.PI)}°`);
    set('fps',`${Math.round(fps)} FPS`);set('total',`${Math.floor(race.score).toLocaleString('ru')} ОЧКОВ`);
    set('chain',Math.floor(race.chain).toLocaleString('ru'));set('drift-label',race.drifting?'ДЕРЖИ ЗАНОС':'НАЙДИ СВОЮ ТРАЕКТОРИЮ');
    this.elements['drift-box'].classList.toggle('active',race.drifting);this.elements['drift-meter'].style.width=`${car.slipIntensity*100}%`;
    set('surface',car.surface==='asphalt'?'АСФАЛЬТ':car.surface==='shoulder'?'ОБОЧИНА':'ТРАВА');
    this.elements['map-car'].setAttribute('cx',String((car.x+125)*0.65));this.elements['map-car'].setAttribute('cy',String((car.z+170)*0.65));
    this.root.querySelectorAll<HTMLElement>('.speed-bars i').forEach((bar,i)=>bar.classList.toggle('lit',i<car.speed/CAR.maxSpeed*24));
  }
  dispose(){this.root.remove();}
}
