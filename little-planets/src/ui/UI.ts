import { hudIcon } from "./Glyphs";
import { SHIP_CLASS_NAMES, SHIP_STATS } from "../../shared/ships";
import { GalaxyMap } from "./GalaxyMap";
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
  resourceIcon(id) ||
  hudIcon(
    id.startsWith("ship:")
      ? "ship"
      : /^(seed|crop):/.test(id)
        ? "garden"
        : (id.split(":")[1] ?? id),
    "item-art",
  );
const costs = (cost: Record<string, number>, save: Save) =>
  save.freeConstruction
    ? `<span class="cost testing-cost">0 · TEST PILOT</span>`
    : Object.entries(cost)
        .map(
          ([r, n]) =>
            `<span class="cost ${(save.inventory[r] ?? 0) < n ? "short" : ""}" title="${escape(itemInfo(r).name)}">${art(r)}<b>${n}</b></span>`,
        )
        .join("");
export class UI {
  readonly root = document.createElement("div");
  onAutomation = () => {};
  onBoardShip = () => {};
  onMineStrike = () => {};
  onCancelPlacement = () => {};
  onProfile = () => {};
  onScanPlanet = (id: PlanetId) => {};
  private galaxyMap?: GalaxyMap;
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
 <header class="topbar"><div class="identity"><button id="profile" class="avatar" aria-label="Профиль и космический паспорт">${hudIcon("profile")}</button><div><div class="brand">LITTLE PLANETS <span>AURORA / EXPLORER</span></div><strong id="planet-name">Родная</strong><small id="planet-tag"></small></div></div><div class="top-buttons"><button id="first-person" title="Вид от первого лица" aria-label="Вид от первого лица">${hudIcon("view")}</button><button id="view" title="Камера" aria-label="Переключить камеру">${hudIcon("planet")}</button><button id="audio-toggle" title="Звук" aria-label="Включить или выключить звук">${hudIcon("audio")}</button><button id="settings" title="Настройки" aria-label="Настройки">${hudIcon("settings")}</button></div></header>

 <button id="mine-strike" class="mine-strike hidden" aria-label="Ударить киркой" title="Удерживайте, чтобы добывать">${hudIcon("pickaxe")}</button>
 <div id="combat-hud" class="combat-hud hidden"><span>${hudIcon("health")}<b id="health-value">100</b><small>ЦЕЛОСТНОСТЬ</small></span><div class="health-track"><i id="health-fill"></i></div><small id="equipped-label"></small></div><button id="attack" class="attack-button hidden" aria-label="Атаковать">${hudIcon("blaster")}<small>Атака</small></button>
 <div id="event-banner" class="event-banner hidden" role="status"></div><div id="context" class="context panel hidden"></div><div id="build-panel" class="build-panel panel hidden"></div>
 <div class="bottom"><nav id="menu-items" class="hidden" aria-label="Меню игры"><div class="nav-heading">СИСТЕМЫ КОЛОНИИ<span>01 — 07</span></div>${[
   ["inventory", "inventory", "Инвентарь", "Снаряжение и ресурсы"],
   ["craft", "craft", "Производство", "Чертежи и оборудование"],
   ["plant", "garden", "Биолаборатория", "Выращивание растений"],
   ["build", "build", "Строительство", "Архитектор колонии"],
   ["automation", "automation", "Автоматизация", "Роботы и маршруты"],
   ["galaxy", "galaxy", "Звёздная карта", "Планеты и навигация"],
   ["menu-settings", "settings", "Настройки", "Управление системами"],
 ]
   .map(
     ([id, icon, title, desc], i) =>
       `<button id="${id}"><span>${hudIcon(icon)}</span><strong>${title}<small>${desc}</small></strong><em>0${i + 1}</em></button>`,
   )
   .join(
     "",
   )}</nav><button id="menu-toggle" aria-label="Открыть меню" aria-expanded="false"><span>${hudIcon("menu")}</span><small>Системы</small></button><span class="save-status" id="save-status">${local ? "LOCAL" : "ONLINE"} · сохранено</span></div>
 <div id="joystick" aria-label="Джойстик движения"><span></span></div><div class="keyboard"><kbd>W A S D</kbd> движение <span>·</span> перетащите для обзора</div>
 <div id="placement-mode" class="placement-mode hidden"><span>${hudIcon("build")}</span><div><small>РАЗМЕЩЕНИЕ</small><strong id="placement-name"></strong></div><button id="cancel-placement" aria-label="Завершить размещение">${hudIcon("close")}</button></div>
 <div id="handbar" class="handbar" aria-label="Предмет в руках"></div><button id="underfoot" class="underfoot" title="Поставить блок под собой">${hudIcon("block")}<span>Под себя</span></button><div id="progress-hud" class="progress-hud"><button id="skills-button"></button><div><i id="xp-fill"></i></div><small id="day-clock"></small></div><div id="crosshair" class="crosshair hidden">+</div>
 <section id="zipline-hud" class="zipline-hud hidden"><span class="eyebrow">ГАРПУН / МЕЖПЛАНЕТНЫЙ ТРОС</span><h3 id="zipline-target"></h3><progress id="zipline-progress" max="1"></progress><p>Держимся за перекладину · перелёт по тросу</p><button id="zipline-cancel">Вернуться на исходную планету</button></section><div id="toast" role="status"></div>
 <div id="modal" class="modal hidden"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="window-title"><header class="window-header"><div class="window-brand">${hudIcon("galaxy")}<span>AURORA<strong>КОМАНДНЫЙ ИНТЕРФЕЙС</strong></span></div><div class="window-breadcrumb"><span>СИСТЕМЫ</span><b id="window-title">Колония</b></div><button class="close" id="close-modal" aria-label="Закрыть окно">${hudIcon("close")}</button></header><nav class="window-nav" aria-label="Разделы командного интерфейса">${[
   ["profile", "profile", "Паспорт"],
   ["inventory", "inventory", "Инвентарь"],
   ["craft", "craft", "Производство"],
   ["construction", "build", "Строительство"],
   ["automation", "automation", "Автоматизация"],
   ["galaxy", "galaxy", "Навигация"],
   ["settings", "settings", "Настройки"],
 ]
   .map(
     ([id, icon, name]) =>
       `<button data-window-nav="${id}" title="${name}">${hudIcon(icon)}<span>${name}</span></button>`,
   )
   .join(
     "",
   )}<div class="window-nav-status"><i></i>COLONY NETWORK</div></nav><div id="modal-content"></div><footer class="window-footer"><span><i></i><b id="window-save">Прогресс сохранён</b></span><small>ESC / ЗАКРЫТЬ</small></footer></section></div>
 <section id="space-hud" class="space-hud hidden"><header><span class="eyebrow">КОСМИЧЕСКИЙ ПОЛЁТ / CABIN</span><h3 id="space-target"></h3><div class="flight-readings"><span><small>ДО МАЯКА</small><b id="flight-distance"></b></span><span><small>СКОРОСТЬ</small><b id="flight-speed"></b></span></div><p id="flight-help"></p></header><div class="flight-actions"><button id="space-auto">Автопилот</button><button id="space-course">Выбрать курс</button><button id="space-land" class="primary" disabled>Посадка</button></div><div class="flight-thrust"><button id="flight-up" aria-label="Поднять нос">↑</button><button id="flight-down" aria-label="Опустить нос">↓</button><button id="flight-brake">Тормоз</button><button id="flight-boost">Ускорение</button></div><div class="flight-hint"><kbd>W / S</kbd> тяга <kbd>A / D</kbd> поворот <kbd>Q / E</kbd> тангаж <kbd>SPACE</kbd> тормоз</div><div id="flight-reticle" class="flight-reticle">◇</div></section>
 <div id="flight" class="flight hidden">${hudIcon("ship")}<h2 id="flight-title"></h2><p>Подготовка бортовых систем</p></div>`;
    document.querySelector("#app")!.append(this.root);
    for (const [id, callback] of [
      ["cancel-placement", () => this.onCancelPlacement()],
      ["profile", () => this.onProfile()],
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
    const strike = this.el("mine-strike");
    let strikeTimer: number | undefined;
    const stopStrike = () => {
      clearInterval(strikeTimer);
      strikeTimer = undefined;
      strike.classList.remove("striking");
    };
    strike.onpointerdown = (e) => {
      e.preventDefault();
      strike.setPointerCapture(e.pointerId);
      strike.classList.add("striking");
      this.onMineStrike();
      strikeTimer = window.setInterval(() => this.onMineStrike(), 420);
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      strike.addEventListener(event, stopStrike);
    window.addEventListener("blur", stopStrike);
    strike.onclick = (e) => {
      if (e.detail === 0) this.onMineStrike();
    };
    this.button("menu-toggle", () => this.toggleMenu());
    const navigate: Record<string, () => void> = {
      profile: () => this.onProfile(),
      inventory: () => this.onInventory(),
      craft: () => this.onCraftMenu(),
      construction: () => this.onBuild(),
      automation: () => this.onAutomation(),
      galaxy: () => this.onGalaxy(),
      settings: () => this.onSettings(),
    };
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-window-nav]")
      .forEach((b) => (b.onclick = () => navigate[b.dataset.windowNav!]()));

    this.el("modal").addEventListener("click", (e) => {
      if (e.target === this.el("modal")) this.close();
    });
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
    this.el("save-status").dataset.testing = String(save.freeConstruction);
    const p = PLANETS[save.planet];
    this.el("mine-strike").classList.toggle(
      "hidden",
      save.hand !== "pickaxe" ||
        !!save.inside ||
        !!save.flight ||
        !!save.grapple,
    );
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
            `<button data-hand="${h.id}" title="${h.name}${h.available ? "" : " · сначала создайте"}" aria-label="${h.name}" aria-pressed="${save.hand === h.id}" ${h.available ? "" : "disabled"}><small>${i + 1}</small><span>${hudIcon(h.id)}</span></button>`,
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
      ? "Жилой сектор / интерьер"
      : save.planet === "home"
        ? "Родная планета · база"
        : "Исследовательская планета · добыча";
    this.el("plant").classList.toggle("hidden", !!save.inside);
    this.el("galaxy").classList.toggle("hidden", !!save.inside);
    this.el("build").classList.remove("hidden");
    this.el("build").innerHTML =
      `<span>${hudIcon("build")}</span><strong>${save.inside ? "Мебель" : "Строительство"}<small>Архитектор колонии</small></strong><em>04</em>`;
    this.el("window-save").textContent =
      `Сохранено · ${new Date(save.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const combat = !!PLANETS[save.planet].hostile && !save.inside;
    this.el("combat-hud").classList.toggle("hidden", !combat);
    this.el("attack").classList.toggle(
      "hidden",
      !combat || save.hand === "pickaxe",
    );
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
  toggleMenu(open?: boolean) {
    const expanded = open ?? this.el("menu-items").classList.contains("hidden");
    this.el("menu-items").classList.toggle("hidden", !expanded);
    this.el("menu-toggle").setAttribute("aria-expanded", String(expanded));
    this.el("menu-toggle").querySelector("span")!.innerHTML = hudIcon(
      expanded ? "close" : "menu",
    );
  }
  get modalOpen() {
    return !this.el("modal").classList.contains("hidden");
  }
  get contextOpen() {
    return !this.el("context").classList.contains("hidden");
  }
  close() {
    this.galaxyMap?.dispose();
    this.galaxyMap = undefined;
    this.el("modal").classList.add("hidden");
    this.activeModal = null;
  }
  panel(html: string, section = "facility") {
    this.activeModal = null;
    this.show(html, section);
  }
  private show(html: string, section = this.activeModal ?? "facility") {
    this.root.dataset.window = section;
    const titles: Record<string, string> = {
      inventory: "Инвентарь",
      craft: "Производство",
      galaxy: "Навигация",
      construction: "Архитектор",
      automation: "Автоматизация",
      profile: "Паспорт",
      shipyard: "Верфь",
      ship: "Корабль",
      facility: "Объект колонии",
      settings: "Настройки",
      seeds: "Биолаборатория",
      skills: "Прогресс",
    };
    this.el("window-title").textContent = titles[section] ?? "Колония";
    this.root
      .querySelectorAll<HTMLElement>("[data-window-nav]")
      .forEach((b) =>
        b.setAttribute("aria-current", String(b.dataset.windowNav === section)),
      );

    this.galaxyMap?.dispose();
    this.galaxyMap = undefined;
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
    const items = Object.entries(save.inventory).filter(([, n]) => n > 0),
      shown = items.filter(
        ([id]) => group === "Все" || itemInfo(id).group === group,
      );
    const info = selected ? itemInfo(selected) : null;
    const itemName = (id: string) =>
      id.startsWith("ship:")
        ? (save.fleet.find((s) => s.id === id.slice(5))?.name ??
          itemInfo(id).name)
        : itemInfo(id).name;
    if (info) info.name = itemName(selected);
    this.show(
      `<span class="eyebrow">ЛИЧНЫЙ ИНВЕНТАРЬ</span><h2>Снаряжение и ресурсы</h2><div class="equipment-row"><div><small>ОРУЖИЕ</small><strong>${save.equipment.weapon ? GEAR[save.equipment.weapon].name : "Не надето"}</strong>${save.equipment.weapon ? '<button id="unequip-weapon">Снять</button>' : ""}</div><div><small>БРОНЯ</small><strong>${save.equipment.armor ? GEAR[save.equipment.armor].name : "Не надета"}</strong>${save.equipment.armor ? '<button id="unequip-armor">Снять</button>' : ""}</div><span>♥ ${save.health} / 100<br>Побед: ${save.kills}</span></div><div class="tabs">${["Все", "Ресурсы", "Семена", "Урожай", "Постройки", "Мебель", "Экипировка", "Машины", "Корабли"].map((g) => `<button data-inventory-tab="${g}" class="${g === group ? "active" : ""}">${g}</button>`).join("")}</div><div class="bag-layout"><div class="slots">${shown.map(([id, n]) => `<button class="slot ${id === selected ? "selected" : ""}" data-item="${escape(id)}" aria-label="${escape(itemName(id))}: ${n}" title="${escape(itemName(id))}">${art(id)}${id.startsWith("gear:") && Object.values(save.equipment).includes(id.split(":")[1] as GearKind) ? '<i class="equipped-mark">✓</i>' : ""}<b>${n}</b><small>${escape(itemName(id))}</small></button>`).join("")}${'<div class="slot empty"></div>'.repeat(Math.max(0, 24 - shown.length))}</div><aside class="item-detail">${info ? `${selected.startsWith("gear:") ? illustration(selected) : art(selected)}<small>${info.group}</small><h3>${escape(info.name)}</h3><p>В рюкзаке: <b>${save.inventory[selected] ?? 0}</b></p>${selected.startsWith("gear:") ? `<p>${GEAR[selected.split(":")[1] as GearKind].description}</p><button id="equip-item" class="primary">Надеть</button>` : selected.startsWith("kit:") || selected.startsWith("furniture:") || selected.startsWith("device:") || selected.startsWith("ship:") ? `<button id="place-item" class="primary" ${save.inventory[selected] > 0 ? "" : "disabled"}>Разместить</button>` : '<p class="muted">Ресурсы расходуются по рецептам. Семена сажаются в свободную грядку своего биома.</p>'}` : `<span class="bag-icon">${hudIcon("inventory")}</span><h3>Всё под рукой</h3><p>Выберите предмет, чтобы увидеть его название и действие.</p>`}</aside></div><footer class="bag-footer">${items.length} типов предметов · общий инвентарь всех планет</footer>`,
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
      `<div class="workshop-heading"><span class="eyebrow">МАСТЕРСКАЯ ПУТЕШЕСТВЕННИКА · ПОЛЕВОЙ КАТАЛОГ</span><h2>Производственный каталог</h2><p>Чертежи, оборудование и модули вашей колонии.</p></div><div class="tabs">${["Все", "Оружие", "Броня", "База", "Модули", "Мебель", "Семена"].map((g) => `<button data-craft-tab="${g}" class="${g === group ? "active" : ""}">${g}</button>`).join("")}</div><div class="craft-layout"><div class="recipe-grid">${list.map((r) => `<button data-recipe="${r.id}" class="recipe ${r.id === recipe?.id ? "selected" : ""}">${illustration(r.id)}<div class="recipe-caption"><small>${r.group}</small><strong>${r.name}</strong><span>${r.lab ? "Лаборатория" : "Полевой рецепт"} ↗</span></div></button>`).join("")}</div><aside class="recipe-detail">${recipe ? `${illustration(recipe.id)}<span class="eyebrow">${recipe.group} · РЕЦЕПТ</span><h3>${recipe.name}</h3><p>${recipe.description}</p><div class="recipe-cost">${costs(recipe.cost, save)}</div>${recipe.lab && !hasLab(save) ? '<p class="locked">🔬 Сначала постройте лабораторию</p>' : ""}<button id="craft-one" class="primary" ${canAfford(save, recipe.cost) && (!recipe.lab || hasLab(save)) ? "" : "disabled"}>Создать ×1</button><small>Готовый предмет попадёт в рюкзак.</small>` : "<p>Рецептов пока нет.</p>"}</aside></div>`,
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
      `<span class="eyebrow">СВОБОДНАЯ ГРЯДКА</span><h2>Посевной модуль</h2><div class="seed-options">${PLANETS[
        save.planet
      ].plants
        .map((id) => {
          const p = PLANTS[id],
            n = save.inventory[`seed:${id}`] ?? 0;
          return `<button data-seed="${id}" ${n ? "" : "disabled"}><span>${art(`seed:${id}`)}</span><strong>${p.name}</strong><small>${p.seconds} сек. · ${n} семян</small><b>Посадить ↗</b></button>`;
        })
        .join("")}</div>`,
      "seeds",
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
        return `<button data-placement="${id}" class="${id === kind ? "selected" : ""}"><span>${hudIcon(id)}</span><strong>${r.name}</strong><small>${save.inventory[`${inside ? "furniture" : "kit"}:${id}`] ?? 0} готово</small></button>`;
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
    if (save.flight) this.travelMode = "ship";
    this.activeModal = "galaxy";
    this.galaxyQuery = query;
    this.show(
      `<span class="eyebrow">AURORA / STELLAR CARTOGRAPHY</span><h2>Звёздная сеть</h2><label class="travel-selector">Способ путешествия<select id="travel-mode"><option value="ship" ${this.travelMode === "ship" ? "selected" : ""}>Корабль</option><option value="grapple" ${save.flight ? "disabled" : ""} ${this.travelMode === "grapple" ? "selected" : ""}>Гарпун и трос</option></select></label><div id="galaxy-network"></div>`,
    );
    this.galaxyMap = new GalaxyMap(
      this.el("galaxy-network"),
      save,
      (id) => this.onScanPlanet(id),
      (id) =>
        this.travelMode === "grapple" ? this.onGrapple(id) : this.onTravel(id),
    );
    (this.el("travel-mode") as HTMLSelectElement).onchange = () => {
      this.travelMode = (this.el("travel-mode") as HTMLSelectElement).value as
        "ship" | "grapple";
    };
  }
  placementMode(title: string | null) {
    this.el("placement-mode").classList.toggle("hidden", !title);
    this.el("placement-name").textContent = title ?? "";
  }
  shipDock(save: Save) {
    const dock = save.worlds[save.planet].launchPad;
    if (dock?.shipId === null) {
      this.panel(
        `<span class="eyebrow">ВЗЛЁТНАЯ ПЛОЩАДКА</span><h2>Площадка свободна</h2><p>Разместите корабль из инвентаря или создайте новый на верфи.</p><button id="dock-inventory" class="primary">Открыть корабли в инвентаре</button>`,
        "ship",
      );
      this.button("dock-inventory", () => this.inventory(save, "Корабли"));
      return;
    }

    this.travelMode = "ship";
    this.hideContext();
    const ship = save.fleet.find(
        (s) => s.id === (dock?.shipId ?? save.activeShip),
      )!,
      stats = SHIP_STATS(ship);
    this.panel(
      `<span class="eyebrow">ПОСАДОЧНАЯ ПЛОЩАДКА / БОРТОВЫЕ СИСТЕМЫ</span><h2>${escape(ship.name)}</h2><div class="ship-dock"><div class="dock-vessel">${hudIcon("ship")}<span>MK ${ship.model} / ${SHIP_CLASS_NAMES[ship.class]}</span></div><section><div class="status-tag">ГОТОВ К ВЫЛЕТУ</div><h3>Ваша кабина готова</h3><p>Садитесь за штурвал для ручного полёта или выберите планету назначения на звёздной карте.</p><div class="metric-strip"><span>Класс<b>${SHIP_CLASS_NAMES[ship.class]}</b></span><span>Скорость<b>${stats.speed} м/с</b></span></div><button id="board-ship" class="primary">${hudIcon("ship")}Войти в кабину</button><button id="ship-route">${hudIcon("galaxy")}Выбрать маршрут</button></section></div>`,
      "ship",
    );
    this.button("board-ship", () => this.onBoardShip());
    this.button("ship-route", () => {
      this.travelMode = "ship";
      this.galaxy(save);
    });
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
      "skills",
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
      `<span class="eyebrow">НАСТРОЙКИ</span><h2>Настройки системы</h2><p>WASD или джойстик — движение. Нажмите объект для действия. Потяните мир для поворота; колесо или щипок — масштаб.</p><button id="full" class="primary">На весь экран</button><button id="quality" class="secondary">Переключить качество</button><div class="sound-controls"><h3>Звук путешествия</h3><label><input id="music-enabled" type="checkbox" ${audio.music ? "checked" : ""}> Музыка</label><label><input id="effects-enabled" type="checkbox" ${audio.effects ? "checked" : ""}> Звуковые эффекты</label><label>Громкость <input id="sound-volume" type="range" min="0" max="1" step="0.05" value="${audio.volume}"></label><p>Музыка запускается после первого нажатия. В фоне звук приостанавливается.</p></div>`,
      "settings",
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
    this.el("space-land").classList.toggle("hidden", !info.allowed);
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
