import {
  SKILLS,
  experienceLevel,
  levelFloor,
  skillPoints,
} from "../../shared/progression";
import { landingInfo, type FlightState } from "../../shared/space";
import { illustration } from "./Illustrations";
import {
  GEAR,
  isSphere,
  planetDepth,
  type GearKind,
  BUILDINGS,
  FURNITURE,
  PLANTS,
  PLANETS,
  RESOURCE_LABELS,
  ROOM,
  beds,
  ship,
  planetSize,
  allowedBuildings,
  moduleResources,
  itemInfo,
  recipes,
  key,
  nodes,
  type PlanetId,
  type BuildingKind,
  type FurnitureKind,
} from "../../shared/catalog";
import {
  ready,
  canAfford,
  hasLab,
  roomItems,
  worldEvent,
  buildingCenter,
  type Save,
} from "../../shared/model";
import { resourceIcon } from "./Icons";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const art = (id: string) =>
  resourceIcon(id) || `<span class="emoji-art">${itemInfo(id).icon}</span>`;
const costs = (cost: Record<string, number>, save: Save) =>
  Object.entries(cost)
    .map(
      ([r, n]) =>
        `<span class="cost ${(save.inventory[r] ?? 0) < n ? "short" : ""}" title="${escape(itemInfo(r).name)}">${art(r)}<b>${n}</b></span>`,
    )
    .join("");
export class UI {
  readonly root = document.createElement("div");
  onAutomation = () => {};
  onFirstPerson = () => {};
  onHand = (hand: Save["hand"]) => {};
  onUnderfoot = () => {};
  onGrapple = (planet: PlanetId) => {};
  onSkills = () => {};
  onSpendSkill = (skill: keyof typeof SKILLS) => {};
  travelMode: "ship" | "grapple" = "ship";
  onInventory = () => {};
  onScan = () => {};
  onSpaceAuto = () => {};
  onSpaceLand = () => {};
  onSpaceCourse = () => {};
  readonly flightControls = { pitch: 0, brake: false, boost: false };
  onAttack = () => {};
  onAudio = () => {};
  onEquip = (slot: "weapon" | "armor", item: GearKind | null) => {};
  onPlant = () => {};
  onBuild = () => {};
  onGalaxy = () => {};
  onCamera = () => {};
  onSettings = () => {};
  onCraftMenu = () => {};
  onOpenRecipe = (item: string) => {};
  onSelectPlant = (id: string) => {};
  onSelectBuilding = (kind: BuildingKind) => {};
  onSelectFurniture = (kind: FurnitureKind) => {};
  onResource = (id: string) => {};
  onConfirmBuild = () => {};
  onCancelBuild = () => {};
  onRotateBuild = () => {};
  onTravel = (id: PlanetId) => {};
  onContext = () => {};
  onContextClose = () => {};
  onCraft = (recipe: string) => {};
  onItemPlace = (item: string) => {};
  private toastTimer = 0;
  private contextKey = "";
  private inventoryGroup = "Все";
  private selectedItem = "";
  private craftGroup = "Все";
  private selectedRecipe = "";
  private activeModal: "inventory" | "craft" | "galaxy" | null = null;
  private galaxyQuery = "";
  constructor(readonly local: boolean) {
    this.root.className = "hud";
    this.root.innerHTML = `
 <header class="topbar"><div class="identity"><div class="avatar">🧑‍🚀</div><div><div class="brand">LITTLE PLANETS <span>✦ CUBEWORKS</span></div><strong id="planet-name">Родная</strong><small id="planet-tag"></small></div></div><div class="top-buttons"><button id="first-person" title="Вид от первого лица" aria-label="Вид от первого лица">◉</button><button id="view" title="Камера" aria-label="Переключить камеру">🌐</button><button id="audio-toggle" title="Звук" aria-label="Включить или выключить звук">♫</button><button id="settings" title="Настройки" aria-label="Настройки">⚙</button></div></header>
 <aside class="minimap"><canvas id="minimap" width="240" height="240" aria-label="Мини-карта планеты"></canvas></aside>
 <div id="combat-hud" class="combat-hud hidden"><span>♥ <b id="health-value">100</b></span><div class="health-track"><i id="health-fill"></i></div><small id="equipped-label"></small></div><button id="attack" class="attack-button hidden" aria-label="Атаковать">⚔<small>Атака</small></button>
 <div id="event-banner" class="event-banner hidden" role="status"></div><div id="context" class="context panel hidden"></div><div id="build-panel" class="build-panel panel hidden"></div>
 <div class="bottom"><nav id="menu-items" class="hidden" aria-label="Меню игры"><button id="inventory"><span>🎒</span>Рюкзак</button><button id="craft"><span>🛠️</span>Крафт</button><button id="plant"><span>🌱</span>Сад</button><button id="build"><span>🏗️</span>Строить</button><button id="automation"><span>🤖</span>Автоматика</button><button id="galaxy"><span>🚀</span>Планеты</button><button id="menu-settings"><span>⚙️</span>Настройки</button></nav><button id="menu-toggle" aria-label="Открыть меню" aria-expanded="false"><span>☰</span><small>Меню</small></button><span class="save-status" id="save-status">${local ? "Локальный мир" : "Telegram"} · сохранено</span></div>
 <div id="joystick" aria-label="Джойстик движения"><span></span></div><div class="keyboard">WASD · движение <b> / </b> колесо · масштаб <b> / </b> потяните · поворот</div>
 <div id="handbar" class="handbar" aria-label="Предмет в руках"></div><button id="underfoot" class="underfoot">▣ Под себя</button><div id="progress-hud" class="progress-hud"><button id="skills-button"></button><div><i id="xp-fill"></i></div><small id="day-clock"></small></div><div id="crosshair" class="crosshair hidden">+</div><section id="zipline-hud" class="zipline-hud hidden"><h3 id="zipline-target"></h3><progress id="zipline-progress" max="1"></progress><p>Держимся за перекладину · перелёт по тросу</p><button id="zipline-cancel">Вернуться на исходную планету</button></section><div id="toast" role="status"></div><div id="modal" class="modal hidden"><section class="sheet"><button class="close" id="close-modal" aria-label="Закрыть окно">×</button><div id="modal-content"></div></section></div>
 <section id="space-hud" class="space-hud hidden"><header><span class="eyebrow">КОСМИЧЕСКИЙ ПОЛЁТ</span><h3 id="space-target"></h3><div class="flight-readings"><span><small>ДО МАЯКА</small><b id="flight-distance"></b></span><span><small>СКОРОСТЬ</small><b id="flight-speed"></b></span></div><p id="flight-help"></p></header><div class="flight-actions"><button id="space-auto">Автопилот</button><button id="space-course">Выбрать курс</button><button id="space-land" class="primary" disabled>Посадка</button></div><div class="flight-thrust"><button id="flight-up" aria-label="Поднять нос">↑</button><button id="flight-down" aria-label="Опустить нос">↓</button><button id="flight-brake">Тормоз</button><button id="flight-boost">Ускорение</button></div><div class="flight-hint">W/S · тяга &nbsp; A/D · поворот &nbsp; Q/E · высота &nbsp; пробел · тормоз</div><div id="flight-reticle" class="flight-reticle">◇</div></section>
 <div id="flight" class="flight hidden"><span>🚀</span><h2 id="flight-title"></h2><p>Ваш маленький мир всегда ждёт возвращения</p></div>`;
    document.querySelector("#app")!.append(this.root);
    for (const [id, callback] of [
      ["first-person", () => this.onFirstPerson()],
      ["skills-button", () => this.onSkills()],
      ["underfoot", () => this.onUnderfoot()],
      ["inventory", () => this.onInventory()],
      ["automation", () => this.onAutomation()],
      ["plant", () => this.onPlant()],
      ["build", () => this.onBuild()],
      ["galaxy", () => this.onGalaxy()],
      ["view", () => this.onCamera()],
      ["settings", () => this.onSettings()],
      ["craft", () => this.onCraftMenu()],
      ["close-modal", () => this.close()],
      ["menu-settings", () => this.onSettings()],
      ["attack", () => this.onAttack()],
      ["audio-toggle", () => this.onAudio()],
    ] as const)
      this.button(id, callback);
    this.button("space-auto", () => this.onSpaceAuto());
    this.button("space-land", () => this.onSpaceLand());
    this.button("space-course", () => this.onSpaceCourse());
    for (const [id, key, value] of [
      ["flight-up", "pitch", 1],
      ["flight-down", "pitch", -1],
      ["flight-brake", "brake", true],
      ["flight-boost", "boost", true],
    ] as const) {
      const button = this.el(id);
      const hold = (active: boolean) => {
        if (key === "pitch")
          this.flightControls.pitch = active ? Number(value) : 0;
        else this.flightControls[key] = active;
      };
      button.onpointerdown = (e) => {
        button.setPointerCapture(e.pointerId);
        hold(true);
      };
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        button.addEventListener(event, () => hold(false));
    }
    this.button("menu-toggle", () => this.toggleMenu());
    this.el("modal").addEventListener("click", (e) => {
      if (e.target === this.el("modal")) this.close();
    });
    this.el("minimap").addEventListener("click", () => this.onCamera());
  }
  el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  button(id: string, callback: () => void) {
    this.el(id).addEventListener("click", () => {
      if (
        [
          "automation",
          "inventory",
          "craft",
          "plant",
          "build",
          "galaxy",
          "menu-settings",
        ].includes(id)
      )
        this.toggleMenu(false);
      callback();
    });
  }
  toast(text: string) {
    const el = this.el("toast");
    el.textContent = text;
    el.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => el.classList.remove("visible"),
      3300,
    );
  }
  update(save: Save, now: number) {
    const p = PLANETS[save.planet];
    const level = experienceLevel(save.progression.xp),
      floor = levelFloor(level),
      next = levelFloor(level + 1);
    this.el("skills-button").textContent =
      `Ур. ${level} · ${save.progression.xp - floor}/${next - floor} XP${skillPoints(save.progression) ? " · +" + skillPoints(save.progression) : ""}`;
    this.el("xp-fill").style.width =
      `${(100 * (save.progression.xp - floor)) / (next - floor)}%`;
    const hands: {
      id: Save["hand"];
      name: string;
      icon: string;
      available: boolean;
    }[] = [
      { id: "pickaxe", name: "Кирка", icon: "⛏", available: true },
      { id: "grapple", name: "Гарпун", icon: "↗", available: true },
      ...(["sword", "spear", "blaster"] as const).map((id) => ({
        id,
        name: GEAR[id].name,
        icon: GEAR[id].icon,
        available: (save.inventory[`gear:${id}`] ?? 0) > 0,
      })),
      { id: "none", name: "Руки", icon: "✋", available: true },
    ];
    const signature = hands
      .map((h) => `${h.id}:${h.available}:${save.hand === h.id}`)
      .join("");
    if (this.el("handbar").dataset.signature !== signature) {
      this.el("handbar").dataset.signature = signature;
      this.el("handbar").innerHTML = hands
        .map(
          (h, i) =>
            `<button data-hand="${h.id}" title="${h.name}${h.available ? "" : " · сначала создайте"}" aria-label="${h.name}" aria-pressed="${save.hand === h.id}" ${h.available ? "" : "disabled"}><small>${i + 1}</small><span>${h.icon}</span></button>`,
        )
        .join("");
      this.el("handbar")
        .querySelectorAll<HTMLButtonElement>("[data-hand]")
        .forEach(
          (b) =>
            (b.onclick = () => this.onHand(b.dataset.hand as Save["hand"])),
        );
    }
    this.el("underfoot").classList.toggle(
      "hidden",
      !!save.inside || !!save.flight || !!save.grapple,
    );

    this.el("planet-name").textContent = save.inside ? "Главный дом" : p.name;
    this.el("planet-tag").textContent = save.inside
      ? "Уют начинается с вас"
      : save.planet === "home"
        ? "Родная планета · база"
        : "Исследовательская планета · добыча";
    this.el("plant").classList.toggle("hidden", !!save.inside);
    this.el("galaxy").classList.toggle("hidden", !!save.inside);
    this.el("build").classList.remove("hidden");
    this.el("build").innerHTML =
      `<span>${save.inside ? "🪑" : "🏗️"}</span>${save.inside ? "Мебель" : "Строить"}`;
    const combat = !!PLANETS[save.planet].hostile && !save.inside;
    this.el("combat-hud").classList.toggle("hidden", !combat);
    this.el("attack").classList.toggle("hidden", !combat);
    this.el("health-value").textContent = String(save.health);
    this.el("health-fill").style.width = `${save.health}%`;
    this.el("equipped-label").textContent = save.equipment.weapon
      ? GEAR[save.equipment.weapon].name
      : "Без оружия · создайте его в крафте";
    const event = save.inside ? null : worldEvent(save, save.planet, now),
      banner = this.el("event-banner");
    banner.classList.toggle("hidden", !event);
    if (event)
      banner.textContent =
        event.type === "meteor"
          ? now < event.impactAt
            ? "☄️ Приближается метеорит"
            : event.claimed
              ? "☄️ Метеорит исследован"
              : "☄️ Метеорит упал · найдите его на карте"
          : {
              wind: "💨 Сильный ветер",
              rain: "🌧 Дождь",
              storm: "⛈ Гроза · молнии над планетой",
              hurricane: "🌪 Ураган · вихри и сильный ветер",
            }[event.type];
  }
  minimap(
    save: Save,
    position: { x: number; z: number },
    heading: number,
    now: number,
    animals: { x: number; z: number }[] = [],
  ) {
    const canvas = this.el("minimap") as HTMLCanvasElement,
      ctx = canvas.getContext("2d")!;
    const width = save.inside ? ROOM.width : planetSize(save.planet),
      depth = save.inside ? ROOM.depth : planetDepth(save.planet),
      pad = 9,
      unit = 222 / Math.max(width, depth),
      draw = (x: number, z: number, w: number, d: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(
          pad + (x - 0.5) * unit,
          pad + (z - 0.5) * unit,
          w * unit,
          d * unit,
        );
      };
    ctx.clearRect(0, 0, 240, 240);

    draw(
      0.5,
      0.5,
      width - 1,
      depth - 1,
      save.inside
        ? "#7e6852"
        : save.planet === "mycelia"
          ? "#67528d"
          : save.planet === "pyros"
            ? "#6f5555"
            : "#4d714c",
    );
    if (save.inside) {
      for (const f of roomItems(save)) {
        const recipe = FURNITURE[f.kind];
        draw(
          f.x,
          f.z,
          f.rotation ? recipe.d : recipe.w,
          f.rotation ? recipe.w : recipe.d,
          "#d6bc88",
        );
      }
      draw(ROOM.door.x - 0.5, ROOM.door.z, 2, 0.6, "#8fdfbb");
    } else {
      for (const n of nodes(save.planet))
        draw(n.x, n.z, 0.8, 0.8, n.resource === "wood" ? "#b7d18a" : "#c6d3d3");
      for (const b of beds(save.planet)) {
        const crop = save.worlds[save.planet].crops[key(b.x, b.z)];
        draw(b.x, b.z, 1, 1, crop && ready(crop, now) ? "#f3d276" : "#967553");
      }
      for (const b of save.worlds[save.planet].buildings)
        draw(
          b.x,
          b.z,
          BUILDINGS[b.kind].size,
          BUILDINGS[b.kind].size,
          BUILDINGS[b.kind].zone === "home" ? "#f2c486" : "#84c7dd",
        );
      const padPos = ship(save.planet);
      draw(padPos.x - 1, padPos.z - 1, 3, 3, "#7b9eb8");
      for (const a of animals) draw(a.x, a.z, 0.3, 0.3, "#f2e6cf");
      for (const e of save.worlds[save.planet].enemies)
        if (e.hp > 0) draw(e.x - 0.25, e.z - 0.25, 0.8, 0.8, "#ff897b");
      const event = worldEvent(save, save.planet, now);
      if (event?.type === "meteor" && !event.claimed) {
        ctx.fillStyle = "#ffad70";
        ctx.beginPath();
        ctx.arc(
          pad + event.x * unit,
          pad + event.z * unit,
          4.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(pad + position.x * unit, pad + position.z * unit);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = "#fff9d8";
    ctx.strokeStyle = "#17314a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
  toggleMenu(open?: boolean) {
    const expanded = open ?? this.el("menu-items").classList.contains("hidden");
    this.el("menu-items").classList.toggle("hidden", !expanded);
    this.el("menu-toggle").setAttribute("aria-expanded", String(expanded));
    this.el("menu-toggle").querySelector("span")!.textContent = expanded
      ? "×"
      : "☰";
  }
  get modalOpen() {
    return !this.el("modal").classList.contains("hidden");
  }
  get contextOpen() {
    return !this.el("context").classList.contains("hidden");
  }
  close() {
    this.el("modal").classList.add("hidden");
    this.activeModal = null;
  }
  panel(html: string) {
    this.activeModal = null;
    this.show(html);
  }
  private show(html: string) {
    this.el("modal-content").innerHTML = html;
    this.el("modal-content").scrollTop = 0;
    this.el("modal").classList.remove("hidden");
  }
  inventory(
    save: Save,
    group = this.inventoryGroup,
    selected = this.selectedItem,
  ) {
    this.activeModal = "inventory";
    this.inventoryGroup = group;
    this.selectedItem = selected;
    const items = Object.entries(save.inventory).filter(
        ([id, n]) => n > 0 || !!RESOURCE_LABELS[id],
      ),
      shown = items.filter(
        ([id]) => group === "Все" || itemInfo(id).group === group,
      );
    const info = selected ? itemInfo(selected) : null;
    this.show(
      `<span class="eyebrow">ЛИЧНЫЙ ИНВЕНТАРЬ</span><h2>Рюкзак путешественника</h2><div class="equipment-row"><div><small>ОРУЖИЕ</small><strong>${save.equipment.weapon ? GEAR[save.equipment.weapon].name : "Не надето"}</strong>${save.equipment.weapon ? '<button id="unequip-weapon">Снять</button>' : ""}</div><div><small>БРОНЯ</small><strong>${save.equipment.armor ? GEAR[save.equipment.armor].name : "Не надета"}</strong>${save.equipment.armor ? '<button id="unequip-armor">Снять</button>' : ""}</div><span>♥ ${save.health} / 100<br>Побед: ${save.kills}</span></div><div class="tabs">${["Все", "Ресурсы", "Семена", "Урожай", "Постройки", "Мебель", "Экипировка"].map((g) => `<button data-inventory-tab="${g}" class="${g === group ? "active" : ""}">${g}</button>`).join("")}</div><div class="bag-layout"><div class="slots">${shown.map(([id, n]) => `<button class="slot ${id === selected ? "selected" : ""}" data-item="${escape(id)}" aria-label="${escape(itemInfo(id).name)}: ${n}" title="${escape(itemInfo(id).name)}">${art(id)}${id.startsWith("gear:") && Object.values(save.equipment).includes(id.split(":")[1] as GearKind) ? '<i class="equipped-mark">✓</i>' : ""}<b>${n}</b><small>${escape(itemInfo(id).name)}</small></button>`).join("")}${'<div class="slot empty"></div>'.repeat(Math.max(0, 24 - shown.length))}</div><aside class="item-detail">${info ? `${selected.startsWith("gear:") ? illustration(selected) : art(selected)}<small>${info.group}</small><h3>${escape(info.name)}</h3><p>В рюкзаке: <b>${save.inventory[selected] ?? 0}</b></p>${selected.startsWith("gear:") ? `<p>${GEAR[selected.split(":")[1] as GearKind].description}</p><button id="equip-item" class="primary">Надеть</button>` : selected.startsWith("kit:") || selected.startsWith("furniture:") ? '<button id="place-item" class="primary">Разместить</button>' : '<p class="muted">Ресурсы расходуются по рецептам. Семена сажаются в свободную грядку своего биома.</p>'}` : '<span class="bag-icon">🎒</span><h3>Всё под рукой</h3><p>Выберите предмет, чтобы увидеть его название и действие.</p>'}</aside></div><footer class="bag-footer">${items.length} типов предметов · общий инвентарь всех планет</footer>`,
    );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-inventory-tab]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            this.inventory(save, b.dataset.inventoryTab!, selected)),
      );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-item]")
      .forEach(
        (b) => (b.onclick = () => this.inventory(save, group, b.dataset.item!)),
      );
    for (const slot of ["weapon", "armor"] as const)
      if (this.el(`unequip-${slot}`))
        this.button(`unequip-${slot}`, () => this.onEquip(slot, null));
    if (this.el("equip-item")) {
      const kind = selected.split(":")[1] as GearKind;
      this.button("equip-item", () => this.onEquip(GEAR[kind].slot, kind));
    }
    if (this.el("place-item"))
      this.button("place-item", () => this.onItemPlace(selected));
  }
  craft(save: Save, group = this.craftGroup, selected = this.selectedRecipe) {
    this.activeModal = "craft";
    this.craftGroup = group;
    this.selectedRecipe = selected;
    const all = recipes(),
      list = all.filter((r) => group === "Все" || r.group === group),
      recipe = all.find((r) => r.id === selected) ?? list[0];
    this.show(
      `<div class="workshop-heading"><span class="eyebrow">МАСТЕРСКАЯ ПУТЕШЕСТВЕННИКА · ПОЛЕВОЙ КАТАЛОГ</span><h2>Создавайте. Исследуйте. Защищайтесь.</h2><p>От первого стула до кристальной брони — всё начинается здесь.</p></div><div class="tabs">${["Все", "Оружие", "Броня", "База", "Модули", "Мебель", "Семена"].map((g) => `<button data-craft-tab="${g}" class="${g === group ? "active" : ""}">${g}</button>`).join("")}</div><div class="craft-layout"><div class="recipe-grid">${list.map((r) => `<button data-recipe="${r.id}" class="recipe ${r.id === recipe?.id ? "selected" : ""}">${illustration(r.id)}<div class="recipe-caption"><small>${r.group}</small><strong>${r.name}</strong><span>${r.lab ? "Лаборатория" : "Полевой рецепт"} ↗</span></div></button>`).join("")}</div><aside class="recipe-detail">${recipe ? `${illustration(recipe.id)}<span class="eyebrow">${recipe.group} · РЕЦЕПТ</span><h3>${recipe.name}</h3><p>${recipe.description}</p><div class="recipe-cost">${costs(recipe.cost, save)}</div>${recipe.lab && !hasLab(save) ? '<p class="locked">🔬 Сначала постройте лабораторию</p>' : ""}<button id="craft-one" class="primary" ${canAfford(save, recipe.cost) && (!recipe.lab || hasLab(save)) ? "" : "disabled"}>Создать ×1</button><small>Готовый предмет попадёт в рюкзак.</small>` : "<p>Рецептов пока нет.</p>"}</aside></div>`,
    );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-craft-tab]")
      .forEach(
        (b) => (b.onclick = () => this.craft(save, b.dataset.craftTab!, "")),
      );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-recipe]")
      .forEach(
        (b) => (b.onclick = () => this.craft(save, group, b.dataset.recipe!)),
      );
    if (recipe) this.button("craft-one", () => this.onCraft(recipe.id));
  }
  refreshModal(save: Save) {
    if (this.activeModal === "craft") this.craft(save);
    else if (this.activeModal === "inventory") this.inventory(save);
    else if (this.activeModal === "galaxy") this.galaxy(save, this.galaxyQuery);
  }
  seeds(save: Save) {
    this.activeModal = null;
    this.show(
      `<span class="eyebrow">СВОБОДНАЯ ГРЯДКА</span><h2>Что посадим?</h2><div class="seed-options">${PLANETS[
        save.planet
      ].plants
        .map((id) => {
          const p = PLANTS[id],
            n = save.inventory[`seed:${id}`] ?? 0;
          return `<button data-seed="${id}" ${n ? "" : "disabled"}><span>${p.icon}</span><strong>${p.name}</strong><small>${p.seconds} сек. · ${n} семян</small><b>Посадить ↗</b></button>`;
        })
        .join("")}</div>`,
    );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-seed]")
      .forEach((b) => (b.onclick = () => this.onSelectPlant(b.dataset.seed!)));
  }
  context(
    title: string,
    detail: string,
    actionLabel?: string,
    disabled = false,
  ) {
    const signature = [title, detail, actionLabel, disabled].join("|");
    if (signature === this.contextKey && this.contextOpen) return;
    this.contextKey = signature;
    const panel = this.el("context");
    panel.classList.remove("hidden");
    panel.innerHTML = `<button id="close-context" class="close" aria-label="Закрыть действие">×</button><small>ВЗАИМОДЕЙСТВИЕ</small><h3>${escape(title)}</h3><p>${escape(detail)}</p>${actionLabel ? `<button id="context-action" class="primary" ${disabled ? "disabled" : ""}>${escape(actionLabel)}</button>` : ""}`;
    this.button("close-context", () => this.onContextClose());
    if (actionLabel) this.button("context-action", () => this.onContext());
  }
  hideContext() {
    this.el("context").classList.add("hidden");
    this.contextKey = "";
  }
  placement(
    save: Save,
    kind: BuildingKind | FurnitureKind,
    valid: boolean,
    resource?: string,
  ) {
    const inside = !!save.inside,
      items = inside
        ? (Object.keys(FURNITURE) as FurnitureKind[])
        : allowedBuildings(save.planet),
      recipe = inside
        ? FURNITURE[kind as FurnitureKind]
        : BUILDINGS[kind as BuildingKind],
      itemId = `${inside ? "furniture" : "kit"}:${kind}`,
      owned = save.inventory[itemId] ?? 0;
    const panel = this.el("build-panel");
    panel.classList.remove("hidden");
    panel.innerHTML = `<div class="placement-header"><button id="close-placement" class="close" aria-label="Закрыть размещение">×</button><span class="eyebrow">${inside ? "ОБУСТРОЙСТВО ДОМА" : save.planet === "home" ? "СТРОИТЕЛЬСТВО БАЗЫ" : "ДОБЫЧА НА ПЛАНЕТЕ"}</span></div><h3>${inside ? "Расставим мебель" : save.planet === "home" ? "Новый уголок колонии" : "Поставим добывающий модуль"}</h3><div class="build-choices">${items
      .map((id) => {
        const r = inside
          ? FURNITURE[id as FurnitureKind]
          : BUILDINGS[id as BuildingKind];
        return `<button data-placement="${id}" class="${id === kind ? "selected" : ""}"><span>${r.icon}</span><strong>${r.name}</strong><small>${save.inventory[`${inside ? "furniture" : "kit"}:${id}`] ?? 0} готово</small></button>`;
      })
      .join("")}</div>${
      !inside && BUILDINGS[kind as BuildingKind].zone === "outpost"
        ? `<div class="resource-choice">${moduleResources(
            save.planet,
            kind as BuildingKind,
          )
            .map(
              (r) =>
                `<button data-resource="${r}" class="${r === resource ? "selected" : ""}">${art(r)}${RESOURCE_LABELS[r]}</button>`,
            )
            .join("")}</div>`
        : ""
    }<div class="placement-cost">${owned ? `📦 Готово в рюкзаке: ${owned}` : costs(recipe.cost, save)}</div><p id="placement-hint" class="${valid ? "valid" : "invalid"}">${valid ? "Место подходит. Подтвердите размещение." : "Здесь нельзя разместить. Выберите подходящие клетки."}</p>${inside && !owned ? '<button id="placement-craft" class="secondary">Открыть рецепт</button>' : ""}<div class="build-actions"><button id="cancel-build" aria-label="Отменить размещение">×</button><button id="rotate-build" aria-label="Повернуть объект">↻</button><button id="confirm-build" class="primary" ${valid && (inside ? owned > 0 : owned > 0 || canAfford(save, recipe.cost)) ? "" : "disabled"}>${inside || owned ? "Разместить" : "Построить"} ✓</button></div>`;
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-placement]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            inside
              ? this.onSelectFurniture(b.dataset.placement as FurnitureKind)
              : this.onSelectBuilding(b.dataset.placement as BuildingKind)),
      );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-resource]")
      .forEach((b) => (b.onclick = () => this.onResource(b.dataset.resource!)));
    this.button("close-placement", () => this.onCancelBuild());
    this.button("cancel-build", () => this.onCancelBuild());
    this.button("rotate-build", () => this.onRotateBuild());
    this.button("confirm-build", () => this.onConfirmBuild());
    if (inside && !owned)
      this.button("placement-craft", () => {
        this.onOpenRecipe(itemId);
      });
  }
  hideBuilding() {
    this.el("build-panel").classList.add("hidden");
  }
  galaxy(save: Save, query = this.galaxyQuery) {
    this.activeModal = "galaxy";
    this.galaxyQuery = query;
    const planets = save.discovered
      .map((id) => PLANETS[id])
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    this.show(
      `<span class="eyebrow">ЗВЁЗДНЫЙ АТЛАС</span><h2>За пределами знакомого</h2><label class="travel-selector">Способ путешествия <select id="travel-mode"><option value="ship" ${this.travelMode === "ship" ? "selected" : ""}>Корабль</option><option value="grapple" ${this.travelMode === "grapple" ? "selected" : ""}>Гарпун и трос</option></select></label><div class="planet-search"><input id="planet-search" type="search" placeholder="Найти планету по названию…" value="${escape(query)}" aria-label="Название планеты"><button id="scan-planets" class="primary">✦ Найти случайную планету</button></div><p class="atlas-note">Сканер открывает новые экспедиционные миры. ${save.discovered.filter((p) => p.startsWith("wild-")).length} / 24 найдено.</p>${save.lastDiscovery ? `<p class="discovery-note">✦ Открыта ${PLANETS[save.lastDiscovery].name}</p>` : ""}<div class="planet-cards">${planets.map((p) => `<button data-planet="${p.id}" ${p.id === save.planet && !save.flight ? "disabled" : ""} style="--planet:${p.color}"><div class="mini-planet">${p.icon}</div><strong>${p.name}</strong><small>${p.description}</small><em>Куб · 6 граней ${planetSize(p.id)} × ${planetSize(p.id)} · ${p.hostile ? "⚔ Противники" : p.id === "home" ? "База" : "Мирная"}</em><b>${save.flight ? (p.id === save.flight.target ? "Текущий курс" : "Задать курс ↗") : p.id === save.planet ? "Вы здесь" : "Отправиться ↗"}</b></button>`).join("") || "<p>Такая планета пока не найдена. Воспользуйтесь сканером.</p>"}</div>`,
    );
    (this.el("scan-planets") as HTMLButtonElement).disabled = !!save.flight;
    this.button("scan-planets", () => this.onScan());
    (this.el("travel-mode") as HTMLSelectElement).onchange = () => {
      this.travelMode = (this.el("travel-mode") as HTMLSelectElement).value as
        | "ship"
        | "grapple";
      this.galaxy(save, query);
    };
    const input = this.el("planet-search") as HTMLInputElement;
    input.oninput = () => {
      const cursor = input.selectionStart;
      this.galaxy(save, input.value);
      const next = this.el("planet-search") as HTMLInputElement;
      next.focus();
      next.setSelectionRange(cursor, cursor);
    };
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-planet]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            this.travelMode === "grapple"
              ? this.onGrapple(b.dataset.planet as PlanetId)
              : this.onTravel(b.dataset.planet as PlanetId)),
      );
  }
  skills(save: Save) {
    this.panel(
      `<span class="eyebrow">ПРОГРЕСС ПУТЕШЕСТВЕННИКА</span><h2>Уровень ${experienceLevel(save.progression.xp)}</h2><p>Опыт: ${save.progression.xp}. Свободных очков: ${skillPoints(save.progression)}. Урожай +12 XP, победа +25, сбор +3, природный блок +2, постройка +12.</p><div class="device-palette">${Object.entries(
        SKILLS,
      )
        .map(
          ([id, name]) =>
            `<button data-skill="${id}" ${skillPoints(save.progression) <= 0 || save.progression.skills[id as keyof typeof SKILLS] >= 5 ? "disabled" : ""}>${name} · ${save.progression.skills[id as keyof typeof SKILLS]}/5<small>${id === "farming" ? "+1 урожай за каждые два ранга" : id === "mining" ? "+1 материал источника за ранг" : "+2 урона за ранг"}</small></button>`,
        )
        .join("")}</div>`,
    );
    this.el("modal-content")
      .querySelectorAll<HTMLButtonElement>("[data-skill]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            this.onSpendSkill(b.dataset.skill as keyof typeof SKILLS)),
      );
  }
  settings(
    fullscreen: () => void,
    quality: () => void,
    audio: { music: boolean; effects: boolean; volume: number },
    sound: (
      key: "music" | "effects" | "volume",
      value: boolean | number,
    ) => void,
  ) {
    this.activeModal = null;
    this.show(
      `<span class="eyebrow">НАСТРОЙКИ</span><h2>Ваш маленький космос</h2><p>WASD или джойстик — движение. Нажмите объект для действия. Потяните мир для поворота; колесо или щипок — масштаб.</p><button id="full" class="primary">На весь экран</button><button id="quality" class="secondary">Переключить качество</button><div class="sound-controls"><h3>Звук путешествия</h3><label><input id="music-enabled" type="checkbox" ${audio.music ? "checked" : ""}> Музыка</label><label><input id="effects-enabled" type="checkbox" ${audio.effects ? "checked" : ""}> Звуковые эффекты</label><label>Громкость <input id="sound-volume" type="range" min="0" max="1" step="0.05" value="${audio.volume}"></label><p>Музыка запускается после первого нажатия. В фоне звук приостанавливается.</p></div>`,
    );
    this.button("full", fullscreen);
    this.button("quality", quality);
    for (const [id, key] of [
      ["music-enabled", "music"],
      ["effects-enabled", "effects"],
    ] as const)
      (this.el(id) as HTMLInputElement).onchange = (e) =>
        sound(key, (e.target as HTMLInputElement).checked);
    (this.el("sound-volume") as HTMLInputElement).oninput = (e) =>
      sound("volume", Number((e.target as HTMLInputElement).value));
  }
  space(
    f: FlightState | null,
    busy = false,
    reticle?: { x: number; y: number; z: number },
  ) {
    this.root.classList.toggle("space-flight", !!f);
    this.el("space-hud").classList.toggle("hidden", !f);
    if (!f) return;
    const info = landingInfo(f);
    this.el("space-target").textContent = PLANETS[f.target].name;
    this.el("flight-distance").textContent = `${Math.round(info.distance)} м`;
    this.el("flight-speed").textContent = `${info.speed.toFixed(1)} м/с`;
    this.el("flight-help").textContent = busy
      ? "Посадочные двигатели…"
      : info.allowed
        ? "Маяк достигнут. Можно садиться."
        : f.autopilot
          ? "Автопилот ведёт корабль к посадочному маяку."
          : "Ведите корабль джойстиком или включите автопилот.";
    this.el("space-auto").textContent = f.autopilot
      ? "Автопилот ✓"
      : "Автопилот";
    (this.el("space-land") as HTMLButtonElement).disabled =
      busy || !info.allowed;
    for (const id of ["space-auto", "space-course"])
      (this.el(id) as HTMLButtonElement).disabled = busy;
    if (reticle) {
      const x = Math.max(
          22,
          Math.min(innerWidth - 22, ((reticle.x + 1) * innerWidth) / 2),
        ),
        y = Math.max(
          160,
          Math.min(innerHeight - 130, ((1 - reticle.y) * innerHeight) / 2),
        );
      this.el("flight-reticle").style.left = `${x}px`;
      this.el("flight-reticle").style.top = `${y}px`;
    }
  }
  flight(name: string, show: boolean) {
    this.el("flight-title").textContent = `Курс на ${name}`;
    this.el("flight").classList.toggle("hidden", !show);
  }
}
