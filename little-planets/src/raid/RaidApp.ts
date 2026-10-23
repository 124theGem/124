import { version } from "../../package.json";
import { RAID_SKINS,RAID_WEAPONS,RAID_PERKS,RAID_CONTRACTS,RAID_DURATION,RAID_EXIT_AT,raidBagValue,raidInteraction,raidUpgradeCost,raidLevel, type RaidSnapshot,type RaidCommand,type RaidMap,type RaidSkin } from "../../shared/raid";
import type { Telegram } from "../platform/Telegram";
import { RaidView } from "./RaidView";
import { RaidTransport } from "./RaidTransport";
import { icon } from "./icons";
import "./raid.css";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
const clock=(v:number)=>`${Math.floor(Math.max(0,v)/60)}:${String(Math.floor(Math.max(0,v)%60)).padStart(2,"0")}`;
export class RaidApp {
  private root=document.createElement("main");
  private ui=document.createElement("div");
  private view=new RaidView();
  private api:RaidTransport;
  private state?:RaidSnapshot;
  private abort=new AbortController();
  private keys=new Set<string>();
  private stick={x:0,z:0};
  private dash=false;
  private use=false;
  private busy=false;
  private network=false;
  private networkWait:Promise<void>=Promise.resolve();
  private connected=false;
  private frameAt=0;
  private pollAt=0;
  private toastTimer=0;
  private animation=0;
  private disposed=false;
  private homeKey="";
  private hudKey="";
  private resultId="";
  private perkKey="";
  private map:RaidMap="dock";
  private pane="home";
  private preview?:RaidSkin;
  private sound=true;
  private audio?:AudioContext;
  private lastShot=0;
  private lastSoundEvent=0;
  constructor(private telegram:Telegram){
    this.api=new RaidTransport(telegram.initData);this.root.className="rift-raid";this.ui.className="rr-ui";
    this.sound=localStorage.getItem("rift-raid-sound")!=="off";
    this.ui.innerHTML=`<header class="rr-header"><button class="rr-logo" id="rr-logo" aria-label="На базу"><i>${icon("bolt")}</i><span>RIFT<span>RAID</span><small>EXTRACTION / ${version}</small></span></button><div class="rr-header-right"><span class="rr-wallet">${icon("loot")}<b id="rr-wallet">—</b></span><button class="rr-icon" id="rr-audio" aria-label="Включить или выключить звук">${icon("sound")}</button><button class="rr-profile" id="rr-profile" aria-label="Профиль рейдера">R<span id="rr-player-level">01</span></button></div></header><section class="rr-home" id="rr-home"></section><nav class="rr-nav" id="rr-nav">${[["home","home","База"],["gear","gun","Арсенал"],["daily","target","Контракты"],["season","season","Сезон"],["shop","star","Образы"]].map(([id,i,name])=>`<button data-pane="${id}">${icon(i)}<span>${name}</span></button>`).join("")}</nav><section class="rr-hud" id="rr-hud" hidden><div class="rr-health"><span>${icon("heart")}<b id="rr-hp">100</b><small id="rr-level">УР. 1</small></span><div><i id="rr-hp-fill"></i></div></div><div class="rr-run-clock"><span id="rr-timer">3:00</span><small id="rr-exit-time">ШЛЮЗ ЗАКРЫТ</small></div><button class="rr-icon rr-quit" id="rr-quit" aria-label="Покинуть рейд">${icon("exit")}</button><div class="rr-team" id="rr-team"></div><div class="rr-loot-meter">${icon("loot")}<div><small>В РЮКЗАКЕ</small><b id="rr-loot">0</b></div><span id="rr-kills">0 целей</span></div><div class="rr-mission-tip" id="rr-mission-tip"></div><div class="rr-stick" id="rr-stick" aria-label="Джойстик движения"><span></span></div><button class="rr-dash" id="rr-dash" aria-label="Рывок">${icon("dash")}<b id="rr-dash-label">РЫВОК</b></button><button class="rr-use" id="rr-use" aria-label="Взаимодействие" hidden><span id="rr-use-label"></span><i id="rr-use-progress"></i></button><div class="rr-desktop-help"><kbd>WASD</kbd> движение <kbd>SPACE</kbd> рывок <kbd>E</kbd> удерживать · огонь автоматически</div></section><section class="rr-perks" id="rr-perks" hidden></section><section class="rr-result" id="rr-result" hidden></section><section class="rr-modal" id="rr-modal" hidden></section><div class="rr-toast" id="rr-toast" role="status"></div><div class="rr-connection" id="rr-connection">СВЯЗЬ СО ШТАБОМ</div>`;
    this.root.append(this.view.canvas,this.ui);document.querySelector("#app")!.replaceChildren(this.root);this.bind();
    this.animation=requestAnimationFrame(this.frame);void this.connect();
    if(new URLSearchParams(location.search).has("debug"))Object.defineProperty(window,"__raid",{configurable:true,value:{snapshot:()=>structuredClone(this.state)}});
  }
  private el<T extends HTMLElement=HTMLElement>(selector:string){return this.ui.querySelector<T>(selector)!;}
  private bind(){
    const signal=this.abort.signal;
    this.el("#rr-logo").onclick=()=>{if(!this.state?.room.run)this.openPane("home");};
    this.el("#rr-profile").onclick=()=>this.profile();
    this.el("#rr-audio").onclick=()=>{this.sound=!this.sound;localStorage.setItem("rift-raid-sound",this.sound?"on":"off");this.toast(this.sound?"Звук включён":"Звук выключен");};
    this.el("#rr-quit").onclick=()=>this.quit();
    this.ui.querySelectorAll<HTMLElement>("[data-pane]").forEach(b=>b.onclick=()=>this.openPane(b.dataset.pane!));
    window.addEventListener("resize",()=>this.view.resize(),{signal});
    window.addEventListener("keydown",e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;if(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight","Space","KeyE"].includes(e.code)){e.preventDefault();this.keys.add(e.code);}if(e.code==="Escape")this.closeModal();},{signal});
    window.addEventListener("keyup",e=>this.keys.delete(e.code),{signal});window.addEventListener("blur",()=>this.clearInput(),{signal});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)this.clearInput();else if(!this.connected)void this.connect();},{signal});
    window.addEventListener("pagehide",()=>this.dispose(),{signal,once:true});
    this.root.addEventListener("pointerdown",()=>{if(this.sound&&!this.audio){try{this.audio=new AudioContext();}catch{}}if(this.audio?.state==="suspended")void this.audio.resume();},{signal});
    const stick=this.el("#rr-stick"),knob=stick.querySelector<HTMLElement>("span")!;let pointer:number|null=null;
    const move=(e:PointerEvent)=>{const b=stick.getBoundingClientRect(),r=b.width*.34,x=e.clientX-b.x-b.width/2,z=e.clientY-b.y-b.height/2,n=Math.max(1,Math.hypot(x,z)/r);this.stick={x:x/n/r,z:z/n/r};knob.style.transform=`translate(${x/n}px,${z/n}px)`;};
    stick.addEventListener("pointerdown",e=>{if(pointer!==null)return;pointer=e.pointerId;stick.setPointerCapture(e.pointerId);move(e);},{signal});stick.addEventListener("pointermove",e=>{if(pointer===e.pointerId)move(e);},{signal});
    for(const event of["pointerup","pointercancel","lostpointercapture"])stick.addEventListener(event,()=>{pointer=null;this.stick={x:0,z:0};knob.style.transform="";},{signal});
    for(const [id,key]of[["#rr-dash","dash"],["#rr-use","use"]]as const){const b=this.el(id);b.addEventListener("pointerdown",e=>{b.setPointerCapture(e.pointerId);this[key]=true;b.classList.add("rr-held");},{signal});for(const event of["pointerup","pointercancel","lostpointercapture"])b.addEventListener(event,()=>{this[key]=false;b.classList.remove("rr-held");},{signal});}
  }
  private clearInput(){this.keys.clear();this.stick={x:0,z:0};this.dash=this.use=false;}
  private async connect(invite?:string){
    if(this.busy||this.disposed)return;this.busy=true;
    try{
      await this.networkWait;
      const start=new URLSearchParams(this.telegram.initData).get("start_param"),code=invite??new URLSearchParams(location.search).get("squad")??(start?.startsWith("rr_")?start.slice(3):undefined);
      let state:RaidSnapshot;
      try{state=await this.api.hello(code&&/^[A-Z2-9]{6}$/.test(code)?code:undefined);}catch(error){if(code){this.toast((error as Error).message);state=await this.api.hello();}else throw error;}
      this.connected=true;this.el("#rr-connection").hidden=true;this.accept(state);if(this.api.local)this.toast("Локальный профиль · для совместных рейдов откройте игру в Telegram");
    }catch(error){this.toast((error as Error).message);this.el("#rr-connection").innerHTML=`<p></p><button id="rr-reconnect">Повторить</button>`;this.el("#rr-connection").querySelector("p")!.textContent=(error as Error).message;this.el("#rr-connection").querySelector<HTMLButtonElement>("button")!.onclick=()=>void this.connect();}
    finally{this.busy=false;}
  }
  private accept(state:RaidSnapshot){
    if(this.disposed)return;const previous=this.state?.room.run?.id;this.state=state;
    if(state.room.run?.id!==previous)this.lastSoundEvent=0;
    this.el("#rr-wallet").textContent=String(state.profile.credits);this.el("#rr-player-level").textContent=String(raidLevel(state.profile.xp)).padStart(2,"0");
    const run=state.room.run,pawn=run?.pawns.find(p=>p.id===state.me),active=!!run&&!!pawn;
    this.root.dataset.phase=active?"raid":"base";this.el("#rr-home").hidden=active;this.el("#rr-nav").hidden=active;this.el("#rr-hud").hidden=!active;
    if(active&&pawn){
      this.clearHome();
      if(pawn.state==="dead"||pawn.state==="extracted")this.showResult();
      const key=pawn.choices.join(":");
      if(key!==this.perkKey){this.perkKey=key;this.el("#rr-perks").hidden=!key;if(key){this.el("#rr-perks").innerHTML=`<small>${run.pawns.length===1?"РЕЙД НА ПАУЗЕ":"ЩИТ ПОДНЯТ"} · ВЫБЕРИ УЛУЧШЕНИЕ</small><div>${pawn.choices.map(perk=>`<button data-perk="${perk}">${icon(RAID_PERKS[perk].icon)}<b>${RAID_PERKS[perk].name}</b><span>${RAID_PERKS[perk].text}</span></button>`).join("")}</div>`;this.ui.querySelectorAll<HTMLElement>("[data-perk]").forEach(b=>b.onclick=()=>void this.command({type:"perk",perk:b.dataset.perk as keyof typeof RAID_PERKS}));}}
    }else{
      this.el("#rr-perks").hidden=true;this.perkKey="";
      if(previous&&state.profile.lastRun?.id===previous&&this.resultId!==previous)this.showResult();
      const key=JSON.stringify([this.pane,state.profile.credits,state.profile.xp,state.profile.skin,state.profile.weapon,state.profile.skins,state.profile.upgrades,state.profile.stats,state.profile.daily,state.profile.season,state.room.members,state.room.code,state.leaderboard,state.shop.enabled,this.map]);
      if(key!==this.homeKey){this.homeKey=key;this.renderHome();}
    }
  }
  private clearHome(){this.homeKey="";}
  private openPane(pane:string){if(this.state?.room.run)return;this.preview=undefined;this.pane=pane;this.homeKey="";this.renderHome();}
  private renderHome(){
    if(!this.state)return;const s=this.state,p=s.profile,home=this.el("#rr-home");this.ui.querySelectorAll<HTMLElement>("[data-pane]").forEach(b=>b.classList.toggle("active",b.dataset.pane===this.pane));
    this.root.dataset.pane=this.pane;
    if(this.pane==="home"){
      home.innerHTML=`<div class="rr-hero-copy"><span class="rr-eyebrow"><i></i>КОРОТКИЙ РЕЙД. БОЛЬШОЙ КУШ.</span><h1>ЗАБРАТЬ.<br>ВЫЖИТЬ.<br><em>ВЕРНУТЬСЯ.</em></h1><p>Три минуты за чертой.<br>Добыча твоя, если вынесешь её живым.</p><div class="rr-hero-badges"><span>${icon("clock")}3 МИНУТЫ</span><span>${icon("team")}1–3 ИГРОКА</span></div></div><div class="rr-launch-panel"><div class="rr-squad"><div><small>ОТРЯД / ${s.room.code}</small><b>${s.room.members.length===1?"Соло. Или позови своих.":`${s.room.members.length} рейдера в сборе`}</b></div><button id="rr-invite" aria-label="Пригласить в отряд">${icon("team")}+</button></div><div class="rr-squad-members">${s.room.members.map(m=>`<span style="--skin:${RAID_SKINS[m.skin].glow}"><i></i>${escape(m.name)}<small>${m.ready?"ГОТОВ":"СБОРЫ"}</small></span>`).join("")}</div><div class="rr-map-pick">${[["dock","Грузовые доки","ПЕРВЫЙ КОНТАКТ"],["lab","Сектор 99","ЛАБОРАТОРИЯ"]].map(([id,name,tag])=>`<button data-map="${id}" class="${this.map===id?"active":""}"><small>${tag}</small><b>${name}</b></button>`).join("")}</div><button class="rr-primary rr-launch" id="rr-start">${s.room.owner===s.me?`В РЕЙД ${icon("arrow")}`:s.room.members.find(m=>m.id===s.me)?.ready?"ОТМЕНИТЬ ГОТОВНОСТЬ":"Я ГОТОВ"}</button><p class="rr-launch-note">Огонь автоматически. Двигайся и используй рывок.</p><button class="rr-link" id="rr-join">Есть код отряда? Присоединиться</button></div><div class="rr-home-bottom"><span>УСПЕШНЫХ ВЫЛАЗОК <b>${p.stats.extracts}</b></span><span>ЛУЧШИЙ ВЫНОС <b>${p.stats.bestLoot}</b></span><button id="rr-board">Недельный рейтинг ${icon("arrow")}</button></div>`;
      this.el("#rr-start").onclick=()=>void this.command(s.room.owner===s.me?{type:"start",map:this.map}:{type:"ready"});
      this.el("#rr-invite").onclick=()=>void this.invite();this.el("#rr-join").onclick=()=>this.join();this.el("#rr-board").onclick=()=>this.leaderboard();
      home.querySelectorAll<HTMLElement>("[data-map]").forEach(b=>b.onclick=()=>{this.map=b.dataset.map as RaidMap;this.homeKey="";this.renderHome();});
    }else if(this.pane==="gear"){
      home.innerHTML=`<div class="rr-page-head"><span class="rr-eyebrow">СНАРЯЖЕНИЕ / ПОСТОЯННЫЙ ПРОГРЕСС</span><h1>ПОД ТВОЙ<br><em>СТИЛЬ ИГРЫ.</em></h1><p>Оружие открывается за эвакуации. База усиливается за добычу.</p></div><div class="rr-gear-grid">${Object.entries(RAID_WEAPONS).map(([id,w])=>`<button class="rr-weapon ${p.weapon===id?"active":""}" data-weapon="${id}" ${p.stats.extracts<w.unlock?"disabled":""}>${icon("gun")}<div><small>${p.stats.extracts<w.unlock?`ПОСЛЕ ${w.unlock} ЭВАКУАЦИЙ`:p.weapon===id?"ВЫБРАНО":"ДОСТУПНО"}</small><h2>${w.name}</h2><p>${w.description}</p><span>УРОН ${w.damage} / ТЕМП ${(1/w.rate).toFixed(1)}</span></div></button>`).join("")}<div class="rr-upgrades">${[["vitality","heart","Экзокаркас","+12 к здоровью"],["power","bolt","Калибровка","+6% к урону"],["magnet","loot","Сборщик","+0.25 м к сбору"]].map(([id,i,name,text])=>{const l=p.upgrades[id as keyof typeof p.upgrades];return`<button data-upgrade="${id}" ${l>=5||p.credits<raidUpgradeCost(l)?"disabled":""}>${icon(i)}<span><b>${name}</b><small>${text} · ${l}/5</small></span><em>${l>=5?"MAX":raidUpgradeCost(l)+" ◈"}</em></button>`;}).join("")}</div></div>`;
      home.querySelectorAll<HTMLElement>("[data-weapon]").forEach(b=>b.onclick=()=>void this.command({type:"equip",name:p.name,skin:p.skin,weapon:b.dataset.weapon as typeof p.weapon}));home.querySelectorAll<HTMLElement>("[data-upgrade]").forEach(b=>b.onclick=()=>void this.command({type:"upgrade",upgrade:b.dataset.upgrade as keyof typeof p.upgrades}));
    }else if(this.pane==="daily"){
      home.innerHTML=`<div class="rr-page-head"><span class="rr-eyebrow">НОВАЯ СМЕНА / ${p.daily.day}</span><h1>КАЖДЫЙ РЕЙД<br><em>ИМЕЕТ ЦЕЛЬ.</em></h1><p>Контракты действуют до конца дня по UTC.</p></div><div class="rr-contracts">${RAID_CONTRACTS.map(c=>{const n=p.daily[c.id],claimed=p.daily.claimed.includes(c.id);return`<article><span>${icon(c.id==="kills"?"target":c.id==="chests"?"loot":"exit")}</span><div><small>${c.title.toUpperCase()}</small><h2>${c.text}</h2><div class="rr-track"><i style="width:${Math.min(100,n/c.target*100)}%"></i></div><p>${Math.min(n,c.target)} / ${c.target} · +${c.reward} жетонов и +50 XP сезона</p></div><button data-contract="${c.id}" ${claimed||n<c.target?"disabled":""}>${claimed?icon("check"):n>=c.target?"Забрать":"В процессе"}</button></article>`;}).join("")}</div><div class="rr-friend-card">${icon("team")}<div><b>Вместе выгоднее.</b><p>Новый участник и создатель отряда получают по 200 жетонов за первую общую эвакуацию. Бонус для аккаунта младше 7 дней — один раз.</p></div><button id="rr-daily-invite">Позвать друга</button></div>`;
      home.querySelectorAll<HTMLElement>("[data-contract]").forEach(b=>b.onclick=()=>void this.command({type:"daily",contract:b.dataset.contract!}));this.el("#rr-daily-invite").onclick=()=>void this.invite();
    }else if(this.pane==="season"){
      home.innerHTML=`<div class="rr-page-head"><span class="rr-eyebrow">СЕЗОН / ${p.season.id}</span><h1>ТВОЯ<br><em>НОЧНАЯ СМЕНА.</em></h1><p>Бесплатный трек. Получай опыт в рейдах и забирай награды.</p><b class="rr-season-xp">${p.season.xp} XP</b></div><div class="rr-season-grid">${Array.from({length:8},(_,i)=>{const tier=i+1,ready=p.season.xp>=tier*150,claimed=p.season.claimed.includes(tier);return`<button data-tier="${tier}" ${!ready||claimed?"disabled":""} class="${claimed?"claimed":ready?"ready":""}"><small>УРОВЕНЬ ${String(tier).padStart(2,"0")}</small>${icon(claimed?"check":"loot")}<b>${100+tier*25} ◈</b><span>${claimed?"ПОЛУЧЕНО":ready?"ЗАБРАТЬ":tier*150+" XP"}</span></button>`;}).join("")}</div>`;home.querySelectorAll<HTMLElement>("[data-tier]").forEach(b=>b.onclick=()=>void this.command({type:"season",tier:Number(b.dataset.tier)}));
    }else this.renderShop(home);
  }
  private renderShop(home:HTMLElement){
    const p=this.state!.profile,prices={solar:49,void:99,founder:149};
    home.innerHTML=`<div class="rr-page-head"><span class="rr-eyebrow">ОБРАЗЫ / ТОЛЬКО ВНЕШНИЙ ВИД</span><h1>ЗАПОМНЯТ<br><em>ТВОЙ СИЛУЭТ.</em></h1><p>У всех образов одинаковые боевые характеристики.</p></div><div class="rr-skins">${Object.entries(RAID_SKINS).map(([id,s])=>{const owned=p.skins.includes(id as RaidSkin);return`<article style="--skin:${s.color};--glow:${s.glow}" class="${id===p.skin?"equipped":""}"><button class="rr-skin-preview" data-preview="${id}" aria-label="Примерить ${s.name}"><i>${icon("shield")}</i><span>ПРИМЕРИТЬ</span></button><h2>${s.name}</h2><small>${owned?"В КОЛЛЕКЦИИ":s.credits+" ЖЕТОНОВ"}</small><button data-skin="${id}" ${!owned&&p.credits<s.credits?"disabled":""}>${owned?id===p.skin?"Надет":"Надеть":`Открыть · ${s.credits} ◈`}</button>${!owned&&this.state!.shop.enabled&&Object.hasOwn(prices,id)?`<button class="rr-stars" data-stars="${id}">${icon("star")} ${prices[id as keyof typeof prices]} Stars</button>`:""}</article>`;}).join("")}</div><div class="rr-shop-foot"><p>${this.state!.shop.enabled?"Цифровая косметика. Оплата через Telegram Stars. Образ выдаётся после подтверждения покупки.":"Все образы доступны за жетоны из рейдов. Покупки за Stars пока не открыты."}</p><button id="rr-purchases">Мои покупки / возврат</button></div>`;
    home.querySelectorAll<HTMLElement>("[data-preview]").forEach(b=>b.onclick=()=>{this.preview=b.dataset.preview as RaidSkin;this.toast(`Примерка: ${RAID_SKINS[this.preview].name}`);});
    home.querySelectorAll<HTMLElement>("[data-skin]").forEach(b=>b.onclick=()=>{const skin=b.dataset.skin as RaidSkin;void this.command(p.skins.includes(skin)?{type:"equip",name:p.name,weapon:p.weapon,skin}:{type:"buySkin",skin});});
    home.querySelectorAll<HTMLElement>("[data-stars]").forEach(b=>b.onclick=()=>void this.purchase(b.dataset.stars!));this.el("#rr-purchases").onclick=()=>void this.purchases();
  }
  private profile(){
    if(!this.state||this.state.room.run)return;const p=this.state.profile;
    this.modal(`<span class="rr-eyebrow">ДОСЬЕ РЕЙДЕРА</span><h2>${escape(p.name)}</h2><form id="rr-name-form"><label>Позывной<input name="name" maxlength="24" value="${escape(p.name)}" autocomplete="nickname"></label><button class="rr-primary">Сохранить</button></form><div class="rr-profile-stats"><span><b>${raidLevel(p.xp)}</b>УРОВЕНЬ</span><span><b>${p.stats.extracts}</b>ЭВАКУАЦИЙ</span><span><b>${p.stats.kills}</b>ЦЕЛЕЙ</span><span><b>${p.stats.bestLoot}</b>ЛУЧШИЙ ВЫНОС</span></div><p class="rr-note">${p.xp} XP · ${this.api.local?"Локальный профиль":"Прогресс привязан к вашему Telegram"}</p>`);
    this.el<HTMLFormElement>("#rr-name-form").onsubmit=e=>{e.preventDefault();const data=new FormData(e.currentTarget as HTMLFormElement);void this.command({type:"equip",name:String(data.get("name")),skin:p.skin,weapon:p.weapon}).then(ok=>{if(ok)this.closeModal();});};
  }
  private async invite(){
    try{const invite=await this.api.invite();this.modal(`<span class="rr-eyebrow">ОТРЯД ДО ТРЁХ РЕЙДЕРОВ</span><h2>Зови своих.</h2><p>Соберите команду и вернитесь с добычей вместе.</p><div class="rr-invite-code">${invite.code}</div><button class="rr-primary" id="rr-share">${icon("team")} ${invite.url?"Пригласить в Telegram":"Скопировать код"}</button><p class="rr-note">${this.api.local?"Совместные рейды доступны в Telegram.":"Друг может открыть игру и ввести этот код на базе."}</p>`);this.el("#rr-share").onclick=()=>void(async()=>{if(invite.url){const url=`https://t.me/share/url?url=${encodeURIComponent(invite.url)}&text=${encodeURIComponent("RIFT RAID. Три минуты за чертой — идём вместе? Отряд "+invite.code)}`;this.telegram.app?.openTelegramLink?.(url);}else{await navigator.clipboard.writeText(invite.code);this.toast("Код отряда скопирован");}})().catch(()=>this.toast("Код отряда: "+invite.code));}catch(e){this.toast((e as Error).message);}
  }
  private join(){this.modal(`<span class="rr-eyebrow">СВОИ НА СВЯЗИ</span><h2>Найти отряд.</h2><form id="rr-join-form"><label>Шестизначный код<input name="code" minlength="6" maxlength="6" placeholder="ABC234" autocomplete="off" required></label><button class="rr-primary">Присоединиться</button></form>`);this.el<HTMLFormElement>("#rr-join-form").onsubmit=e=>{e.preventDefault();const code=String(new FormData(e.currentTarget as HTMLFormElement).get("code")).toUpperCase();if(this.api.local){this.toast("Откройте игру в Telegram для совместного рейда.");return;}this.closeModal();void this.connect(code);};}
  private leaderboard(){const board=this.state!.leaderboard;this.modal(`<span class="rr-eyebrow">НЕДЕЛЬНЫЙ РЕЙТИНГ / ЛУЧШИЙ ВЫНОС</span><h2>Те, кто вернулись.</h2><div class="rr-leaderboard">${board.length?board.map((p,i)=>`<div><i>${String(i+1).padStart(2,"0")}</i><span>${escape(p.name)}</span><b>${p.score} ◈</b></div>`).join(""):"<p>Таблица ждёт первых рейдеров. Забери добычу и вернись на базу.</p>"}</div>`);}
  private async purchase(sku:string){
    if(this.busy)return;this.busy=true;try{const invoice=await this.api.invoice(sku);if(!this.telegram.app?.openInvoice)throw new Error("Откройте магазин в Telegram.");this.telegram.app.openInvoice(invoice.url,status=>{this.toast(status==="paid"?"Telegram обрабатывает покупку. Образ появится после подтверждения.":"Оплата не завершена.");void this.refresh();});}catch(e){this.toast((e as Error).message);}finally{this.busy=false;}
  }
  private async purchases(){
    try{const data=await this.api.purchases();this.modal(`<span class="rr-eyebrow">TELEGRAM STARS / ПОКУПКИ</span><h2>Всё по-честному.</h2><p>Возврат отключает купленный образ и возвращает Stars через Telegram.</p><div class="rr-purchases">${data.purchases.length?data.purchases.map(p=>`<div><span><b>${escape(RAID_SKINS[p.sku as RaidSkin]?.name??p.sku)}</b><small>${p.amount} Stars · ${new Date(p.at).toLocaleDateString("ru-RU")}</small></span><button data-refund="${escape(p.id)}" ${p.state==="refunded"?"disabled":""}>${p.state==="refunded"?"Возвращено":"Вернуть"}</button></div>`).join(""):"<p>Покупок пока нет.</p>"}</div>`);this.ui.querySelectorAll<HTMLElement>("[data-refund]").forEach(b=>b.onclick=()=>{this.modal(`<h2>Вернуть Stars?</h2><p>Купленный образ станет недоступен. Telegram вернёт Stars на ваш баланс.</p><button class="rr-primary" id="rr-refund-confirm">Подтвердить возврат</button>`);this.el("#rr-refund-confirm").onclick=()=>void this.api.refund(b.dataset.refund!).then(()=>{this.toast("Возврат подтверждён");this.closeModal();void this.refresh();}).catch(e=>this.toast(e.message));});}catch(e){this.toast((e as Error).message);}
  }
  private quit(){this.clearInput();this.modal(`<span class="rr-eyebrow">ВЫХОД ИЗ РЕЙДА</span><h2>Оставить добычу?</h2><p>Добыча в рюкзаке останется в зоне. Уже сохранённые жетоны и улучшения базы сохранятся.</p><button class="rr-primary" id="rr-quit-confirm">Завершить рейд</button>`);this.el("#rr-quit-confirm").onclick=()=>void this.command({type:"leave"}).then(ok=>{if(ok){this.resultId=this.state?.profile.lastRun?.id??"";this.closeModal();this.el("#rr-result").hidden=true;}});}
  private showResult(){
    const p=this.state!.profile,r=p.lastRun;if(!r||this.resultId===r.id)return;this.resultId=r.id;this.clearInput();const win=r.outcome==="extracted";
    this.el("#rr-result").hidden=false;this.el("#rr-result").innerHTML=`<article><span class="rr-eyebrow">${win?"ЭВАКУАЦИЯ УСПЕШНА":r.outcome==="interrupted"?"СВЯЗЬ С ЗОНОЙ ПРЕРВАНА":"РЕЙД ЗАВЕРШЁН"}</span><div class="rr-result-icon">${icon(win?"loot":"shield")}</div><h1>${win?"ДОБЫЧА<br><em>У НАС.</em>":"СЛЕДУЮЩИЙ<br><em>БУДЕТ ТВОИМ.</em>"}</h1><div class="rr-result-stats"><span><b>+${r.credits}</b>ЖЕТОНОВ</span><span><b>+${r.xp}</b>ОПЫТА</span><span><b>${r.kills}</b>ЦЕЛЕЙ</span></div><p>${win?`Лом ${r.loot.scrap} · Данные ${r.loot.data} · Ядра ${r.loot.core}`:"Добыча осталась в зоне. Опыт и постоянные улучшения сохранены."}</p><button class="rr-primary" id="rr-result-home">На базу ${icon("arrow")}</button><small>${r.duration} СЕКУНД · ${r.map==="dock"?"ГРУЗОВЫЕ ДОКИ":"СЕКТОР 99"}</small></article>`;
    this.el("#rr-result-home").onclick=()=>void this.command({type:"home"}).then(ok=>{if(ok)this.el("#rr-result").hidden=true;});
  }
  private modal(html:string){this.clearInput();this.el("#rr-modal").hidden=false;this.el("#rr-modal").innerHTML=`<article><button class="rr-close" aria-label="Закрыть">${icon("close")}</button>${html}</article>`;this.el(".rr-close").onclick=()=>this.closeModal();}
  private closeModal(){this.el("#rr-modal").hidden=true;this.preview=undefined;}
  private async command(command:RaidCommand){
    if(this.busy||!this.connected)return false;this.busy=true;this.clearInput();
    try{await this.networkWait;const state=await this.api.command(command);this.accept(state);if(command.type==="start"){this.el("#rr-result").hidden=true;this.el("#rr-modal").hidden=true;this.toast("Двигайся. Огонь автоматический. Шлюз откроется через 45 секунд.");}return true;}
    catch(e){this.toast((e as Error).message);return false;}finally{this.busy=false;}
  }
  private async refresh(){
    if(this.network||this.busy||!this.connected||this.disposed)return;
    this.network=true;
    this.networkWait=(async()=>{try{
      const active=this.state?.room.run?.status==="active",x=this.stick.x+Number(this.keys.has("KeyD")||this.keys.has("ArrowRight"))-Number(this.keys.has("KeyA")||this.keys.has("ArrowLeft")),z=this.stick.z+Number(this.keys.has("KeyS")||this.keys.has("ArrowDown"))-Number(this.keys.has("KeyW")||this.keys.has("ArrowUp")),n=Math.max(1,Math.hypot(x,z));
      this.accept(await this.api.poll(active?{x:x/n,z:z/n,dash:this.dash||this.keys.has("Space"),interact:this.use||this.keys.has("KeyE")}:undefined));
      this.el("#rr-connection").hidden=true;
    }catch(e){
      if(this.disposed)return;
      this.el("#rr-connection").hidden=false;this.el("#rr-connection").textContent="ПЕРЕПОДКЛЮЧЕНИЕ К ШТАБУ";
      if((e as {status?:number}).status===409){this.connected=false;this.toast((e as Error).message);this.el("#rr-connection").innerHTML=`Игра открыта в другом окне. <button onclick="location.reload()">Перезагрузить</button>`;}
    }finally{this.network=false;}})();
    await this.networkWait;
  }
  private toast(text:string){if(this.disposed)return;this.el("#rr-toast").textContent=text;this.el("#rr-toast").classList.add("visible");clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>this.el("#rr-toast").classList.remove("visible"),4000);}
  private beep(frequency:number,duration=.04){if(!this.sound||!this.audio||this.audio.state!=="running")return;const o=this.audio.createOscillator(),gain=this.audio.createGain(),at=this.audio.currentTime;o.type="triangle";o.frequency.setValueAtTime(frequency,at);o.frequency.exponentialRampToValueAtTime(frequency*.45,at+duration);gain.gain.setValueAtTime(.025,at);gain.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(gain).connect(this.audio.destination);o.start();o.stop(at+duration);}
  private frame=(time:number)=>{
    if(this.disposed)return;const dt=this.frameAt?Math.min(.05,(time-this.frameAt)/1000):0;this.frameAt=time;
    if(!document.hidden){this.api.advance(dt);const active=!!this.state?.room.run;
      if(time-this.pollAt>(active?125:1200)){this.pollAt=time;void this.refresh();}
      const s=this.state,run=s?.room.run,p=run?.pawns.find(p=>p.id===s!.me);
      this.view.draw(s,dt,time/1000,this.preview);
      if(run&&p){
        this.el("#rr-hp").textContent=String(Math.ceil(p.hp));this.el("#rr-level").textContent=`УР. ${p.level}`;this.el("#rr-hp-fill").style.width=`${p.hp/p.maxHp*100}%`;this.el("#rr-timer").textContent=clock(RAID_DURATION-run.elapsed);
        this.el("#rr-exit-time").textContent=run.elapsed>=RAID_EXIT_AT?"ШЛЮЗ ОТКРЫТ":`ШЛЮЗ ЧЕРЕЗ ${Math.ceil(RAID_EXIT_AT-run.elapsed)} С`;
        this.el("#rr-loot").textContent=String(raidBagValue(p.bag));this.el("#rr-kills").textContent=`${p.kills} целей`;
        const interaction=raidInteraction(run,p),alive=p.state==="alive";this.el("#rr-use").hidden=!interaction||!alive;
        if(interaction){this.el("#rr-use-label").textContent=interaction.title;this.el("#rr-use-progress").style.width=`${Math.min(1,p.interactProgress/interaction.seconds)*100}%`;}
        const cooldown=Math.max(0,4-(run.elapsed-p.dashAt));this.el("#rr-dash-label").textContent=cooldown>0?`${Math.ceil(cooldown)} С`:"РЫВОК";this.el("#rr-dash").classList.toggle("cooldown",cooldown>0);
        this.el("#rr-mission-tip").textContent=p.state==="down"?"Ты ранен. Напарник может поднять тебя.":run.elapsed>150?"Последние секунды. К зелёному шлюзу в нижней части зоны!":run.elapsed>=RAID_EXIT_AT?"Вынеси добычу: вернись к зелёному шлюзу и удерживай эвакуацию.":"Двигайся. Огонь автоматический. Открывай контейнеры и собирай добычу.";
        const key=run.pawns.map(p=>`${p.id}:${Math.ceil(p.hp)}:${p.state}`).join("|");if(key!==this.hudKey){this.hudKey=key;this.el("#rr-team").innerHTML=run.pawns.filter(f=>f.id!==s!.me).map(f=>`<div><i style="background:${RAID_SKINS[f.skin].glow}"></i>${escape(f.name)}<small>${f.state==="alive"?Math.ceil(f.hp)+" HP":f.state==="down"?"РАНЕН":f.state==="extracted"?"ВЫШЕЛ":"ПОГИБ"}</small></div>`).join("");}
        for(const event of run.events)if(event.id>this.lastSoundEvent){if(event.kind==="shot"&&time-this.lastShot>90){this.beep(190);this.lastShot=time;}else if(event.kind==="chest"||event.kind==="extract")this.beep(640,.15);this.lastSoundEvent=event.id;}
      }
    }
    this.animation=requestAnimationFrame(this.frame);
  };
  dispose(){if(this.disposed)return;this.disposed=true;this.abort.abort();this.clearInput();cancelAnimationFrame(this.animation);clearTimeout(this.toastTimer);void this.audio?.close();this.view.dispose();this.telegram.dispose();this.root.remove();}
}
