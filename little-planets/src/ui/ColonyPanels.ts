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
      .querySelectorAll<HTMLButtonElement>("button");
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
    const design =
      draft ??
      ({
        name: "Новый корабль",
        class: "exploration",
        model: 1,
        hull: "needle",
        wings: "swept",
        color: "ivory",
      } as Omit<Starship, "id">);
    const stats = SHIP_STATS({ ...design, id: "preview" }),
      color = "#" + SHIP_COLORS[design.color].toString(16).padStart(6, "0");
    this.ui.panel(
      `<span class="eyebrow">МОДУЛЬНАЯ ВЕРФЬ · AURORA SHIPWORKS</span><h2>Конструктор корабля</h2><div class="shipyard-layout"><div class="ship-preview"><svg viewBox="0 0 400 300" aria-label="Проект корабля"><defs><pattern id="ship-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#75bfd71a"/></pattern></defs><rect width="400" height="300" fill="url(#ship-grid)"/><g fill="${color}" stroke="#d4efee" stroke-width="1.5"><path d="${design.wings === "delta" ? "M200 60L345 245L200 205L55 245Z" : design.wings === "twin" ? "M70 95H110V230H290V95H330V250H70Z" : "M200 100L350 220L200 180L50 220Z"}"/><path d="${design.hull === "needle" ? "M200 35L235 180L220 250H180L165 180Z" : design.hull === "armored" ? "M200 40L255 125L245 245H155L145 125Z" : "M180 40H220L260 95V245H140V95Z"}"/></g><path d="M190 85H210L220 125H180Z" fill="#6df2f7"/><g fill="#6df2f7"><rect x="177" y="247" width="15" height="22"/><rect x="208" y="247" width="15" height="22"/></g><text x="20" y="28" fill="#74c5cf" font-size="12">${SHIP_CLASS_NAMES[design.class].toUpperCase()} / MK ${design.model}</text></svg><div class="metric-strip"><span>Скорость<b>${stats.speed}</b></span><span>Трюм<b>${stats.cargo}</b></span><span>Броня<b>${stats.armor}</b></span></div></div><form id="ship-form"><label>Позывной<input id="ship-name" maxlength="40" value="${esc(design.name)}"></label><label>Назначение<select id="ship-class">${Object.entries(
        SHIP_CLASS_NAMES,
      )
        .map(
          ([id, n]) =>
            `<option value="${id}" ${id === design.class ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Модель<select id="ship-model">${[1, 2, 3].map((n) => `<option ${n === design.model ? "selected" : ""} value="${n}">MK ${n} · ${["", "Базовая", "Усиленная", "Экспедиционная"][n]}</option>`).join("")}</select></label><label>Фюзеляж<select id="ship-hull">${[
        ["needle", "Стрела"],
        ["armored", "Бронекапсула"],
        ["freighter", "Транспортный"],
      ]
        .map(
          ([id, n]) =>
            `<option value="${id}" ${id === design.hull ? "selected" : ""}>${n}</option>`,
        )
        .join("")}</select></label><label>Крылья<select id="ship-wings">${[
        ["swept", "Стреловидные"],
        ["delta", "Дельта"],
        ["twin", "Двойные"],
      ]
        .map(
          ([id, n]) =>
            `<option value="${id}" ${id === design.wings ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Окраска<select id="ship-color">${Object.keys(
        SHIP_COLORS,
      )
        .map(
          (id) =>
            `<option value="${id}" ${id === design.color ? "selected" : ""}>${{ ivory: "Светлый камень", graphite: "Графит", cobalt: "Кобальт", ember: "Медь", emerald: "Изумруд" }[id as keyof typeof SHIP_COLORS]}</option>`,
        )
        .join(
          "",
        )}</select></label><p>${save.freeConstruction ? "ТЕСТОВЫЙ ДОПУСК · стоимость 0" : resources(shipCost(design))}</p><button type="button" id="create-ship" class="primary">Создать и выбрать корабль</button></form></div><h3>Личный ангар</h3><div class="fleet-list">${save.fleet.map((s) => `<button data-select-ship="${esc(s.id)}" ${s.id === active.id ? "disabled" : ""}><strong>${esc(s.name)}</strong><small>${SHIP_CLASS_NAMES[s.class]} · MK ${s.model} · ${s.id === active.id ? "АКТИВЕН" : "ВЫБРАТЬ"}</small></button>`).join("")}</div>`,
      "shipyard",
    );
    const read = () => ({
      name: (this.ui.el("ship-name") as HTMLInputElement).value || "Без имени",
      class: (this.ui.el("ship-class") as HTMLSelectElement).value as ShipClass,
      model: Number((this.ui.el("ship-model") as HTMLSelectElement).value) as
        1 | 2 | 3,
      hull: (this.ui.el("ship-hull") as HTMLSelectElement)
        .value as Starship["hull"],
      wings: (this.ui.el("ship-wings") as HTMLSelectElement)
        .value as Starship["wings"],
      color: (this.ui.el("ship-color") as HTMLSelectElement)
        .value as Starship["color"],
    });
    for (const name of ["class", "model", "hull", "wings", "color"])
      (this.ui.el("ship-" + name) as HTMLSelectElement).onchange = () =>
        this.shipyard(id, read());
    this.ui.button(
      "create-ship",
      () =>
        void this.run({ type: "createShip", ship: read() }, () =>
          this.shipyard(id, read()),
        ),
    );
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLButtonElement>("[data-select-ship]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            void this.run(
              { type: "selectShip", id: b.dataset.selectShip! },
              () => this.shipyard(id),
            )),
      );
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
