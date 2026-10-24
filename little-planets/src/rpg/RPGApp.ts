import { Telegram } from "../platform/Telegram";
import {
  CLASSES,
  RARITIES,
  RPG,
  SAVE_KEY,
  TILE,
  decodeSave,
  stats,
  type HeroClass,
  type Item,
} from "./model";
import { DungeonView, itemURL, sprite } from "./art";
import { icon } from "./icons";
import "./rpg.css";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const slots = {
  weapon: "Оружие",
  armor: "Броня",
  ring: "Кольцо",
  boots: "Сапоги",
};
const zoneNames = ["Забытые шахты", "Крипта угасших", "Сердце глубин"];
export class RPGApp {
  readonly game: RPG;
  readonly view: DungeonView;
  private root: HTMLElement;
  private keys = new Set<string>();
  private selected: string;
  private tab = "bag";
  private modal = "";
  private drawer = false;
  private sound = false;
  private audio?: AudioContext;
  private lastTime = performance.now();
  private lastHud = 0;
  private lastPersist = 0;
  private raf = 0;
  private disposed = false;
  private joystick = { x: 0, y: 0 };
  private joyId: number | null = null;
  private attackPointer: number | null = null;
  private path: { x: number; y: number }[] = [];
  private clickAction: "interact" | "attack" | "" = "";
  private log: { message: string; kind: string; time: string }[] = [];
  private lastDeath = false;
  constructor(private telegram: Telegram) {
    if (telegram.initData) {
      telegram.app?.setHeaderColor?.("#211d24");
      telegram.app?.setBackgroundColor?.("#211d24");
    }
    this.root = document.querySelector("#app")!;
    let raw: string | null = null;
    let storageBroken = false;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      storageBroken = true;
    }
    const save = raw ? decodeSave(raw) : null;
    this.game = new RPG(save ?? undefined);
    this.selected = this.game.save.inventory[0]?.id ?? "";
    this.root.innerHTML = this.shell();
    this.view = new DungeonView(
      this.el<HTMLCanvasElement>("#dungeon"),
      this.game,
    );
    this.game.onEvent = (message, kind = "info") => {
      if (kind === "open") {
        this.openModal(message);
        return;
      }
      this.notice(message, kind);
      if (["epic", "legendary", "level", "skill", "rare"].includes(kind))
        this.tone(kind === "level" ? 660 : 440);
    };
    this.game.onChange = () => {
      this.renderPanel();
      this.renderHud();
    };
    this.bind();
    this.renderPanel();
    this.renderHud();
    this.notice(
      "Морвину нужна помощь. Исследуйте шахту и найдите источник проклятия.",
      "quest",
    );
    if (storageBroken)
      this.notice(
        "Браузер запретил сохранение. Разрешите локальное хранилище.",
        "error",
      );
    if (raw && !save) {
      try {
        localStorage.setItem(`${SAVE_KEY}.unreadable-backup`, raw);
      } catch {}
      this.notice(
        "Предыдущее сохранение повреждено. Его копия оставлена в хранилище.",
        "error",
      );
    }
    this.raf = requestAnimationFrame(this.frame);
    (window as Window & { emberfall?: RPGApp }).emberfall = this;
  }
  private el<T extends HTMLElement>(selector: string) {
    return this.root.querySelector<T>(selector)!;
  }
  private shell() {
    const s = this.game.save;
    return `
    <div class="ef-app">
      <header class="ef-header">
        <a class="ef-brand" href="#" aria-label="Emberfall — приключение"><span class="ef-brand-seal">${icon("flame")}</span><span>EMBERFALL<small>ПЕПЕЛ И ЗОЛОТО</small></span></a>
        <nav class="ef-navigation" aria-label="Главное меню"><button class="active" data-action="adventure">${icon("sword")}<span>Приключение</span></button><button data-action="character">${icon("shield")}<span>Персонаж</span></button><button data-action="atlas">${icon("map")}<span>Атлас</span></button></nav>
        <div class="ef-header-right"><span class="ef-online"><i></i> ОДИНОЧНАЯ RPG</span><span class="ef-wallet">${icon("coin")}<b id="gold">${fmt(s.gold)}</b></span><button class="ef-icon-button" data-action="sound" aria-label="Включить звук" title="Включить звук">${icon("mute")}</button><button class="ef-icon-button" data-action="settings" aria-label="Настройки">${icon("settings")}</button></div>
      </header>
      <main class="ef-layout">
        <section class="ef-stage" aria-label="Подземелье">
          <canvas id="dungeon" aria-label="Игровое поле. WASD — движение, пробел — атака, E — взаимодействие." tabindex="0"></canvas>
          <div class="ef-world-top">
            <div class="ef-hero-hud"><div class="ef-portrait"><img src="${sprite("hero", 0, s.heroClass).toDataURL()}" alt="Герой"/><b id="hero-level">${s.level}</b></div><div class="ef-hero-bars"><div class="ef-hero-name"><b>${escape(s.name)}</b><span id="hero-class">${CLASSES[s.heroClass].name}</span></div><div class="ef-bar hp"><i id="hp-bar"></i><span id="hp-text"></span>${icon("heart")}</div><div class="ef-bar mana"><i id="mana-bar"></i><span id="mana-text"></span>${icon("bolt")}</div><div class="ef-xp"><i id="xp-bar"></i></div></div></div>
            <div class="ef-zone-title"><span>ГЛАВА I · ПОД ЗЕМЛЁЙ</span><h1 id="zone-name">${zoneNames[s.floor - 1]}</h1><p><i></i> Территория проклятых <em>Этаж <b id="floor">${s.floor}</b> / 3</em></p></div>
            <button class="ef-depth" data-action="atlas" aria-label="Открыть карту глубин">${icon("map")}<span>КАРТА<br><b>M</b></span></button>
          </div>
          <button class="ef-quest-tracker" data-action="quests"><span class="ef-quest-symbol">!</span><span><small>ТЕКУЩЕЕ ЗАДАНИЕ</small><b id="quest-title">Тишина в шахте</b><span id="quest-progress">Победите обитателей шахты · 0 / 6</span></span>${icon("chevron")}</button>
          <div class="ef-world-caption"><span>THE FORGOTTEN MINES</span><i></i><small>Глубже — значит опаснее</small></div>
          <div class="ef-toast" id="toast" role="status" aria-live="polite"></div>
          <div class="ef-journal"><div><span class="ef-label">${icon("scroll")} ЖУРНАЛ ПУТЕШЕСТВИЯ</span><span class="ef-journal-dot"></span></div><div id="journal-lines"></div></div>
          <div class="ef-touch-move" id="joystick" aria-label="Джойстик движения"><div id="joy-knob"></div><span>ДВИЖЕНИЕ</span></div>
          <div class="ef-bottom-hud"><div class="ef-action-bar">
            <button class="ef-action primary" data-action="attack" aria-label="Атаковать"><span class="ef-key">SPACE</span>${icon("sword")}<span class="ef-action-name">Атака</span></button>
            <button class="ef-action skill" data-action="skill" aria-label="Применить способность"><span class="ef-key">Q</span>${icon("flame")}<span class="ef-action-name">Навык</span><span class="ef-cooldown" id="skill-cd"></span></button>
            <button class="ef-action" data-action="dash" aria-label="Рывок"><span class="ef-key">SHIFT</span>${icon("bolt")}<span class="ef-action-name">Рывок</span><span class="ef-cooldown" id="dash-cd"></span></button>
            <span class="ef-action-divider"></span>
            <button class="ef-action potion" data-action="potion" aria-label="Выпить зелье"><span class="ef-key">R</span>${icon("potion")}<b id="potion-count">3</b><span class="ef-action-name">Зелье</span></button>
            <button class="ef-action interact" data-action="interact" aria-label="Взаимодействовать"><span class="ef-key">E</span>${icon("hand")}<span class="ef-action-name" id="interact-label">Действие</span></button>
            <button class="ef-action mobile-bag" data-action="bag" aria-label="Открыть рюкзак">${icon("bag")}<span class="ef-action-name">Рюкзак</span></button>
          </div><span class="ef-control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> движение <span>·</span> щелчок — идти / атаковать <span>·</span> <kbd>ESC</kbd> пауза</span></div>
          <div class="ef-stage-corner left"></div><div class="ef-stage-corner right"></div>
        </section>
        <aside class="ef-sidebar" aria-label="Персонаж и инвентарь"><div class="ef-sidebar-heading"><div><span class="ef-eyebrow">ВАША ИСТОРИЯ</span><h2>Путник пепла</h2></div><button class="ef-icon-button ef-drawer-close" data-action="close-drawer" aria-label="Закрыть рюкзак">${icon("close")}</button><span class="ef-level-badge" id="side-level">УР. ${s.level}</span></div>
          <div class="ef-loadout"><div class="ef-loadout-sprite"><span class="ef-rune-circle"></span><img id="loadout-hero" src="${sprite("hero", 0, s.heroClass).toDataURL()}" alt="${CLASSES[s.heroClass].name}"/></div><div class="ef-loadout-details"><span class="ef-label" id="class-title">${CLASSES[s.heroClass].title}</span><h3 id="loadout-class">${CLASSES[s.heroClass].name}</h3><p>${icon("sword")} <b id="power-score">0</b> <span>боевая мощь</span></p><button class="ef-text-button" data-action="classes">Сменить класс ${icon("chevron")}</button></div></div>
          <div class="ef-equipment" id="equipment"></div>
          <div class="ef-panel-tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="bag" class="active">${icon("bag")} Рюкзак <span id="bag-count">3</span></button><button role="tab" aria-selected="false" data-tab="stats">${icon("shield")} Навыки</button><button role="tab" aria-selected="false" data-tab="quests">${icon("scroll")} Задания</button></div>
          <div id="panel-content" class="ef-panel-content"></div>
          <div class="ef-sidebar-footer"><i></i><span id="save-status">Прогресс сохраняется автоматически</span>${icon("check")}</div>
        </aside>
      </main>
      <footer class="ef-footer"><span>EMBERFALL <i>✦</i> ПЕРВОЕ ПРИКЛЮЧЕНИЕ</span><span>Пиксельный мир. Настоящая история.</span><button data-action="help">Управление ${icon("chevron")}</button></footer>
      <div id="modal-root"></div>
    </div>`;
  }
  private bind() {
    this.root.addEventListener("click", this.click);
    this.root.addEventListener("pointerdown", this.attackDown);
    window.addEventListener("pointerup", this.attackUp);
    window.addEventListener("pointercancel", this.attackUp);
    window.addEventListener("lostpointercapture", this.attackUp);
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.blur);
    window.addEventListener("focus", this.focus);
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("pagehide", this.pagehide);
    this.el("#dungeon").addEventListener("pointerdown", this.worldClick);
    const joy = this.el("#joystick");
    joy.addEventListener("pointerdown", (e) => {
      this.joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      this.moveJoy(e);
    });
    joy.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.joyId) this.moveJoy(e);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      joy.addEventListener(type, () => {
        this.joyId = null;
        this.joystick = { x: 0, y: 0 };
        this.el("#joy-knob").style.transform = "";
      });
  }
  private attackDown = (e: PointerEvent) => {
    const button = (e.target as Element).closest<HTMLElement>(
      '[data-action="attack"]',
    );
    if (!button || e.button !== 0 || this.game.paused || this.game.dead) return;
    this.attackPointer = e.pointerId;
    button.setPointerCapture(e.pointerId);
    this.action("attack");
  };
  private attackUp = (e: PointerEvent) => {
    if (e.pointerId === this.attackPointer) this.attackPointer = null;
  };
  private moveJoy(e: PointerEvent) {
    const r = this.el("#joystick").getBoundingClientRect(),
      dx = e.clientX - r.left - r.width / 2,
      dy = e.clientY - r.top - r.height / 2,
      len = Math.hypot(dx, dy),
      radius = r.width * 0.31,
      factor = len > radius ? radius / len : 1;
    this.joystick = { x: (dx * factor) / radius, y: (dy * factor) / radius };
    this.el("#joy-knob").style.transform =
      `translate(${dx * factor}px,${dy * factor}px)`;
    this.path = [];
  }
  private click = (e: MouseEvent) => {
    const button = (e.target as Element).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    const { action, tab, item, equip, sell, claim, talent, cls } =
      button.dataset;
    if (tab) {
      this.tab = tab;
      this.renderPanel();
      return;
    }
    if (item) {
      this.selected = item;
      this.renderPanel();
      return;
    }
    if (equip) {
      this.game.equip(equip);
      return;
    }
    if (sell) {
      this.game.sell(sell);
      return;
    }
    if (claim) {
      this.game.claim(claim);
      return;
    }
    if (talent) {
      this.game.talent(talent as "power" | "vitality" | "spirit");
      return;
    }
    if (cls && Object.hasOwn(CLASSES, cls)) {
      this.game.changeClass(cls as HeroClass);
      this.el<HTMLImageElement>(".ef-portrait img").src = sprite(
        "hero",
        0,
        cls as HeroClass,
      ).toDataURL();
      this.closeModal();
      return;
    }
    this.action(action ?? "");
  };
  private action(action: string) {
    if (action === "attack") {
      if (this.game.attack()) this.tone(135, 0.04);
    } else if (action === "skill") this.game.skill();
    else if (action === "dash") this.game.dash();
    else if (action === "potion") this.game.potion();
    else if (action === "interact") this.game.interact();
    else if (action === "sound") {
      this.sound = !this.sound;
      const b = this.el('[data-action="sound"]');
      b.innerHTML = icon(this.sound ? "sound" : "mute");
      b.setAttribute(
        "aria-label",
        this.sound ? "Выключить звук" : "Включить звук",
      );
      if (this.sound) this.tone(330);
    } else if (action === "close-modal") this.closeModal();
    else if (action === "close-drawer" || action === "adventure") {
      this.drawer = false;
      this.el(".ef-sidebar").classList.remove("open");
      this.closeModal();
    } else if (
      action === "character" ||
      action === "bag" ||
      action === "quests"
    ) {
      this.tab = action === "quests" ? "quests" : "bag";
      this.renderPanel();
      if (matchMedia("(max-width: 900px)").matches) {
        this.drawer = true;
        this.game.paused = true;
        this.el(".ef-sidebar").classList.add("open");
      }
    } else if (action === "buy-potion") {
      this.game.buyPotion();
      this.openModal("merchant");
    } else if (action === "upgrade-weapon") {
      this.game.upgradeWeapon();
      this.openModal("merchant");
    } else if (action === "auto") {
      this.game.autoAttack = !this.game.autoAttack;
      this.notice(
        `Автоатака ${this.game.autoAttack ? "включена" : "выключена"}`,
      );
      this.openModal("settings");
    } else if (action === "revive") {
      this.game.revive();
      this.closeModal();
    } else if (action === "export") this.exportSave();
    else if (
      ["settings", "classes", "atlas", "help", "merchant"].includes(action)
    )
      this.openModal(action);
  }
  private keydown = (e: KeyboardEvent) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as Element).tagName))
      return;
    if (e.code === "Tab" && (this.modal || this.drawer)) {
      const container = this.modal
        ? this.el("#modal-root")
        : this.el(".ef-sidebar");
      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
      const first = buttons[0],
        last = buttons.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !container.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !container.contains(document.activeElement))
      ) {
        e.preventDefault();
        first?.focus();
      }
      return;
    }
    const key = e.code;
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)
    )
      e.preventDefault();
    this.keys.add(key);
    if (e.repeat) return;
    if (key === "Escape") {
      if (this.modal || this.drawer) this.action("adventure");
      else this.openModal("settings");
      return;
    }
    if (this.modal || this.drawer) return;
    if (key === "Space") this.action("attack");
    if (key === "KeyQ") this.game.skill();
    if (key === "ShiftLeft" || key === "ShiftRight") this.game.dash();
    if (key === "KeyR") this.game.potion();
    if (key === "KeyE" || key === "KeyF") this.game.interact();
    if (key === "KeyI" || key === "Tab") {
      e.preventDefault();
      this.action("bag");
    }
    if (key === "KeyJ") this.action("quests");
    if (key === "KeyM") this.openModal("atlas");
  };
  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private blur = () => {
    this.keys.clear();
    this.attackPointer = null;
    this.joystick = { x: 0, y: 0 };
    this.path = [];
    this.game.paused = true;
    this.game.persist();
  };
  private focus = () => {
    this.game.paused = document.hidden || !!this.modal || this.drawer;
    this.lastTime = performance.now();
  };
  private pagehide = () => this.game.persist();
  private visibility = () => {
    if (document.hidden) this.blur();
    this.lastTime = performance.now();
    this.game.paused = document.hidden || !!this.modal || this.drawer;
  };
  private worldClick = (e: PointerEvent) => {
    if (this.game.paused || this.game.dead || e.button !== 0) return;
    const point = this.view.worldAt(e.clientX, e.clientY),
      enemy = this.game.dungeon.enemies.find(
        (v) => !v.dead && Math.hypot(v.x - point.x, v.y - point.y) < 27,
      ),
      prop = this.game.dungeon.props.find(
        (p) =>
          ["chest", "merchant", "stairs", "crystal"].includes(p.type) &&
          Math.hypot(p.x - point.x, p.y - 10 - point.y) < 27,
      );
    const target = enemy ?? prop ?? point;
    this.clickAction = enemy ? "attack" : prop ? "interact" : "";
    this.path = this.findPath(target.x, target.y);
    if (this.path.length === 0) {
      if (
        enemy &&
        Math.hypot(enemy.x - this.game.save.x, enemy.y - this.game.save.y) < 200
      )
        this.game.attack();
      if (prop) this.game.interact();
    }
    this.el("#dungeon").focus({ preventScroll: true });
  };
  private findPath(x: number, y: number) {
    const d = this.game.dungeon,
      sx = Math.floor(this.game.save.x / TILE),
      sy = Math.floor(this.game.save.y / TILE),
      ex = Math.floor(x / TILE),
      ey = Math.floor(y / TILE);
    if (!d.tile(ex, ey) || (sx === ex && sy === ey)) return [];
    const start = sy * d.width + sx,
      goal = ey * d.width + ex,
      queue = [start],
      prev = new Map<number, number>();
    prev.set(start, -1);
    for (let i = 0; i < queue.length && !prev.has(goal); i++) {
      const n = queue[i],
        nx = n % d.width,
        ny = Math.floor(n / d.width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = nx + dx,
          yy = ny + dy,
          key = yy * d.width + xx;
        if (d.tile(xx, yy) && !prev.has(key)) {
          prev.set(key, n);
          queue.push(key);
        }
      }
    }
    if (!prev.has(goal)) return [];
    const path: { x: number; y: number }[] = [];
    for (let n = goal; n !== start; n = prev.get(n)!)
      path.push({
        x: ((n % d.width) + 0.5) * TILE,
        y: (Math.floor(n / d.width) + 0.5) * TILE,
      });
    return path.reverse();
  }
  private frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    let mx =
        Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
        Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft")) +
        this.joystick.x,
      my =
        Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) -
        Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) +
        this.joystick.y;
    if (mx || my) this.path = [];
    if (this.path.length && !this.game.paused) {
      const p = this.path[0],
        dx = p.x - this.game.save.x,
        dy = p.y - this.game.save.y,
        len = Math.hypot(dx, dy);
      if (len < 5) {
        this.path.shift();
        if (!this.path.length) {
          if (this.clickAction === "attack") this.game.attack();
          if (this.clickAction === "interact") this.game.interact();
          this.clickAction = "";
        }
      } else {
        mx = dx / len;
        my = dy / len;
      }
    }
    this.game.update(dt, mx, my);
    if (this.keys.has("Space") || this.attackPointer !== null)
      this.game.attack();
    this.view.render(dt);
    if (now - this.lastHud > 100) {
      this.renderHud();
      this.lastHud = now;
    }
    if (now - this.lastPersist > 5000) {
      this.game.persist();
      this.lastPersist = now;
    }
    if (this.game.dead && !this.lastDeath) this.openModal("death");
    this.lastDeath = this.game.dead;
    this.raf = requestAnimationFrame(this.frame);
  };
  private renderHud() {
    const s = this.game.save,
      st = stats(s);
    this.el("#gold").textContent = fmt(s.gold);
    this.el("#hp-bar").style.width =
      `${Math.min(100, (s.hp / st.maxHp) * 100)}%`;
    this.el("#hp-text").textContent = `${Math.ceil(s.hp)} / ${st.maxHp}`;
    this.el("#mana-bar").style.width = `${s.mana}%`;
    this.el("#mana-text").textContent = `${Math.floor(s.mana)} / 100`;
    this.el("#xp-bar").style.width = `${(s.xp / st.xpNext) * 100}%`;
    this.el("#hero-level").textContent = `${s.level}`;
    this.el("#hero-class").textContent = CLASSES[s.heroClass].name;
    this.el("#floor").textContent = `${s.floor}`;
    this.el("#zone-name").textContent = zoneNames[s.floor - 1];
    this.el("#potion-count").textContent = `${s.potions}`;
    this.el("#skill-cd").textContent =
      this.game.skillTime > 0 ? `${Math.ceil(this.game.skillTime)}` : "";
    this.el("#dash-cd").textContent =
      this.game.dashTime > 0 ? `${Math.ceil(this.game.dashTime)}` : "";
    this.el('[data-action="skill"]').classList.toggle(
      "on-cooldown",
      this.game.skillTime > 0,
    );
    this.el('[data-action="dash"]').classList.toggle(
      "on-cooldown",
      this.game.dashTime > 0,
    );
    const q = s.quests.find((q) => !q.claimed);
    this.el("#quest-title").textContent = q?.title ?? "Глубины ждут";
    this.el("#quest-progress").textContent = q
      ? q.progress >= q.target
        ? "Задание выполнено · заберите награду"
        : `${q.description} · ${q.progress} / ${q.target}`
      : "Все задания выполнены. Продолжайте исследование.";
    const near = this.game.nearestProp();
    this.el('[data-action="interact"]').classList.toggle("available", !!near);
    this.el("#interact-label").textContent =
      near?.type === "chest"
        ? "Открыть"
        : near?.type === "merchant"
          ? "Торговать"
          : near?.type === "stairs"
            ? "Спуск"
            : near?.type === "crystal"
              ? "Кристалл"
              : "Действие";
    this.el("#save-status").textContent = this.game.saveError
      ? "Сохранение недоступно"
      : "Прогресс сохраняется автоматически";
  }
  private itemButton(item: Item, equipped = false) {
    return `<button class="ef-item ${item.id === this.selected ? "selected" : ""} ${equipped ? "equipped" : ""}" style="--rarity:${RARITIES[item.rarity].color}" data-item="${escape(item.id)}" aria-label="${escape(item.name)}${equipped ? ", надето" : ""}" title="${escape(item.name)}"><img src="${itemURL(item.slot, item.rarity)}" alt=""/><span class="ef-item-level">${item.level}</span>${equipped ? `<span class="ef-item-equipped">${icon("check")}</span>` : ""}</button>`;
  }
  private renderPanel() {
    const s = this.game.save,
      st = stats(s),
      cls = CLASSES[s.heroClass];
    this.el("#side-level").textContent = `УР. ${s.level}`;
    this.el("#class-title").textContent = cls.title;
    this.el("#loadout-class").textContent = cls.name;
    this.el<HTMLImageElement>("#loadout-hero").src = sprite(
      "hero",
      0,
      s.heroClass,
    ).toDataURL();
    this.el("#power-score").textContent = fmt(
      st.attack * 6 + st.defense * 4 + st.maxHp,
    );
    this.el("#bag-count").textContent = `${s.inventory.length}`;
    this.el("#equipment").innerHTML = (Object.keys(slots) as Item["slot"][])
      .map(
        (slot) =>
          `<div>${s.equipment[slot] ? this.itemButton(s.equipment[slot]!, true) : `<div class="ef-item empty">${icon(slot === "weapon" ? "sword" : slot === "armor" ? "shield" : slot)}</div>`}<span>${slots[slot]}</span></div>`,
      )
      .join("");
    this.root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === this.tab);
      b.setAttribute("aria-selected", `${b.dataset.tab === this.tab}`);
    });
    const panel = this.el("#panel-content");
    if (this.tab === "bag") {
      let item =
        s.inventory.find((i) => i.id === this.selected) ??
        Object.values(s.equipment).find((i) => i.id === this.selected);
      if (!item) {
        item = s.inventory[0];
        if (item) this.selected = item.id;
      }
      panel.innerHTML = `<div class="ef-inventory-meta"><span>СНАРЯЖЕНИЕ</span><span>${s.inventory.length} / 40 ячеек</span></div><div class="ef-inventory-grid">${s.inventory.map((i) => this.itemButton(i)).join("")}${Array.from({ length: Math.max(0, 8 - s.inventory.length) }, () => '<div class="ef-item empty"><span>·</span></div>').join("")}</div>${item ? this.itemDetail(item) : '<div class="ef-empty-state">В рюкзаке пока пусто.<br>Сокровища ждут в глубине шахты.</div>'}`;
    } else if (this.tab === "stats") {
      panel.innerHTML = `<div class="ef-section-heading"><h3>Характеристики</h3><span>УРОВЕНЬ ${s.level}</span></div><div class="ef-stat-list">${[
        [icon("sword"), "Атака", st.attack],
        [icon("shield"), "Защита", st.defense],
        [icon("heart"), "Здоровье", st.maxHp],
        [icon("star"), "Критический удар", `${st.crit}%`],
        [icon("bolt"), "Скорость", st.speed],
      ]
        .map(
          ([i, name, val]) =>
            `<div><span>${i} ${name}</span><b>${val}</b></div>`,
        )
        .join(
          "",
        )}</div><div class="ef-section-heading"><h3>Древо талантов</h3><span>${st.points} ОЧК.</span></div><p class="ef-muted">Каждый новый уровень даёт очко таланта.</p><div class="ef-talents">${(["power", "vitality", "spirit"] as const).map((key, i) => `<div><span class="ef-talent-icon">${icon(["sword", "heart", "flame"][i])}</span><div><b>${["Сила", "Жизненная сила", "Средоточие"][i]} <em>${s.talents[key]}</em></b><small>${["+3 к атаке", "+20 к здоровью", "+3% крит. · меньше затрат маны"][i]}</small></div><button data-talent="${key}" ${st.points < 1 ? "disabled" : ""} aria-label="Улучшить ${key}">+</button></div>`).join("")}</div><div class="ef-experience">${icon("star")}<span>Опыт <b>${s.xp} / ${st.xpNext}</b></span></div>`;
    } else {
      panel.innerHTML = `<div class="ef-section-heading"><h3>Журнал заданий</h3><span>${s.quests.filter((q) => q.claimed).length} / 3</span></div>${s.quests.map((q) => `<article class="ef-quest-card ${q.claimed ? "complete" : ""}"><div><span>${q.claimed ? icon("check") : icon("scroll")}</span><h3>${escape(q.title)}</h3></div><p>${escape(q.description)}</p><div class="ef-progress"><i style="width:${(q.progress / q.target) * 100}%"></i></div><div class="ef-quest-reward"><span>${q.progress} / ${q.target}</span><b>${icon("coin")} ${q.gold} <i>·</i> ${q.xp} XP</b></div>${q.claimed ? '<span class="ef-claimed">НАГРАДА ПОЛУЧЕНА</span>' : `<button class="ef-button ${q.progress < q.target ? "secondary" : ""}" data-claim="${q.id}" ${q.progress < q.target ? "disabled" : ""}>${q.progress >= q.target ? "Забрать награду" : "В процессе"}</button>`}</article>`).join("")}`;
    }
  }
  private itemDetail(item: Item) {
    const rarity = RARITIES[item.rarity],
      equipped = this.game.save.equipment[item.slot],
      isEquipped = equipped?.id === item.id;
    const rows = (["attack", "defense", "health"] as const)
      .filter((k) => item[k] || equipped?.[k])
      .map((k) => {
        const delta = item[k] - (equipped?.[k] ?? 0);
        return `<div><span>${icon(k === "attack" ? "sword" : k === "defense" ? "shield" : "heart")} ${k === "attack" ? "Атака" : k === "defense" ? "Защита" : "Здоровье"}</span><b>+${item[k]}</b>${isEquipped ? "" : `<em class="${delta >= 0 ? "positive" : "negative"}">${delta >= 0 ? "+" : ""}${delta}</em>`}</div>`;
      })
      .join("");
    return `<article class="ef-item-detail" style="--rarity:${rarity.color}"><header><div class="ef-detail-icon"><img src="${itemURL(item.slot, item.rarity)}" alt=""/></div><div><span class="ef-rarity">${rarity.name} ${slots[item.slot].toLowerCase()}</span><h3>${escape(item.name)}</h3><small>Уровень ${item.level} <i>·</i> ${isEquipped ? "Экипировано" : "Привязывается при получении"}</small></div></header><div class="ef-item-stats">${rows}</div>${!isEquipped && equipped ? `<div class="ef-comparison"><span>${icon("shield")} СЕЙЧАС НАДЕТО</span><b>${escape(equipped.name)}</b></div>` : ""}<p class="ef-item-lore">«${escape(item.lore)}»</p><div class="ef-item-actions">${isEquipped ? '<span class="ef-equipped-text">✓ Уже экипировано</span>' : `<button class="ef-button" data-equip="${escape(item.id)}">${icon("check")} Экипировать</button><button class="ef-sell-button" data-sell="${escape(item.id)}" aria-label="Продать ${escape(item.name)} за ${item.value} золота">${icon("coin")} ${item.value}</button>`}</div></article>`;
  }
  private notice(message: string, kind = "info") {
    const now = new Date(),
      time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    this.log.push({ message, kind, time });
    this.log = this.log.slice(-20);
    this.el("#journal-lines").innerHTML = this.log
      .slice(-3)
      .map(
        (l) =>
          `<p><time>${l.time}</time><span class="log-${l.kind}">${escape(l.message)}</span></p>`,
      )
      .join("");
    const toast = this.el("#toast");
    toast.textContent = message;
    toast.className = `ef-toast visible toast-${kind}`;
    toast.dataset.until = `${performance.now() + 4200}`;
    window.setTimeout(() => {
      if (Number(toast.dataset.until) <= performance.now())
        toast.classList.remove("visible");
    }, 4300);
  }
  private openModal(type: string) {
    this.modal = type;
    this.game.paused = true;
    this.keys.clear();
    this.attackPointer = null;
    this.path = [];
    this.joystick = { x: 0, y: 0 };
    const s = this.game.save,
      st = stats(s);
    let title = "",
      eyebrow = "",
      body = "";
    if (type === "atlas") {
      title = "Атлас глубин";
      eyebrow = "ПУТЕШЕСТВИЕ ПОД ЗЕМЛЁЙ";
      body = `<div class="ef-atlas">${zoneNames.map((name, i) => `<div class="ef-atlas-zone ${s.floor === i + 1 ? "current" : ""} ${s.floor < i + 1 ? "locked" : ""}"><span>${icon(i === 2 ? "skull" : i === 1 ? "camp" : "map")}</span><div><small>ГЛУБИНА 0${i + 1}</small><h3>${name}</h3><p>${["Заброшенная шахта. Первый след проклятия.", "Забытые склепы и стражи древнего короля.", "Последний хранитель. Источник тьмы."][i]}</p></div><b>${s.floor > i + 1 ? "✓" : s.floor === i + 1 ? "ВЫ ЗДЕСЬ" : "ЗАКРЫТО"}</b></div>`).join("")}</div><p class="ef-muted">Победите хранителя этажа и найдите каменную лестницу в юго-восточной части шахты.</p>`;
    }
    if (type === "classes") {
      title = "Выберите свой путь";
      eyebrow = "ТРИ ГЕРОЯ · ТРИ СТИЛЯ БОЯ";
      body = `<div class="ef-class-cards">${(
        Object.keys(CLASSES) as HeroClass[]
      )
        .map((key) => {
          const c = CLASSES[key];
          return `<button class="ef-class-card ${key === s.heroClass ? "selected" : ""}" data-cls="${key}"><img src="${sprite("hero", 0, key).toDataURL()}" alt=""/><small>${c.title}</small><h3>${c.name}</h3><p>${c.description}</p><span>${icon("flame")} ${c.skill}</span><b>${key === s.heroClass ? "ТЕКУЩИЙ КЛАСС" : "ВЫБРАТЬ"}</b></button>`;
        })
        .join(
          "",
        )}</div><p class="ef-muted">Смена класса бесплатна. Экипировка, задания и уровень сохраняются.</p>`;
    }
    if (type === "merchant") {
      title = "Лавка Морвина";
      eyebrow = "ПУТЕВОЙ ТОРГОВЕЦ";
      body = `<div class="ef-merchant-intro"><img src="${sprite("merchant").toDataURL()}" alt="Морвин"/><p>«Внизу полно сокровищ, друг. Но ни одно из них не стоит твоей жизни. Возьми зелье про запас».</p></div><div class="ef-shop-item"><span>${icon("potion")}</span><div><h3>Малое зелье жизни</h3><p>Восстанавливает 50% здоровья</p><small>В рюкзаке: ${s.potions}</small></div><button class="ef-button" data-action="buy-potion" ${s.gold < 35 ? "disabled" : ""}>${icon("coin")} 35</button></div><div class="ef-shop-item ef-forge-item"><span>${icon("sword")}</span><div><h3>Заточка оружия</h3><p>+3 к атаке · повышает уровень предмета</p><small>${escape(s.equipment.weapon?.name ?? "Нет оружия")}</small></div><button class="ef-button" data-action="upgrade-weapon" ${!s.equipment.weapon || s.gold < 70 + (s.equipment.weapon?.level ?? 0) * 30 ? "disabled" : ""}>${icon("coin")} ${70 + (s.equipment.weapon?.level ?? 0) * 30}</button></div><p class="ef-muted">Ваше золото: ${fmt(s.gold)}. Ненужную экипировку можно продать из рюкзака.</p>`;
    }
    if (type === "settings" || type === "help") {
      title = type === "settings" ? "У костра" : "Управление";
      eyebrow = "ПРИКЛЮЧЕНИЕ ПРИОСТАНОВЛЕНО";
      title ||= "Управление";
      body = `<div class="ef-help-grid">${[
        ["W A S D / ← ↑ ↓ →", "Движение"],
        ["Щелчок по земле", "Проложить путь"],
        ["Щелчок по врагу", "Подойти и атаковать"],
        ["SPACE", "Удар · удерживайте для серии"],
        ["Q", CLASSES[s.heroClass].skill],
        ["SHIFT", "Рывок с неуязвимостью"],
        ["E", "Сундук · торговец · лестница"],
        ["R", "Выпить зелье"],
        ["I / J / M", "Рюкзак · задания · атлас"],
      ]
        .map(
          ([key, value]) => `<div><kbd>${key}</kbd><span>${value}</span></div>`,
        )
        .join(
          "",
        )}</div><div class="ef-settings-actions"><button class="ef-button secondary" data-action="auto">Автоатака: ${this.game.autoAttack ? "включена" : "выключена"}</button><button class="ef-button secondary" data-action="export">${icon("scroll")} Скачать сохранение</button></div><p class="ef-muted">На телефоне используйте джойстик слева и кнопки справа. Сохранение хранится на этом устройстве. Прогресс старых игр не затрагивается.</p>`;
    }
    if (type === "death") {
      title = "Пламя не погасло";
      eyebrow = "ВЫ ПАЛИ В БОЮ";
      body = `<div class="ef-death-symbol">${icon("flame")}</div><p class="ef-modal-prose">Даже самая длинная ночь заканчивается рассветом. Вернитесь ко входу и продолжите путь.</p><p class="ef-muted">Уровень, экипировка и задания сохраняются. Цена возрождения — 10% золота.</p><button class="ef-button" data-action="revive">Возродиться у входа ${icon("arrow")}</button>`;
    }
    if (type === "victory") {
      title = "Рассвет над глубинами";
      eyebrow = "ПЕРВОЕ ПРИКЛЮЧЕНИЕ ЗАВЕРШЕНО";
      body = `<div class="ef-death-symbol victory">${icon("star")}</div><p class="ef-modal-prose">Проклятие рассеяно. Шахты снова увидят свет. Но ваша история только начинается.</p><div class="ef-stat-list"><div><span>Уровень героя</span><b>${s.level}</b></div><div><span>Побеждено врагов</span><b>${s.kills}</b></div><div><span>Золото</span><b>${fmt(s.gold)}</b></div></div><button class="ef-button" data-action="close-modal">Продолжить исследование</button>`;
    }
    this.el("#modal-root").innerHTML =
      `<div class="ef-modal-shade"><section class="ef-modal ${type === "classes" ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="ef-modal-title"><header><div><span class="ef-eyebrow">${eyebrow}</span><h2 id="ef-modal-title">${title}</h2></div>${type === "death" ? "" : `<button class="ef-icon-button" data-action="close-modal" aria-label="Закрыть">${icon("close")}</button>`}</header><div class="ef-modal-body">${body}</div></section></div>`;
    this.el<HTMLButtonElement>("#modal-root button")?.focus({
      preventScroll: true,
    });
  }
  private closeModal() {
    if (this.game.dead) {
      this.openModal("death");
      return;
    }
    this.modal = "";
    this.el("#modal-root").innerHTML = "";
    this.game.paused = document.hidden || this.drawer;
    this.keys.clear();
  }
  private exportSave() {
    this.game.persist();
    const blob = new Blob([JSON.stringify(this.game.save, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "emberfall-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private tone(freq: number, length = 0.12) {
    if (!this.sound) return;
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume();
      const o = this.audio.createOscillator(),
        gain = this.audio.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, this.audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        freq * 0.7,
        this.audio.currentTime + length,
      );
      gain.gain.setValueAtTime(0.04, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.audio.currentTime + length,
      );
      o.connect(gain);
      gain.connect(this.audio.destination);
      o.start();
      o.stop(this.audio.currentTime + length);
    } catch {}
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.game.persist();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
    window.removeEventListener("focus", this.focus);
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("pagehide", this.pagehide);
    this.root.removeEventListener("click", this.click);
    this.root.removeEventListener("pointerdown", this.attackDown);
    window.removeEventListener("pointerup", this.attackUp);
    window.removeEventListener("pointercancel", this.attackUp);
    window.removeEventListener("lostpointercapture", this.attackUp);
    this.telegram.dispose();
    void this.audio?.close();
  }
}
