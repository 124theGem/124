import {
  BEDS,
  BUILDINGS,
  PLANTS,
  PLANETS,
  RESOURCE_ICONS,
  RESOURCE_LABELS,
  key,
  type PlanetId,
  type BuildingKind,
} from "../../shared/catalog";
import { ready, type Save } from "../../shared/model";
export class UI {
  readonly root = document.createElement("div");
  onInventory = () => {};
  onPlant = () => {};
  onBuild = () => {};
  onGalaxy = () => {};
  onCamera = () => {};
  onSettings = () => {};
  onSelectPlant = (id: string) => {};
  onSelectBuilding = (kind: BuildingKind) => {};
  onConfirmBuild = () => {};
  onCancelBuild = () => {};
  onRotateBuild = () => {};
  onTravel = (id: PlanetId) => {};
  onContext = () => {};
  private toastTimer = 0;
  constructor(readonly local: boolean) {
    this.root.className = "hud";
    this.root.innerHTML = `
      <header class="topbar"><div class="identity"><div class="avatar">♙</div><div><div class="brand">LITTLE PLANETS <span>✦</span></div><strong id="planet-name">Листория</strong><small id="planet-tag">Ваш маленький мир</small></div></div><div class="resources" id="resource-strip"></div><div class="top-buttons"><button id="view" title="Обзор планеты" aria-label="Переключить камеру">◇</button><button id="settings" title="Настройки" aria-label="Настройки">⚙</button></div></header>
      <aside class="quest"><span class="quest-icon">✦</span><div><small>МАЛЕНЬКИЕ ШАГИ</small><strong id="quest-title">Посадите своё первое растение</strong><span id="quest-detail">Выберите грядку — остальное сделаем вместе</span></div></aside>
      <div class="planet-label"><span id="biome">01 / ЗЕЛЁНЫЙ ДОМ</span><h1>Маленький мир.<br>Большое приключение.</h1><p>Расти, строй и открывай новые планеты.</p></div>
      <div id="context" class="context hidden"></div><div id="build-panel" class="build-panel hidden"></div>
      <div class="bottom"><span class="save-status" id="save-status">${local ? "Локальный мир · автосохранение" : "Telegram · облачное сохранение"}</span><nav><button id="inventory"><span>▦</span>Инвентарь</button><button id="plant"><span>♧</span>Посадить</button><button id="build"><span>⌂</span>Построить</button><button id="galaxy"><span>✧</span>Галактика</button></nav></div>
      <div id="joystick" aria-label="Джойстик движения"><span></span></div><div class="keyboard">W A S D <i>движение</i> <b>·</b> Колесо <i>масштаб</i> <b>·</b> Потяните <i>поворот камеры</i></div>
      <div id="toast" role="status"></div><div id="modal" class="modal hidden"><section class="sheet"><button class="close" id="close-modal" aria-label="Закрыть">×</button><div id="modal-content"></div></section></div>
      <div id="flight" class="flight hidden"><span>✦</span><h2 id="flight-title">Между маленькими мирами</h2><p>Следующая остановка — новое приключение</p></div>`;
    document.querySelector("#app")!.append(this.root);
    this.button("inventory", () => this.onInventory());
    this.button("plant", () => this.onPlant());
    this.button("build", () => this.onBuild());
    this.button("galaxy", () => this.onGalaxy());
    this.button("view", () => this.onCamera());
    this.button("settings", () => this.onSettings());
    this.button("close-modal", () => this.close());
  }
  el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  button(id: string, callback: () => void) {
    this.el(id).addEventListener("click", callback);
  }
  toast(text: string) {
    const element = this.el("toast");
    element.textContent = text;
    element.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => element.classList.remove("visible"),
      3200,
    );
  }
  update(save: Save, now: number) {
    const planet = PLANETS[save.planet];
    this.el("planet-name").textContent = planet.name;
    this.el("planet-tag").textContent = planet.tag;
    this.el("biome").textContent =
      `0${Object.keys(PLANETS).indexOf(save.planet) + 1} / ${planet.name.toUpperCase()}`;
    this.el("resource-strip").innerHTML = ["wood", "stone", "crystal"]
      .map(
        (r) =>
          `<span title="${RESOURCE_LABELS[r]}"><i class="resource-${r}">${RESOURCE_ICONS[r]}</i><b>${save.inventory[r] ?? 0}</b></span>`,
      )
      .join("");
    const harvested = Object.entries(save.inventory)
        .filter(([k]) => k.startsWith("crop:"))
        .reduce((s, [, v]) => s + v, 0),
      built = Object.values(save.worlds).some((w) => w.buildings.length > 1),
      planted = Object.values(save.worlds).some(
        (w) => Object.keys(w.crops).length > 0,
      );
    const title = built
      ? "Ваше путешествие только начинается"
      : harvested
        ? "Постройте уютный домик"
        : planted
          ? "Дождитесь первого урожая"
          : "Посадите своё первое растение";
    this.el("quest-title").textContent = title;
    this.el("quest-detail").textContent = built
      ? "Мицелия и Пирос уже ждут вас"
      : harvested
        ? "Откройте «Построить» и выберите свободное место"
        : planted
          ? "Обычные растения растут всего 15 секунд"
          : "Выберите грядку или нажмите «Посадить»";
    const count = BEDS.filter(
      (b) =>
        save.worlds[save.planet].crops[key(b.x, b.z)] &&
        ready(save.worlds[save.planet].crops[key(b.x, b.z)], now),
    ).length;
    this.el("plant").setAttribute("data-ready", String(count));
  }
  get modalOpen() {
    return !this.el("modal").classList.contains("hidden");
  }
  close() {
    this.el("modal").classList.add("hidden");
  }
  private show(html: string) {
    this.el("modal-content").innerHTML = html;
    this.el("modal").classList.remove("hidden");
  }
  inventory(save: Save) {
    this.show(
      `<span class="eyebrow">ВСЁ ДЛЯ МАЛЕНЬКОГО МИРА</span><h2>Рюкзак путешественника</h2><p>Ресурсы и семена путешествуют вместе с вами.</p><h3>Материалы</h3><div class="inventory-grid">${Object.keys(
        RESOURCE_LABELS,
      )
        .map(
          (r) =>
            `<article><span>${RESOURCE_ICONS[r]}</span><b>${save.inventory[r] ?? 0}</b><small>${RESOURCE_LABELS[r]}</small></article>`,
        )
        .join(
          "",
        )}</div><h3>Семена и урожай</h3><div class="seed-list">${Object.entries(
        PLANTS,
      )
        .map(
          ([id, p]) =>
            `<div><span>${p.icon}</span><strong>${p.name}<small>${PLANETS[p.planet].name}</small></strong><b>${save.inventory[`seed:${id}`] ?? 0}<small>семян</small></b><b>${save.inventory[`crop:${id}`] ?? 0}<small>урожай</small></b></div>`,
        )
        .join("")}</div>`,
    );
  }
  seeds(save: Save) {
    this.show(
      `<span class="eyebrow">НОВАЯ ЖИЗНЬ НА ВАШЕЙ ПЛАНЕТЕ</span><h2>Что посадим?</h2><p>Одно семя → три единицы урожая и два новых семени.</p><div class="seed-options">${PLANETS[
        save.planet
      ].plants
        .map((id) => {
          const p = PLANTS[id],
            count = save.inventory[`seed:${id}`] ?? 0;
          return `<button data-seed="${id}" ${count ? "" : "disabled"}><span>${p.icon}</span><strong>${p.name}</strong><small>${p.seconds} секунд · ${count} семян</small><b>Посадить ↗</b></button>`;
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
    const panel = this.el("context");
    panel.classList.remove("hidden");
    panel.innerHTML =
      "<small>РЯДОМ С ВАМИ</small><h3></h3><p></p>" +
      (actionLabel
        ? '<button id="context-action" class="primary"></button>'
        : "");
    panel.querySelector("h3")!.textContent = title;
    panel.querySelector("p")!.textContent = detail;
    if (actionLabel) {
      const button = panel.querySelector<HTMLButtonElement>("button")!;
      button.textContent = actionLabel;
      button.disabled = disabled;
      button.onclick = () => this.onContext();
    }
  }
  hideContext() {
    this.el("context").classList.add("hidden");
  }
  building(kind: BuildingKind, valid: boolean, save: Save) {
    const panel = this.el("build-panel");
    panel.classList.remove("hidden");
    panel.innerHTML = `<span class="eyebrow">РЕЖИМ СТРОИТЕЛЬСТВА</span><h3>Найдём уютное место</h3><div class="build-choices">${Object.entries(
      BUILDINGS,
    )
      .map(
        ([id, b]) =>
          `<button data-building="${id}" class="${id === kind ? "selected" : ""}"><span>${b.icon}</span>${b.name}<small>${Object.entries(
            b.cost,
          )
            .map(([r, v]) => `${v} ${RESOURCE_ICONS[r]}`)
            .join(" · ")}</small></button>`,
      )
      .join(
        "",
      )}</div><p id="placement-hint">${valid ? "Место свободно. Можно строить." : "Здесь занято. Выберите другое место на сетке."}</p><div class="build-actions"><button id="cancel-build" aria-label="Отменить строительство">×</button><button id="rotate-build" aria-label="Повернуть постройку">↻</button><button id="confirm-build" class="primary" ${valid && Object.entries(BUILDINGS[kind].cost).every(([r, n]) => (save.inventory[r] ?? 0) >= n) ? "" : "disabled"}>Построить ✓</button></div>`;
    panel
      .querySelectorAll<HTMLButtonElement>("[data-building]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            this.onSelectBuilding(b.dataset.building as BuildingKind)),
      );
    this.button("cancel-build", () => this.onCancelBuild());
    this.button("rotate-build", () => this.onRotateBuild());
    this.button("confirm-build", () => this.onConfirmBuild());
  }
  hideBuilding() {
    this.el("build-panel").classList.add("hidden");
  }
  galaxy(save: Save) {
    this.show(
      `<span class="eyebrow">ТРИ МИРА. ОДНО ПРИКЛЮЧЕНИЕ.</span><h2>Куда полетим?</h2><p>Полёты бесплатны. Ваши растения продолжат расти.</p><div class="planet-cards">${Object.values(
        PLANETS,
      )
        .map(
          (p) =>
            `<button data-planet="${p.id}" ${p.id === save.planet ? "disabled" : ""} style="--planet:${p.color}"><div class="mini-planet">${p.icon}</div><strong>${p.name}</strong><small>${p.description}</small><b>${p.id === save.planet ? "Вы здесь" : "Отправиться ↗"}</b></button>`,
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
    this.show(
      '<span class="eyebrow">УСТРОЙТЕСЬ ПОУДОБНЕЕ</span><h2>Ваш маленький космос</h2><p>WASD — движение. Касание объекта — подойти и взаимодействовать. Потяните мир для поворота; колесо или щипок — масштаб.</p><button id="full" class="primary">На весь экран</button><button id="quality" class="secondary">Переключить качество</button><p class="muted">Локальный режим хранит мир в этом браузере. В Telegram прогресс связан с вашим подтверждённым аккаунтом.</p>',
    );
    this.button("full", fullscreen);
    this.button("quality", quality);
  }
  flight(name: string, show: boolean) {
    this.el("flight-title").textContent = `Курс на ${name}`;
    this.el("flight").classList.toggle("hidden", !show);
  }
}
