import * as T from "three";
import { version } from "../../package.json";
import {
  NEXUS_PORTALS, NEXUS_COLORS, NEXUS_OUTFITS, RELICS, RACE_GATES,
  freshNexusProfile, spawnNexus, stepNexus, nearestNexusPortal, nexusLevel,
  type NexusActor, type NexusCommand, type NexusInput, type NexusSnapshot, type NexusPortal,
} from "../../shared/nexus";
import { NexusTransport } from "./NexusTransport";
import { NexusWorldView, type NexusAvatar } from "./NexusWorld";
import { graphicsQuality, studioEnvironment, type GraphicsQuality } from "../world/Graphics";
import type { Persistence } from "../platform/Persistence";
import type { Telegram } from "../platform/Telegram";
import { hudIcon } from "../ui/Glyphs";
import "./nexus.css";
const safe = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const timeLabel = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(2)} с`;

export class NexusApp {
  private root = document.createElement("main");
  private ui = document.createElement("div");
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(55, 1, 0.1, 400);
  private renderer = new T.WebGLRenderer({ antialias: graphicsQuality() !== "economy", powerPreference: "high-performance" });
  private world = new NexusWorldView();
  private environment: T.WebGLRenderTarget;
  private api: NexusTransport;
  private snapshot?: NexusSnapshot;
  private actor: NexusActor;
  private own: NexusAvatar;
  private peers = new Map<string, { avatar: NexusAvatar; actor: NexusActor; label: HTMLElement }>();
  private abort = new AbortController();
  private keys = new Set<string>();
  private pending: NexusInput[] = [];
  private seq = 0;
  private frameAt = 0;
  private inputClock = 0;
  private networkAt = 0;
  private networkJob?: Promise<void>;
  private retryAt = 0;
  private connected = false;
  private busy = false;
  private disposed = false;
  private lost = false;
  private yaw = 0;
  private pitch = 0.36;
  private zoom = 26;
  private stick = { x: 0, z: 0 };
  private heldJump = false;
  private heldBoost = false;
  private moveTarget?: T.Vector3;
  private autoPortal?: NexusPortal;
  private ray = new T.Raycaster();
  private floor = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private labels: { portal: typeof NEXUS_PORTALS[number]; element: HTMLElement }[] = [];
  private lastStats = "";
  private lastWorld = "";
  private cameraReady = false;
  private sun = new T.DirectionalLight(0xf3e8d7, 3.1);
  private quality: GraphicsQuality = graphicsQuality();
  private bannerTimeout = 0;
  private offset = 0;
  private preview?: Pick<NexusActor, "color" | "outfit">;

  constructor(private store: Persistence, private telegram: Telegram, private openColony: () => void) {
    this.api = new NexusTransport(store.local, telegram.initData, store.name);
    this.actor = spawnNexus(freshNexusProfile(store.name), "loading", "hub", Date.now());
    this.own = this.world.avatar(this.actor);
    this.root.className = "nexus-app";
    this.renderer.domElement.className = "nexus-canvas";
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.environment = studioEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.65;
    this.scene.background = new T.Color(0x0c172b);
    this.scene.fog = new T.Fog(0x101d33, 55, 180);
    this.scene.add(new T.HemisphereLight(0xc0e4ff, 0x364057, 2));
    this.sun.position.set(16, 38, 12); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 100 });
    this.sun.shadow.normalBias = 0.045; this.scene.add(this.sun, this.sun.target, this.world.root, this.own.root);
    this.world.build("hub"); this.own.root.position.set(this.actor.x, 0, this.actor.z);
    this.ui.className = "nexus-ui";
    this.buildUI(); this.root.append(this.renderer.domElement, this.ui);
    document.querySelector("#app")!.replaceChildren(this.root);
    this.bind(); this.applyQuality(); this.resize(); this.renderer.setAnimationLoop(this.frame);
    void this.connect();
    if (new URLSearchParams(location.search).has("debug")) Object.defineProperty(window, "__nexus", {
      configurable: true, value: { snapshot: () => ({ state: structuredClone(this.snapshot), predicted: { ...this.actor }, pending: this.pending.length, triangles: this.renderer.info.render.triangles }),
        project: (x: number, z: number, y = 0) => this.project(new T.Vector3(x, y, z)),
      },
    });
  }
  private el<TElement extends HTMLElement = HTMLElement>(selector: string) { return this.ui.querySelector<TElement>(selector)!; }
  private buildUI() {
    this.ui.innerHTML = `
      <header class="nx-header"><div class="nx-brand"><span class="nx-mark">${hudIcon("galaxy")}</span><div><b>NEXUS<span> / LITTLE PLANETS</span></b><small>МИРЫ БЕЗ ГРАНИЦ <i>v${version}</i></small></div></div><div class="nx-header-actions"><span class="nx-online"><i></i><span id="nx-online">Подключение</span></span><button id="nx-wardrobe" aria-label="Настроить аватар">${hudIcon("profile")}<span>Аватар</span></button><button id="nx-quality" aria-label="Качество графики">${hudIcon("settings")}</button></div></header>
      <section class="nx-intro"><span class="nx-eyebrow" id="nx-sector">ОБЩИЙ ХАБ / СЕКТОР 01</span><h1 id="nx-title">За пределами<br><em>одного мира.</em></h1><p id="nx-subtitle">Выбери портал. Найди свой мир.</p></section>
      <aside class="nx-directory" id="nx-directory"><div class="nx-directory-heading"><span>КУДА ОТПРАВИМСЯ?</span><small>03 МИРА</small></div>${NEXUS_PORTALS.map((p, i) => `<button class="nx-world-card" data-portal="${p.id}" style="--world:#${p.color.toString(16)}"><span class="nx-card-number">0${i + 1}</span><div><small>${p.tag}</small><h2>${p.name}</h2><p>${p.description}</p></div><span class="nx-card-arrow">↗</span></button>`).join("")}<div class="nx-signal"><i></i>Оригинальная вселенная Little Planets</div></aside>
      <section class="nx-mission" id="nx-mission" hidden><div><span class="nx-eyebrow" id="nx-mission-kind"></span><h2 id="nx-mission-title"></h2><p id="nx-mission-help"></p></div><strong id="nx-timer">00.00</strong><div class="nx-track"><i id="nx-track-fill"></i></div></section>
      <div class="nx-labels" aria-hidden="true"></div>
      <div class="nx-countdown" id="nx-countdown" aria-live="polite"></div>
      <div class="nx-objective" id="nx-objective" hidden><b>◇</b><span></span></div>
      <div class="nx-banner" id="nx-banner" role="status"></div>
      <footer class="nx-footer"><button id="nx-worlds">${hudIcon("galaxy")}<span>Миры</span></button><button id="nx-wave">${hudIcon("profile")}<span>Привет</span></button><button id="nx-dance">${hudIcon("skills")}<span>Танец</span></button><div class="nx-wallet"><small>ПИЛОТ <b id="nx-level">01</b></small><span id="nx-credits">0 ◈</span></div><button id="nx-colony">${hudIcon("planet")}<span>Моя колония</span></button></footer>
      <div class="nx-controls"><div class="nx-stick" id="nx-stick" aria-label="Джойстик движения"><span></span></div><div class="nx-actions"><button id="nx-boost" aria-label="Ускорение">${hudIcon("ship")}<small>Быстрее</small></button><button id="nx-jump" aria-label="Прыжок">↑<small>Прыжок</small></button></div></div>
      <button class="nx-interact" id="nx-interact" hidden><span id="nx-interact-text">Войти в портал</span><kbd>E</kbd></button>
      <div class="nx-help"><kbd>WASD</kbd> движение <kbd>SPACE</kbd> прыжок <kbd>SHIFT</kbd> ускорение <span>· Потяни экран для обзора</span></div>
      <section class="nx-overlay" id="nx-overlay" hidden></section>`;
    for (const p of NEXUS_PORTALS) {
      const element = document.createElement("div"); element.className = "nx-portal-label";
      element.innerHTML = `<small>${p.tag}</small><b>${p.name}</b><span>ВХОД В МИР ↗</span>`;
      element.style.setProperty("--world", `#${p.color.toString(16)}`);
      this.el(".nx-labels").append(element); this.labels.push({ portal: p, element });
    }
  }
  private bind() {
    const signal = this.abort.signal;
    const button = (id: string, fn: () => void) => this.el(id).addEventListener("click", fn, { signal });
    button("#nx-colony", () => void this.enterColony());
    button("#nx-wardrobe", () => this.wardrobe());
    button("#nx-worlds", () => {
      if (this.actor.world !== "hub") void this.command({ type: "enter", world: "hub" });
      else this.el("#nx-directory").classList.toggle("nx-directory-open");
    });
    button("#nx-wave", () => void this.command({ type: "emote", emote: "wave" }));
    button("#nx-dance", () => void this.command({ type: "emote", emote: "dance" }));
    button("#nx-interact", () => { const p = nearestNexusPortal(this.actor); if (p) void this.enterPortal(p.id); });
    button("#nx-quality", () => {
      const values: GraphicsQuality[] = ["high", "balanced", "economy"];
      this.quality = values[(values.indexOf(this.quality) + 1) % values.length];
      localStorage.setItem("little-planets-quality", this.quality); this.applyQuality();
      this.banner(`Графика: ${{ high: "высокая", balanced: "сбалансированная", economy: "экономная" }[this.quality]}`);
    });
    this.ui.querySelectorAll<HTMLElement>("[data-portal]").forEach(b => b.addEventListener("click", () => this.seekPortal(b.dataset.portal as NexusPortal), { signal }));
    window.addEventListener("resize", () => this.resize(), { signal });
    window.addEventListener("keydown", e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || this.disposed) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE"].includes(e.code)) {
        e.preventDefault(); this.keys.add(e.code); this.moveTarget = undefined; this.autoPortal = undefined;
      }
      if (e.code === "KeyE" && !e.repeat) { const p = nearestNexusPortal(this.actor); if (this.actor.world === "hub" && p) void this.enterPortal(p.id); }
      if (e.code === "Escape") { if (!this.el("#nx-overlay").hidden) this.closeOverlay(); else if (this.actor.world !== "hub") void this.command({ type: "enter", world: "hub" }); }
    }, { signal });
    window.addEventListener("keyup", e => this.keys.delete(e.code), { signal });
    window.addEventListener("blur", () => this.clearInput(), { signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.clearInput(); else if (this.lost) void this.connect(); }, { signal });
    window.addEventListener("pagehide", () => this.dispose(), { signal, once: true });
    const stick = this.el("#nx-stick"), knob = stick.querySelector<HTMLElement>("span")!;
    let stickPointer: number | null = null;
    const move = (e: PointerEvent) => {
      const b = stick.getBoundingClientRect(), r = b.width * 0.34, x = e.clientX - b.x - b.width / 2, z = e.clientY - b.y - b.height / 2, n = Math.max(1, Math.hypot(x, z) / r);
      this.stick = { x: x / n / r, z: z / n / r }; knob.style.transform = `translate(${x / n}px,${z / n}px)`; this.moveTarget = undefined; this.autoPortal = undefined;
    };
    stick.addEventListener("pointerdown", e => { if (stickPointer !== null) return; stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); move(e); }, { signal });
    stick.addEventListener("pointermove", e => { if (stickPointer === e.pointerId) move(e); }, { signal });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) stick.addEventListener(event, () => { stickPointer = null; this.stick = { x: 0, z: 0 }; knob.style.transform = ""; }, { signal });
    for (const [id, key] of [["#nx-jump", "heldJump"], ["#nx-boost", "heldBoost"]] as const) {
      const b = this.el(id);
      b.addEventListener("pointerdown", e => { b.setPointerCapture(e.pointerId); this[key] = true; b.classList.add("nx-held"); }, { signal });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(event, () => { this[key] = false; b.classList.remove("nx-held"); }, { signal });
    }
    const canvas = this.renderer.domElement;
    let pointer: { id: number; x: number; y: number; lastX: number; lastY: number; dragged: boolean } | undefined;
    canvas.addEventListener("pointerdown", e => { if (pointer) return; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, dragged: false }; canvas.setPointerCapture(e.pointerId); }, { signal });
    canvas.addEventListener("pointermove", e => {
      if (pointer?.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 6) pointer.dragged = true;
      if (pointer.dragged) { this.yaw -= (e.clientX - pointer.lastX) * 0.006; this.pitch = T.MathUtils.clamp(this.pitch + (e.clientY - pointer.lastY) * 0.004, 0.22, 1.2); }
      pointer.lastX = e.clientX; pointer.lastY = e.clientY;
    }, { signal });
    canvas.addEventListener("pointerup", e => {
      if (pointer?.id !== e.pointerId) return;
      if (!pointer.dragged && this.el("#nx-overlay").hidden) {
        this.ray.setFromCamera(new T.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), this.camera);
        const hit = this.ray.intersectObjects(this.world.pickables, true)[0];
        let object: T.Object3D | null = hit?.object ?? null;
        while (object && !object.userData.portal) object = object.parent;
        if (this.actor.world === "hub" && object?.userData.portal) this.seekPortal(object.userData.portal);
        else { const at = new T.Vector3(); if (this.ray.ray.intersectPlane(this.floor, at)) { this.moveTarget = at; this.autoPortal = undefined; } }
      }
      pointer = undefined;
    }, { signal });
    canvas.addEventListener("pointercancel", () => { pointer = undefined; }, { signal });
    canvas.addEventListener("wheel", e => { e.preventDefault(); this.zoom = T.MathUtils.clamp(this.zoom + e.deltaY * 0.015, 7, 30); }, { passive: false, signal });
  }
  private clearInput() { this.keys.clear(); this.stick = { x: 0, z: 0 }; this.heldJump = this.heldBoost = false; this.moveTarget = undefined; this.autoPortal = undefined; }
  private async connect() {
    if (this.busy || this.disposed) return;
    this.busy = true; this.connected = false;
    try {
      await this.networkJob;
      const snapshot = await this.api.join();
      if (this.disposed) return;
      this.pending = []; this.accept(snapshot); this.connected = true; this.lost = false;
      this.banner(this.store.local ? "Локальный режим · ваш прогресс сохраняется в браузере" : "Соединение установлено. Добро пожаловать в NEXUS.");
    } catch (e) { this.banner((e as Error).message); this.lost = true; this.retryAt = performance.now() + 5000; }
    finally { this.busy = false; }
  }
  private accept(snapshot: NexusSnapshot) {
    if (this.disposed) return;
    const changed = snapshot.self.world !== this.lastWorld;
    this.snapshot = snapshot; this.offset = snapshot.serverTime - Date.now();
    this.pending = this.pending.filter(f => f.seq > snapshot.self.seq);
    this.seq = Math.max(this.seq, snapshot.self.seq);
    this.actor = { ...snapshot.self };
    for (const input of this.pending) stepNexus(this.actor, input, this.now());
    if (changed) {
      this.yaw = this.actor.world === "race" ? Math.PI / 2 : 0;
      this.zoom = this.actor.world === "hub" ? 26 : this.actor.world === "race" ? 18 : 21;
      this.pitch = this.actor.world === "hub" ? 0.36 : 0.6;
      this.lastWorld = this.actor.world; this.world.build(this.actor.world); this.cameraReady = false; this.clearInput(); this.closeOverlay();
      for (const p of this.peers.values()) { p.avatar.root.removeFromParent(); p.label.remove(); } this.peers.clear();
      this.root.dataset.world = this.actor.world;
      const hub = this.actor.world === "hub";
      this.el("#nx-directory").hidden = !hub; this.el("#nx-mission").hidden = hub;
      this.el(".nx-intro").hidden = !hub;
      this.el("#nx-jump").hidden = this.actor.world === "race";
      this.labels.forEach(p => p.element.hidden = !hub);
    }
    const visiblePeers = snapshot.peers.slice(0, this.quality === "high" ? 24 : this.quality === "economy" ? 4 : 8);
    const ids = new Set(visiblePeers.map(p => p.id));
    for (const [id, peer] of this.peers) if (!ids.has(id)) { peer.avatar.root.removeFromParent(); peer.label.remove(); this.peers.delete(id); }
    for (const actor of visiblePeers) {
      let peer = this.peers.get(actor.id);
      if (!peer) {
        const avatar = this.world.avatar(actor), label = document.createElement("span"); label.className = "nx-player-label";
        avatar.root.position.set(actor.x, actor.y, actor.z); this.scene.add(avatar.root); this.el(".nx-labels").append(label);
        peer = { avatar, label, actor }; this.peers.set(actor.id, peer);
      }
      peer.actor = actor; peer.label.textContent = actor.name;
    }
    this.el("#nx-online").textContent = this.store.local ? "ЛОКАЛЬНЫЙ МИР" : `${snapshot.online} ${snapshot.online === 1 ? "игрок" : "игроков"} в мире`;
    this.el("#nx-level").textContent = String(nexusLevel(snapshot.profile.xp)).padStart(2, "0");
    this.el("#nx-credits").textContent = `${snapshot.profile.credits} ◈`;
    this.own.rebuild(this.actor);
    if (snapshot.self.finishedAt !== null && this.el("#nx-overlay").hidden) this.results();
  }
  private now() { return Date.now() + this.offset; }
  private async sync() {
    if (this.networkJob || this.busy || !this.connected || this.disposed || !this.pending.length) return;
    const frames = this.pending.slice(0, 30);
    this.networkJob = (async () => {
      try { const state = await this.api.input(frames); this.accept(state); this.lost = false; }
      catch (e) {
        this.lost = true; this.el("#nx-online").textContent = "ПЕРЕПОДКЛЮЧЕНИЕ";
        if ((e as { status?: number }).status === 409 || (e as { status?: number }).status === 401) { this.connected = false; this.retryAt = performance.now() + 5000; this.banner((e as Error).message); }
      }
    })().finally(() => { this.networkJob = undefined; });
    await this.networkJob;
  }
  private async command(command: NexusCommand) {
    if (this.busy || !this.connected || this.disposed) return false;
    this.busy = true; this.clearInput();
    try {
      await this.networkJob;
      if (this.pending.length) this.accept(await this.api.input(this.pending.slice(0, 30)));
      const snapshot = await this.api.command(command);
      this.pending = []; this.seq = snapshot.self.seq; this.accept(snapshot);
      return true;
    } catch (e) { this.banner((e as Error).message); return false; }
    finally { this.busy = false; }
  }
  private seekPortal(id: NexusPortal) {
    if (this.actor.world !== "hub" || !this.el("#nx-overlay").hidden) return;
    const p = NEXUS_PORTALS.find(p => p.id === id)!;
    this.moveTarget = new T.Vector3(p.x, 0, p.z + 1.5); this.autoPortal = id;
    this.el("#nx-directory").classList.remove("nx-directory-open");
    this.banner(`Идём к порталу «${p.name}». WASD или джойстик отменяют маршрут.`);
  }
  private async enterPortal(id: NexusPortal) {
    if (this.busy) return;
    if (id === "colony") { await this.enterColony(); return; }
    this.root.classList.add("nx-transition");
    await this.command({ type: "enter", world: id });
    if (!this.disposed) window.setTimeout(() => this.root.classList.remove("nx-transition"), 250);
  }
  private async enterColony() {
    if (this.busy || this.disposed) return;
    this.busy = true; this.clearInput();
    await this.networkJob;
    if (!this.disposed) this.openColony();
  }
  private wardrobe() {
    if (!this.snapshot || this.busy) return;
    this.clearInput(); const p = this.snapshot.profile, overlay = this.el("#nx-overlay");
    this.root.classList.add("nx-customizing");
    this.cameraReady = false;
    this.preview = { color: p.color, outfit: p.outfit };
    overlay.hidden = false;
    overlay.innerHTML = `<form class="nx-sheet nx-wardrobe"><button type="button" class="nx-close" aria-label="Закрыть">×</button><span class="nx-eyebrow">ВАША ЦИФРОВАЯ ЛИЧНОСТЬ</span><h2>Новый мир.<br>Твой характер.</h2><label class="nx-field">ПОЗЫВНОЙ<input id="nx-name" maxlength="24" value="${safe(p.name)}" autocomplete="nickname"></label><fieldset class="nx-palette"><legend>ЦВЕТ КОСТЮМА</legend>${Object.entries(NEXUS_COLORS).map(([id, c]) => `<label title="${id}" style="--swatch:#${c.toString(16).padStart(6, "0")}"><input type="radio" name="color" value="${id}" ${id === p.color ? "checked" : ""}><span></span></label>`).join("")}</fieldset><fieldset class="nx-outfits"><legend>ЭКИПИРОВКА</legend>${Object.entries(NEXUS_OUTFITS).map(([id, outfit]) => `<label><input type="radio" name="outfit" value="${id}" ${id === p.outfit ? "checked" : ""}><span><b>${outfit.name}</b><small>${p.unlocked.includes(id as typeof p.outfit) ? "В ГАРДЕРОБЕ" : `${outfit.cost} ◈`}</small></span></label>`).join("")}</fieldset><p class="nx-sheet-note">Кредиты выдаются за завершённые гонки и экспедиции. Цвет и позывной меняются бесплатно.</p><button type="submit" class="nx-primary">Сохранить аватар ↗</button><p class="nx-profile-summary">${p.xp} XP · ${p.credits} ◈ · Гонок: ${p.races} · Экспедиций: ${p.expeditions}</p></form>`;
    overlay.querySelector(".nx-close")!.addEventListener("click", () => this.closeOverlay(), { once: true });
    const form = overlay.querySelector("form")!;
    form.addEventListener("change", () => {
      const data = new FormData(form);
      this.preview = { color: data.get("color") as NexusActor["color"], outfit: data.get("outfit") as NexusActor["outfit"] };
      this.own.rebuild({ ...this.actor, ...this.preview });
    });
    form.addEventListener("submit", e => {
      e.preventDefault(); const data = new FormData(form);
      void this.command({ type: "customize", name: String(data.get("nickname") || this.el<HTMLInputElement>("#nx-name").value), color: data.get("color") as NexusActor["color"], outfit: data.get("outfit") as NexusActor["outfit"] })
        .then(ok => { if (ok && !this.disposed) { this.closeOverlay(); this.banner("Аватар сохранён."); } });
    });
  }
  private closeOverlay() { this.preview = undefined; this.cameraReady = false; this.root.classList.remove("nx-customizing"); this.el("#nx-overlay").hidden = true; this.own.rebuild(this.actor); }
  private results() {
    const state = this.snapshot!, race = state.self.world === "race", overlay = this.el("#nx-overlay");
    this.clearInput(); overlay.hidden = false;
    overlay.innerHTML = `<section class="nx-sheet nx-results"><span class="nx-eyebrow">${race ? "ВЕКТОР / ФИНИШ" : "АРХИВ ВОССТАНОВЛЕН"}</span><div class="nx-victory">${race ? "12 / 12" : "05 / 05"}</div><h2>${race ? "За гранью скорости." : "Осколки стали историей."}</h2><p>${race ? `Время: ${timeLabel(state.self.finishedAt! - state.self.startedAt)}<br>Личный рекорд: ${timeLabel(state.profile.bestRace!)}` : "Все реликвии доставлены в центральный архив."}</p><div class="nx-rewards"><b>+${race ? 60 : 80} ◈</b><b>+${race ? 80 : 100} XP</b><span>УРОВЕНЬ ${nexusLevel(state.profile.xp)}</span></div><div class="nx-result-actions"><button class="nx-primary" id="nx-again">Ещё попытка ↗</button><button id="nx-back-hub">Вернуться в хаб</button></div>${race ? `<div class="nx-leaderboard"><small>ЛУЧШИЕ ПИЛОТЫ</small>${state.leaderboard.map((p, i) => `<div><span>0${i + 1} ${safe(p.name)}</span><b>${timeLabel(p.bestRace)}</b></div>`).join("")}</div>` : ""}</section>`;
    this.el("#nx-again").onclick = () => void this.command({ type: "restart" }).then(ok => { if (ok) this.closeOverlay(); });
    this.el("#nx-back-hub").onclick = () => void this.command({ type: "enter", world: "hub" });
  }
  private banner(text: string) { if (this.disposed) return; this.el("#nx-banner").textContent = text; this.el("#nx-banner").classList.add("nx-show"); clearTimeout(this.bannerTimeout); this.bannerTimeout = window.setTimeout(() => this.el("#nx-banner")?.classList.remove("nx-show"), 4500); }
  private project(p: T.Vector3) { const q = p.clone().project(this.camera); return { x: (q.x * 0.5 + 0.5) * innerWidth, y: (-q.y * 0.5 + 0.5) * innerHeight, visible: q.z < 1 && q.z > -1 && Math.abs(q.x) < 1.1 && Math.abs(q.y) < 1.1 }; }
  private applyQuality() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality === "high" ? 1.5 : this.quality === "economy" ? 0.8 : 1));
    this.renderer.shadowMap.enabled = this.quality !== "economy"; this.resize();
  }
  private resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }
  private frame = (time: number) => {
    if (this.disposed) return;
    if (this.quality !== "high" && time - this.frameAt < 32) return;
    const dt = this.frameAt ? Math.min(0.05, (time - this.frameAt) / 1000) : 0;
    this.frameAt = time;
    if (document.hidden) { this.inputClock = 0; return; }
    if (this.lost && !this.connected && time > this.retryAt && !this.busy) void this.connect();
    this.inputClock += dt;
    if (this.connected && !this.busy && this.inputClock >= 1 / 30) {
      const step = Math.min(this.inputClock, 0.1); this.inputClock = 0;
      let x = this.stick.x + Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
      let z = this.stick.z + Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
      const ox = x; x = ox * Math.cos(this.yaw) + z * Math.sin(this.yaw); z = -ox * Math.sin(this.yaw) + z * Math.cos(this.yaw);
      if (!this.el("#nx-overlay").hidden) x = z = 0;
      if (this.moveTarget && this.el("#nx-overlay").hidden) {
        x = this.moveTarget.x - this.actor.x; z = this.moveTarget.z - this.actor.z;
        const n = Math.hypot(x, z); x /= Math.max(1, n); z /= Math.max(1, n);
        if (n < (this.autoPortal ? 2.3 : 0.35)) {
          const portal = this.autoPortal; this.moveTarget = undefined; this.autoPortal = undefined; x = z = 0;
          if (portal) void this.enterPortal(portal);
        }
      }
      const n = Math.max(1, Math.hypot(x, z));
      const input: NexusInput = { seq: ++this.seq, dt: step, x: x / n, z: z / n, jump: this.el("#nx-overlay").hidden && (this.keys.has("Space") || this.heldJump), sprint: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.heldBoost };
      if (this.pending.length < 30 && !this.lost) { stepNexus(this.actor, input, this.now()); this.pending.push(input); }
    }
    if (time - this.networkAt > 200) { this.networkAt = time; void this.sync(); }
    const blend = 1 - Math.exp(-13 * dt);
    this.own.root.position.lerp(new T.Vector3(this.actor.x, this.actor.y, this.actor.z), blend);
    if (this.preview) this.own.root.rotation.y = this.yaw;
    else this.own.root.rotation.y += Math.atan2(Math.sin(this.actor.yaw - this.own.root.rotation.y), Math.cos(this.actor.yaw - this.own.root.rotation.y)) * blend;
    this.own.animate({ ...this.actor, ...this.preview }, time / 1000);
    for (const peer of this.peers.values()) {
      peer.avatar.root.position.lerp(new T.Vector3(peer.actor.x, peer.actor.y, peer.actor.z), 1 - Math.exp(-8 * dt));
      peer.avatar.root.rotation.y += Math.atan2(Math.sin(peer.actor.yaw - peer.avatar.root.rotation.y), Math.cos(peer.actor.yaw - peer.avatar.root.rotation.y)) * blend;
      peer.avatar.animate(peer.actor, time / 1000);
    }
    const target = this.own.root.position.clone(), portrait = innerWidth < innerHeight;
    target.y = Math.max(-1, target.y) + 1.4;
    if (this.preview) {
      target.y = this.actor.y + (portrait ? -0.8 : 0.95);
      if (!portrait) target.add(new T.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(1.5));
    } else if (this.actor.world === "hub") target.add(new T.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(6));
    const distance = this.preview ? (portrait ? 9 : 6.5) : this.zoom * (portrait ? 1.35 : 1), pitch = this.preview ? (portrait ? 0.4 : 0.2) : this.pitch;
    const camera = target.clone().add(new T.Vector3(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch)).multiplyScalar(distance));
    this.camera.position.lerp(camera, this.cameraReady ? 1 - Math.exp(-5 * dt) : 1); this.camera.lookAt(target); this.cameraReady = true;
    this.world.update(this.actor, time / 1000);
    this.camera.updateMatrixWorld();
    for (const label of this.labels) {
      const p = this.project(new T.Vector3(label.portal.x, 6.7, label.portal.z));
      label.element.hidden = this.actor.world !== "hub" || !p.visible;
      label.element.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    }
    for (const peer of this.peers.values()) { const p = this.project(peer.avatar.root.position.clone().add(new T.Vector3(0, 2.4, 0))); peer.label.hidden = !p.visible; peer.label.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`; }
    const portal = this.actor.world === "hub" ? nearestNexusPortal(this.actor) : undefined;
    this.el("#nx-interact").hidden = !portal || !this.el("#nx-overlay").hidden;
    if (portal) this.el("#nx-interact-text").textContent = `Войти: ${portal.name}`;
    if (this.actor.world !== "hub") {
      const race = this.actor.world === "race", count = race ? this.actor.checkpoint : RELICS.filter((_, i) => this.actor.collected & (1 << i)).length;
      const signature = `${race}:${count}:${this.actor.falls}`;
      if (signature !== this.lastStats) {
        this.lastStats = signature;
        this.el("#nx-mission-kind").textContent = race ? "ВЕКТОР / ГОНКА НА ХОВЕРБОРДЕ" : "АРХИВ НЕБА / ЭКСПЕДИЦИЯ";
        this.el("#nx-mission-title").textContent = race ? `Ворота ${count} / 12` : `Осколки ${count} / 5`;
        this.el("#nx-mission-help").textContent = race ? "Следующие ворота подсвечены янтарным. Удерживайте ускорение на прямых." : count === 5 ? "Вернитесь к золотому кольцу на центральном острове." : "Перепрыгивайте разрывы между островами и касайтесь светящихся осколков.";
        this.el("#nx-track-fill").style.width = `${count / (race ? 12 : 5) * 100}%`;
      }
      const left = this.actor.startedAt - this.now();
      this.el("#nx-countdown").textContent = left > 0 ? String(Math.ceil(left / 1000)) : "";
      this.el("#nx-timer").textContent = timeLabel((this.actor.finishedAt ?? this.now()) - this.actor.startedAt);
      let goal = race ? RACE_GATES[Math.min(this.actor.checkpoint, 11)] : { x: 0, z: 0 };
      if (!race && this.actor.collected !== 31) goal = RELICS.filter((_, i) => !(this.actor.collected & (1 << i))).sort((a, b) => Math.hypot(a.x - this.actor.x, a.z - this.actor.z) - Math.hypot(b.x - this.actor.x, b.z - this.actor.z))[0];
      const point = this.project(new T.Vector3(goal.x, 3, goal.z)), marker = this.el("#nx-objective");
      marker.hidden = this.actor.finishedAt !== null;
      marker.style.transform = `translate(${T.MathUtils.clamp(point.x, 70, innerWidth - 70)}px,${T.MathUtils.clamp(point.y, 110, innerHeight - 190)}px) translate(-50%,-50%)`;
      marker.querySelector("span")!.textContent = `${race ? `ВОРОТА ${Math.min(12, this.actor.checkpoint + 1)}` : this.actor.collected === 31 ? "АРХИВ" : "ОСКОЛОК"} · ${Math.round(Math.hypot(goal.x - this.actor.x, goal.z - this.actor.z))} м`;
    } else { this.el("#nx-countdown").textContent = ""; this.el("#nx-objective").hidden = true; }
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.clearInput(); clearTimeout(this.bannerTimeout);
    this.api.leave(); this.renderer.setAnimationLoop(null); this.world.dispose(); this.environment.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.root.remove();
    if (new URLSearchParams(location.search).has("debug")) delete (window as unknown as { __nexus?: unknown }).__nexus;
  }
}
