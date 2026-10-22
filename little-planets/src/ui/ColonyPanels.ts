import { ShipPreview } from "./ShipPreview";
import {
  SHIP_LIVERIES,
  SHIP_ENGINES,
  SHIP_MODULES,
  SHIP_FINISHES,
  shipConfiguration,
} from "../../shared/ships";
import { hudIcon } from "./Glyphs";
import { UI } from "./UI";
import {
  BUILDINGS,
  PLANETS,
  PLANET_COMPOSITION,
  RESOURCE_LABELS,
  type PlanetId,
} from "../../shared/catalog";
import {
  moduleAmount,
  type Save,
  type Action,
  type Building,
} from "../../shared/model";
import {
  constellationName,
  scannerRange,
  upgradeCost,
} from "../../shared/sector";
import {
  SHIP_CLASS_NAMES,
  SHIP_COLORS,
  SHIP_STATS,
  shipCost,
  type Starship,
  type ShipClass,
} from "../../shared/ships";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const resources = (values: Record<string, number>) =>
  Object.entries(values)
    .filter(([, n]) => n > 0)
    .map(
      ([id, n]) => `<span>${RESOURCE_LABELS[id] ?? esc(id)} <b>${n}</b></span>`,
    )
    .join("") || "<small>Пусто</small>";
export class ColonyPanels {
  private selectedBuilding = "";
  constructor(
    private ui: UI,
    private state: () => Save,
    private act: (a: Action) => Promise<void>,
    private automation: (id?: string) => void,
    private refreshScene: () => void,
  ) {}
  private async run(action: Action, next: () => void) {
    const buttons = this.ui
      .el("modal-content")
      .querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLSelectElement
      >("button, input, select");
    buttons.forEach((b) => (b.disabled = true));
    try {
      await this.act(action);
      this.refreshScene();
      next();
    } catch (e) {
      this.ui.toast((e as Error).message);
      next();
    }
  }
  building(id: string) {
    this.selectedBuilding = id;
    const save = this.state(),
      world = save.worlds[save.planet],
      b = world.buildings.find((b) => b.id === id);
    if (!b) return;
    if (b.kind === "telescope") {
      this.ui.panel(
        `<span class="eyebrow">ОПТИЧЕСКАЯ ОБСЕРВАТОРИЯ</span><h2>Орбитальный телескоп</h2><p>Выберите мир из списка или найдите сигнал на карте. Перетаскивайте изображение для обзора со всех сторон; колесо и кнопки меняют увеличение.</p><div class="telescope-targets">${save.discovered.map((p) => `<button data-observe="${p}">${esc(PLANETS[p].name)} · ${esc(PLANETS[p].tag)}</button>`).join("")}</div><button id="telescope-map">Выбрать на звёздной карте</button>`,
        "telescope",
      );
      this.ui
        .el("modal-content")
        .querySelectorAll<HTMLButtonElement>("[data-observe]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              this.ui.onObservePlanet(b.dataset.observe as PlanetId)),
        );
      this.ui.button("telescope-map", () => this.ui.galaxy(this.state()));
      return;
    }
    if (b.kind === "shipyard") {
      this.shipyard(id);
      return;
    }
    const def = BUILDINGS[b.kind],
      limit = b.kind === "scanner" ? 10 : b.kind === "planetdrill" ? 5 : 1,
      level = b.level ?? 1;
    this.ui.panel(
      `<span class="eyebrow">УПРАВЛЕНИЕ ОБЪЕКТОМ · ${esc(PLANETS[save.planet].name)}</span><h2>${def.name}</h2><div class="facility-summary"><div class="facility-symbol">${hudIcon(b.kind)}</div><div><strong>${limit > 1 ? `УРОВЕНЬ ${level} / ${limit}` : "ОБЪЕКТ В СЕТИ"}</strong><p>${def.description}</p></div></div>${b.kind === "scanner" ? `<div class="metric-strip"><span>Дальность<b>${scannerRange(level)}</b></span><span>Исследовано<b>${save.scans.length}</b></span><span>Созвездий<b>61</b></span></div><button id="facility-map" class="primary">Открыть карту сканирования</button>` : ""}${b.kind === "planetdrill" ? `<div class="metric-strip"><span>Выход / сек<b>${level * level * 2}</b></span><span>Всего добыто<b id="drill-produced">${b.produced ?? 0}</b></span><span>Высота<b>${[0, 5.8, 8, 12, 17, 23][level]} м</b></span></div><h3>Спектр извлечения</h3><div class="scan-resources">${PLANET_COMPOSITION[save.planet].map((r) => `<div><span>${RESOURCE_LABELS[r.resource]}</span><b>${r.percent}%</b><i style="width:${r.percent}%;--bar:#7de3d2"></i></div>`).join("")}</div><h3>Местный склад / резерв станции</h3><div class="resource-chips" id="drill-stock">${resources(world.stock)}${resources(b.buffer ?? {})}</div><button id="facility-logistics">Склад и логистика</button>` : ""}${limit > 1 ? `<div class="upgrade-track">${Array.from({ length: limit }, (_, i) => `<i class="${i < level ? "filled" : ""}"></i>`).join("")}</div><button id="facility-upgrade" ${level >= limit ? "disabled" : ""}>${level >= limit ? "Максимальный уровень" : `Улучшить до ${level + 1} · ${save.freeConstruction ? "0 ресурсов · TEST" : resources(upgradeCost(b))}`}</button>` : ""}${b.kind === "headquarters" ? '<button id="facility-enter" class="primary">Войти в главный дом</button>' : ""}${b.resource ? `<p>Готово к сбору: ${moduleAmount(save, b, Date.now())} ${RESOURCE_LABELS[b.resource]}</p><button id="facility-collect">Забрать ресурсы</button>` : ""}${b.kind === "warehouse" ? `<h3>Запасы планеты</h3><div class="resource-chips">${resources(world.stock)}</div><button id="facility-logistics">Открыть склад</button>` : ""}${b.kind === "laboratory" ? '<button id="facility-craft">Открыть производственные чертежи</button>' : ""}${b.kind === "greenhouse" ? "<p>Теплица обеспечивает укрытие для сада. Для посадки выберите грядку рядом с персонажем.</p>" : ""}${b.kind === "house" ? "<p>Жилой модуль колонии. Каменные стены, автономное питание и живая крыша.</p>" : ""}`,
    );
    if (limit > 1 && level < limit)
      this.ui.button(
        "facility-upgrade",
        () =>
          void this.run({ type: "upgradeBuilding", id }, () =>
            this.building(id),
          ),
      );
    if (b.kind === "scanner")
      this.ui.button("facility-map", () => this.ui.galaxy(this.state()));
    if (this.ui.el("facility-logistics"))
      this.ui.button("facility-logistics", () =>
        this.automation(
          save.automation.devices.find(
            (d) => d.kind === "warehouse" && d.planet === save.planet,
          )?.id,
        ),
      );
    if (b.kind === "headquarters")
      this.ui.button(
        "facility-enter",
        () => void this.run({ type: "enter", id }, () => this.ui.close()),
      );
    if (b.resource)
      this.ui.button(
        "facility-collect",
        () => void this.run({ type: "collect", id }, () => this.building(id)),
      );
    if (b.kind === "laboratory")
      this.ui.button("facility-craft", () => this.ui.craft(this.state()));
  }
  refresh() {
    if (!this.ui.modalOpen || !this.ui.el("drill-produced")) return;
    const s = this.state(),
      w = s.worlds[s.planet],
      b = w.buildings.find((b) => b.id === this.selectedBuilding);
    if (!b) return;
    this.ui.el("drill-produced").textContent = String(b.produced ?? 0);
    this.ui.el("drill-stock").innerHTML =
      resources(w.stock) + resources(b.buffer ?? {});
  }
  shipyard(id: string, draft?: Omit<Starship, "id">) {
    const save = this.state(),
      active = save.fleet.find((s) => s.id === save.activeShip)!;
    const design = shipConfiguration({
      ...(draft ?? {
        name: "Новый корабль",
        class: "exploration",
        model: 1,
        hull: "needle",
        wings: "swept",
        color: "ivory",
      }),
      id: "preview",
    } as Starship);
    const baseline = SHIP_STATS(active);
    const options = (items: Record<string, string>, selected: string) =>
      Object.entries(items)
        .map(
          ([v, label]) =>
            `<option value="${v}" ${v === selected ? "selected" : ""}>${label}</option>`,
        )
        .join("");
    const select = (
      name: string,
      label: string,
      items: Record<string, string>,
      selected: string,
    ) =>
      `<label class="ship-field"><span>${label}</span><select id="ship-${name}">${options(items, selected)}</select></label>`;
    const names = (items: Record<string, { name: string }>) =>
      Object.fromEntries(
        Object.entries(items).map(([id, value]) => [id, value.name]),
      );
    this.ui.panel(
      `
      <header class="dock-heading"><div><span class="eyebrow">AURORA INDUSTRIES / ORBITAL DIVISION</span><h2>Ваш следующий горизонт.</h2><p>Модульная верфь <span>№ 07</span> · Родная / Колыбель</p></div><span class="dock-status"><i></i> ВЕРФЬ ГОТОВА</span></header>
      <div class="shipyard-layout">
        <aside class="dock-catalog"><span class="eyebrow">01 / НАЗНАЧЕНИЕ</span>${Object.entries(
          SHIP_CLASS_NAMES,
        )
          .map(
            ([kind, label], i) =>
              `<button type="button" class="ship-class-card ${kind === design.class ? "active" : ""}" data-ship-class="${kind}"><span class="ship-class-number">0${i + 1}</span>${hudIcon(kind === "combat" ? "combat" : kind === "cargo" ? "inventory" : "ship")}<strong>${label}</strong><small>${["Откройте новые миры", "Защитите свои маршруты", "Свяжите колонии"][i]}</small></button>`,
          )
          .join(
            "",
          )}<div class="dock-note"><span class="eyebrow">ПРОИЗВОДСТВО</span><p>Готовый корабль появится в инвентаре. Разместите его вместе со взлётной площадкой.</p></div></aside>
        <section class="ship-preview"><div class="preview-heading"><span><i></i> LIVE / 3D ASSEMBLY</span><b id="preview-name">${esc(design.name)}</b></div><div id="ship-stage" class="ship-stage"></div><div class="preview-toolbar"><span>Перетащите для вращения · щипок для масштаба</span><button type="button" id="ship-zoom-out" aria-label="Отдалить корабль">−</button><button type="button" id="ship-zoom-in" aria-label="Приблизить корабль">+</button><button type="button" id="ship-reset-view">Сбросить вид</button></div><div id="ship-metrics" class="ship-metrics"></div></section>
        <form id="ship-form" class="dock-configuration"><span class="eyebrow">02 / КОНФИГУРАЦИЯ</span><label class="ship-field"><span>Позывной</span><input id="ship-name" maxlength="40" value="${esc(design.name)}" autocomplete="off"></label>
        ${select("class", "Класс", SHIP_CLASS_NAMES, design.class)}
        ${select("model", "Платформа", { "1": "MK I · Pathfinder", "2": "MK II · Vanguard", "3": "MK III · Horizon" }, String(design.model))}
        <div class="dock-divider">КОНСТРУКЦИЯ</div>
        ${select("hull", "Фюзеляж", { needle: "Стрела / обтекаемый", armored: "Цитадель / бронированный", freighter: "Атлас / транспортный" }, design.hull)}
        ${select("wings", "Крылья", { swept: "Стреловидные", delta: "Дельта", twin: "Двойной киль" }, design.wings)}
        ${select("engine", "Силовая установка", names(SHIP_ENGINES), design.engine)}
        ${select("module", "Функциональный модуль", names(SHIP_MODULES), design.module)}
        <p id="ship-module-note" class="configuration-note"></p><div class="dock-divider">МАТЕРИАЛЫ И ОКРАСКА</div>
        ${select("finish", "Покрытие корпуса", names(SHIP_FINISHES), design.finish)}
        ${select("livery", "Ливрея / оператор", names(SHIP_LIVERIES), design.livery)}
        ${select("color", "Палитра", { ivory: "Полярный белый", graphite: "Графит", cobalt: "Кобальт", ember: "Оксид меди", emerald: "Изумруд" }, design.color)}
        <div class="ship-swatches">${Object.entries(SHIP_COLORS)
          .map(
            ([c, value]) =>
              `<button type="button" data-ship-color="${c}" style="--swatch:#${value.toString(16).padStart(6, "0")}" aria-label="Окраска ${c}" aria-pressed="${design.color === c}"></button>`,
          )
          .join("")}</div>
        <div class="fabrication-order"><span>Стоимость сборки<b>${save.freeConstruction ? "0 ресурсов" : resources(shipCost(design))}</b></span><small>${save.freeConstruction ? "ТЕСТОВЫЙ ДОПУСК / БЕСПЛАТНО" : "Материалы из инвентаря"}</small><button type="button" id="save-ship-design">Сохранить проект</button><button type="button" id="create-ship" class="primary">${hudIcon("ship")} Создать в инвентарь <span>↗</span></button></div></form>
      </div><div class="blueprint-list">${save.shipBlueprints.map((s) => `<button data-blueprint="${esc(s.id)}">Загрузить проект · ${esc(s.name)}</button>`).join("")}</div><div class="fleet-heading"><span class="eyebrow">03 / ВАШ АНГАР</span><small>${save.fleet.length} / 30 кораблей</small></div><div class="fleet-list">${save.fleet.map((s) => `<button data-ship-inventory="${esc(s.id)}">${hudIcon("ship")}<strong>${esc(s.name)}</strong><small>${SHIP_CLASS_NAMES[s.class]} · MK ${s.model} · ${save.inventory[`ship:${s.id}`] > 0 ? "В ИНВЕНТАРЕ / РАЗМЕСТИТЬ" : "НА ПЛОЩАДКЕ"}</small></button>`).join("")}</div>`,
      "shipyard",
    );
    const preview = new ShipPreview(this.ui.el("ship-stage"), design);
    this.ui.ownPanel(() => preview.dispose());
    const read = (): Omit<Starship, "id"> => ({
      name:
        (this.ui.el("ship-name") as HTMLInputElement).value.trim() ||
        "Без имени",
      class: (this.ui.el("ship-class") as HTMLSelectElement).value as ShipClass,
      model: Number((this.ui.el("ship-model") as HTMLSelectElement).value) as
        | 1
        | 2
        | 3,
      hull: (this.ui.el("ship-hull") as HTMLSelectElement)
        .value as Starship["hull"],
      wings: (this.ui.el("ship-wings") as HTMLSelectElement)
        .value as Starship["wings"],
      color: (this.ui.el("ship-color") as HTMLSelectElement)
        .value as Starship["color"],
      engine: (this.ui.el("ship-engine") as HTMLSelectElement)
        .value as Starship["engine"],
      module: (this.ui.el("ship-module") as HTMLSelectElement)
        .value as Starship["module"],
      livery: (this.ui.el("ship-livery") as HTMLSelectElement)
        .value as Starship["livery"],
      finish: (this.ui.el("ship-finish") as HTMLSelectElement)
        .value as Starship["finish"],
    });
    const update = (rebuild = true) => {
      const d = { ...read(), id: "preview" },
        stats = SHIP_STATS(d);
      if (rebuild) preview.setDesign(d);
      this.ui.el("preview-name").textContent = d.name;
      this.ui.el("ship-metrics").innerHTML = (
        [
          ["speed", "СКОРОСТЬ", "м/с"],
          ["cargo", "ТРЮМ", "ед."],
          ["armor", "БРОНЯ", "HP"],
          ["mass", "МАССА", "т"],
        ] as const
      )
        .map(([key, label, unit]) => {
          const delta = stats[key] - baseline[key];
          return `<div><small>${label}</small><strong>${stats[key]}<em>${unit}</em></strong><span class="${(key === "mass" ? delta <= 0 : delta >= 0) ? "positive" : "negative"}">${delta > 0 ? "+" : ""}${delta} к активному кораблю</span></div>`;
        })
        .join("");
      this.ui.el("ship-module-note").textContent =
        `${SHIP_ENGINES[d.engine ?? "ion"].description}. ${SHIP_MODULES[d.module ?? "standard"].description}. Масса ${stats.mass} т.`;
      this.ui
        .el("modal-content")
        .querySelectorAll<HTMLElement>("[data-ship-class]")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.shipClass === d.class),
        );
      this.ui
        .el("modal-content")
        .querySelectorAll<HTMLElement>("[data-ship-color]")
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            String(b.dataset.shipColor === d.color),
          ),
        );
    };
    this.ui.el("ship-form").onsubmit = (e) => e.preventDefault();
    for (const name of [
      "class",
      "model",
      "hull",
      "wings",
      "engine",
      "module",
      "finish",
      "livery",
      "color",
    ])
      this.ui.el("ship-" + name).onchange = () => update();
    this.ui.el("ship-name").onchange = () => update();
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLButtonElement>(
        "[data-ship-class], [data-ship-color]",
      )
      .forEach(
        (b) =>
          (b.onclick = () => {
            const field = b.dataset.shipClass ? "class" : "color";
            (this.ui.el("ship-" + field) as HTMLSelectElement).value =
              b.dataset.shipClass ?? b.dataset.shipColor!;
            update();
          }),
      );
    this.ui.button(
      "save-ship-design",
      () =>
        void this.run({ type: "saveShipDesign", ship: read() }, () =>
          this.shipyard(id, read()),
        ),
    );
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLButtonElement>("[data-blueprint]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const project = this.state().shipBlueprints.find(
              (p) => p.id === b.dataset.blueprint,
            );
            if (project) this.shipyard(id, project);
          }),
      );
    this.ui.button("ship-zoom-in", () => preview.zoom(0.8));
    this.ui.button("ship-zoom-out", () => preview.zoom(1.25));
    this.ui.button("ship-reset-view", () => preview.reset());
    this.ui.button("create-ship", () => {
      const ship = read();
      void this.run({ type: "createShip", ship }, () =>
        this.shipyard(id, ship),
      );
    });
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLButtonElement>("[data-ship-inventory]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            this.ui.inventory(
              this.state(),
              "Корабли",
              `ship:${b.dataset.shipInventory}`,
            )),
      );
    update(false);
  }

  profile(name: string) {
    const s = this.state(),
      visits = Object.entries(s.profile.visits).sort(
        (a, b) =>
          b[1].seconds +
          b[1].arrivals * 10 -
          (a[1].seconds + a[1].arrivals * 10),
      ),
      constellations = new Map<string, number>();
    for (const [p, v] of visits) {
      const n = constellationName(p as PlanetId);
      constellations.set(
        n,
        (constellations.get(n) ?? 0) + v.seconds + v.arrivals * 10,
      );
    }
    this.ui.panel(
      `<span class="eyebrow">ЛИЧНОЕ ДЕЛО · COLONIAL REGISTRY</span><h2>Профиль путешественника</h2><div class="space-passport"><div class="passport-band">AURORA / INTERSTELLAR CITIZEN</div><div class="passport-main"><div class="passport-photo">◈<small>EXPLORER</small></div><div><small>КОСМИЧЕСКИЙ ПАСПОРТ</small><h3>${esc(name)}</h3><p>LP-${Math.floor(s.worlds.home.eventEpoch).toString(36).toUpperCase()}</p><p>Гражданство: Колыбель<br>Допуск: ${s.discovered.length} миров / ${new Set(s.discovered.map(constellationName)).size} созвездий</p><strong>${s.freeConstruction ? "TEST PILOT · БЕСПЛАТНОЕ СТРОИТЕЛЬСТВО" : "COLONIAL CITIZEN"}</strong></div><div class="corporate-stamp"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="34"/><path d="M50 20L73 70H62L50 45L38 70H27Z"/><text x="50" y="85" text-anchor="middle">AURORA</text></svg><small>VERIFIED</small></div></div><div class="passport-code">${"▌▍▏▌▌▎▍▏".repeat(10)}<span>AURORA &lt;&lt; ${esc(name.toUpperCase())} &lt;&lt; LP</span></div></div><div class="profile-columns"><section><h3>Зоны интереса · планеты</h3>${visits
        .slice(0, 6)
        .map(
          ([p, v]) =>
            `<div class="profile-row"><span>${esc(PLANETS[p as PlanetId].name)}</span><b>${v.arrivals} виз. · ${Math.floor(v.seconds / 60)} мин</b></div>`,
        )
        .join("")}</section><section><h3>Зоны интереса · созвездия</h3>${[
        ...constellations,
      ]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([n]) => `<div class="profile-row">${esc(n)}</div>`)
        .join(
          "",
        )}</section></div><h3>Зоны доступа в паспорте</h3><div class="access-zones">${s.discovered.map((p) => `<span>${esc(constellationName(p))} / ${esc(PLANETS[p].name)} <b>${PLANETS[p].hostile ? "ОПАСНАЯ ЗОНА" : "ДОПУСК ПОДТВЕРЖДЁН"}</b></span>`).join("")}</div>`,
      "profile",
    );
  }
}
