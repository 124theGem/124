import {
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
        `<span class="cost ${(save.inventory[r] ?? 0) < n ? "short" : ""}" title="${escape(itemInfo(r).name)}">${art(r)}<b>${n}</b><small>/${save.inventory[r] ?? 0}</small></span>`,
    )
    .join("");
export class UI {
  readonly root = document.createElement("div");
  onInventory = () => {};
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
  private activeModal: "inventory" | "craft" | null = null;
  constructor(readonly local: boolean) {
    this.root.className = "hud";
    this.root.innerHTML = `
 <header class="topbar"><div class="identity"><div class="avatar">🧑‍🚀</div><div><div class="brand">LITTLE PLANETS <span>✦ COLONY</span></div><strong id="planet-name">Родная</strong><small id="planet-tag"></small></div></div><div class="resources" id="resource-strip"></div><div class="top-buttons"><button id="view" title="Камера" aria-label="Переключить камеру">🌐</button><button id="settings" title="Настройки" aria-label="Настройки">⚙</button></div></header>
 <aside class="minimap panel"><header><strong id="map-label">КАРТА</strong><span>С</span></header><canvas id="minimap" width="240" height="240" aria-label="Мини-карта планеты"></canvas><footer><i class="player-dot"></i> вы <span id="map-size"></span></footer></aside>
 <div id="event-banner" class="event-banner hidden" role="status"></div><div id="context" class="context panel hidden"></div><div id="build-panel" class="build-panel panel hidden"></div>
 <div class="bottom"><span class="save-status" id="save-status">${local ? "Локальный мир · сохранено" : "Telegram · сохранено"}</span><nav><button id="inventory"><span>🎒</span>Рюкзак</button><button id="craft"><span>🛠️</span>Крафт</button><button id="plant"><span>🌱</span>Сад</button><button id="build"><span>🏗️</span>Строить</button><button id="galaxy"><span>🚀</span>Полёт</button></nav></div>
 <div id="joystick" aria-label="Джойстик движения"><span></span></div><div class="keyboard">WASD · движение <b> / </b> колесо · масштаб <b> / </b> потяните · поворот</div>
 <div id="toast" role="status"></div><div id="modal" class="modal hidden"><section class="sheet"><button class="close" id="close-modal" aria-label="Закрыть окно">×</button><div id="modal-content"></div></section></div>
 <div id="flight" class="flight hidden"><span>🚀</span><h2 id="flight-title"></h2><p>Ваш маленький мир всегда ждёт возвращения</p></div>`;
    document.querySelector("#app")!.append(this.root);
    for (const [id, callback] of [
      ["inventory", () => this.onInventory()],
      ["plant", () => this.onPlant()],
      ["build", () => this.onBuild()],
      ["galaxy", () => this.onGalaxy()],
      ["view", () => this.onCamera()],
      ["settings", () => this.onSettings()],
      ["craft", () => this.onCraftMenu()],
      ["close-modal", () => this.close()],
    ] as const)
      this.button(id, callback);
    this.el("minimap").addEventListener("click", () => this.onCamera());
  }
  el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  button(id: string, callback: () => void) {
    this.el(id).addEventListener("click", callback);
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
    this.el("planet-name").textContent = save.inside ? "Главный дом" : p.name;
    this.el("planet-tag").textContent = save.inside
      ? "Уют начинается с вас"
      : save.planet === "home"
        ? "Родная планета · база"
        : "Исследовательская планета · добыча";
    this.el("resource-strip").innerHTML = ["wood", "stone", "crystal"]
      .map(
        (r) =>
          `<span title="${RESOURCE_LABELS[r]}">${art(r)}<b>${save.inventory[r] ?? 0}</b><small>${RESOURCE_LABELS[r]}</small></span>`,
      )
      .join("");
    this.el("plant").classList.toggle("hidden", !!save.inside);
    this.el("galaxy").classList.toggle("hidden", !!save.inside);
    this.el("build").innerHTML =
      `<span>${save.inside ? "🪑" : "🏗️"}</span>${save.inside ? "Мебель" : "Строить"}`;
    this.el("map-label").textContent = save.inside
      ? "ГЛАВНЫЙ ДОМ"
      : "МИНИ-КАРТА";
    this.el("map-size").textContent = save.inside
      ? "12 × 10"
      : `${planetSize(save.planet)} × ${planetSize(save.planet)}`;
    const event = save.inside ? null : worldEvent(save, save.planet, now),
      banner = this.el("event-banner");
    banner.classList.toggle("hidden", !event);
    if (event)
      banner.textContent =
        event.type === "wind"
          ? "💨 Сильный ветер · облака над планетой"
          : now < event.impactAt
            ? "☄️ Приближается метеорит"
            : event.claimed
              ? "☄️ Метеорит исследован"
              : "☄️ Метеорит упал · найдите его на мини-карте";
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
      depth = save.inside ? ROOM.depth : width,
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
    ctx.fillStyle = "#091a2b";
    ctx.fillRect(0, 0, 240, 240);
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
  private show(html: string) {
    this.el("modal-content").innerHTML = html;
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
      `<span class="eyebrow">ЛИЧНЫЙ ИНВЕНТАРЬ</span><h2>Рюкзак путешественника</h2><div class="tabs">${["Все", "Ресурсы", "Семена", "Урожай", "Постройки", "Мебель"].map((g) => `<button data-inventory-tab="${g}" class="${g === group ? "active" : ""}">${g}</button>`).join("")}</div><div class="bag-layout"><div class="slots">${shown.map(([id, n]) => `<button class="slot ${id === selected ? "selected" : ""}" data-item="${escape(id)}" aria-label="${escape(itemInfo(id).name)}: ${n}" title="${escape(itemInfo(id).name)}">${art(id)}<b>${n}</b><small>${escape(itemInfo(id).name)}</small></button>`).join("")}${'<div class="slot empty"></div>'.repeat(Math.max(0, 24 - shown.length))}</div><aside class="item-detail">${info ? `${art(selected)}<small>${info.group}</small><h3>${escape(info.name)}</h3><p>В рюкзаке: <b>${save.inventory[selected] ?? 0}</b></p>${selected.startsWith("kit:") || selected.startsWith("furniture:") ? '<button id="place-item" class="primary">Разместить</button>' : '<p class="muted">Ресурсы расходуются по рецептам. Семена сажаются в свободную грядку своего биома.</p>'}` : '<span class="bag-icon">🎒</span><h3>Всё под рукой</h3><p>Выберите предмет, чтобы увидеть его название и действие.</p>'}</aside></div><footer class="bag-footer">${items.length} типов предметов · общий инвентарь всех планет</footer>`,
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
      `<span class="eyebrow">МАСТЕРСКАЯ КОЛОНИИ</span><h2>Крафт и рецепты</h2><div class="tabs">${["Все", "База", "Модули", "Мебель", "Семена"].map((g) => `<button data-craft-tab="${g}" class="${g === group ? "active" : ""}">${g}</button>`).join("")}</div><div class="craft-layout"><div class="recipe-grid">${list.map((r) => `<button data-recipe="${r.id}" class="recipe ${r.id === recipe?.id ? "selected" : ""}">${art(r.id)}<strong>${r.name}</strong><small>${r.group}</small><b>${save.inventory[r.id] ?? 0} в рюкзаке</b></button>`).join("")}</div><aside class="recipe-detail">${recipe ? `${art(recipe.id)}<h3>${recipe.name}</h3><p>${recipe.description}</p><div class="recipe-cost">${costs(recipe.cost, save)}</div>${recipe.lab && !hasLab(save) ? '<p class="locked">🔬 Сначала постройте лабораторию</p>' : ""}<button id="craft-one" class="primary" ${canAfford(save, recipe.cost) && (!recipe.lab || hasLab(save)) ? "" : "disabled"}>Создать ×1</button><small>Готовый предмет попадёт в рюкзак.</small>` : "<p>Рецептов пока нет.</p>"}</aside></div>`,
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
    panel.innerHTML = `<span class="eyebrow">${inside ? "ОБУСТРОЙСТВО ДОМА" : save.planet === "home" ? "СТРОИТЕЛЬСТВО БАЗЫ" : "ДОБЫЧА НА ПЛАНЕТЕ"}</span><h3>${inside ? "Расставим мебель" : save.planet === "home" ? "Новый уголок колонии" : "Поставим добывающий модуль"}</h3><div class="build-choices">${items
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
  galaxy(save: Save) {
    this.activeModal = null;
    this.show(
      `<span class="eyebrow">ДОМ И ДАЛЬНИЕ МИРЫ</span><h2>Куда полетим?</h2><p>Родная — база колонии. Другие планеты — исследования и добыча.</p><div class="planet-cards">${Object.values(
        PLANETS,
      )
        .map(
          (p) =>
            `<button data-planet="${p.id}" ${p.id === save.planet ? "disabled" : ""} style="--planet:${p.color}"><div class="mini-planet">${p.icon}</div><strong>${p.name}</strong><small>${p.description}</small><em>${planetSize(p.id)} × ${planetSize(p.id)} · ${p.id === "home" ? "база" : "добыча"}</em><b>${p.id === save.planet ? "Вы здесь" : "Отправиться ↗"}</b></button>`,
        )
        .join("")}</div>`,
    );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-planet]")
      .forEach(
        (b) => (b.onclick = () => this.onTravel(b.dataset.planet as PlanetId)),
      );
  }
  settings(fullscreen: () => void, quality: () => void) {
    this.activeModal = null;
    this.show(
      '<span class="eyebrow">НАСТРОЙКИ</span><h2>Ваш маленький космос</h2><p>WASD или джойстик — движение. Нажмите объект для действия. Потяните мир для поворота; колесо или щипок — масштаб.</p><button id="full" class="primary">На весь экран</button><button id="quality" class="secondary">Переключить качество</button>',
    );
    this.button("full", fullscreen);
    this.button("quality", quality);
  }
  flight(name: string, show: boolean) {
    this.el("flight-title").textContent = `Курс на ${name}`;
    this.el("flight").classList.toggle("hidden", !show);
  }
}
