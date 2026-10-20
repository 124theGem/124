import {
  PLANETS,
  PLANET_COMPOSITION,
  RESOURCE_LABELS,
  type PlanetId,
} from "../../shared/catalog";
import { bodyCenter } from "../../shared/space";
import {
  constellationIndex,
  constellationName,
  planetDistance,
  inScannerRange,
  scannerBuilding,
  scannerRange,
  SECTOR_PLANETS,
} from "../../shared/sector";
import type { Save } from "../../shared/model";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class GalaxyMap {
  private canvas: HTMLCanvasElement;
  private zoom = 0.035;
  private pan = { x: 0, y: 0 };
  private selection: PlanetId;
  private observer: ResizeObserver;
  private positions = SECTOR_PLANETS.map((id) => ({ id, p: bodyCenter(id) }));
  constructor(
    private root: HTMLElement,
    private save: Save,
    private scan: (p: PlanetId) => void,
    private travel: (p: PlanetId) => void,
    private observe: (p: PlanetId) => void,
  ) {
    this.selection = save.lastDiscovery ?? save.planet;
    const station = scannerBuilding(save);
    root.innerHTML = `<div class="sector-toolbar"><label>Поиск сигнала<input id="planet-search" type="search" placeholder="Планета или созвездие"></label><label>Созвездие<select id="sector-filter"><option value="all">Все 61 созвездие</option>${[...new Map(SECTOR_PLANETS.map((id) => [constellationIndex(id), id])).entries()].map(([i, id]) => `<option value="${i}">${constellationName(id)}</option>`).join("")}</select></label><button id="map-home">Колыбель</button><button id="map-all">Вся галактика</button></div><div class="sector-layout"><div class="sector-viewport"><canvas id="sector-map" aria-label="Звёздная карта: 1206 планет, масштаб и перемещение"></canvas><div class="sector-legend"><span>● В радиусе</span><span>○ За пределами</span><small>Перетащите карту · колесо / кнопки масштаба</small><button id="map-plus">+</button><button id="map-minus">−</button></div></div><aside id="sector-detail"></aside></div><div id="signal-results" class="signal-results"></div><p class="atlas-note">${station ? `Сканер ${station.level ?? 1}/10 · радиус ${scannerRange(station.level ?? 1)} · исследовано ${save.scans.length}` : "Для сканирования постройте антенную станцию на Родной."} · 1206 планет / 61 созвездие</p><div class="known-routes"><small>Открытые маршруты</small>${save.discovered
      .slice(0, 60)
      .map(
        (id) =>
          `<button data-planet="${id}" ${id === save.planet && !save.flight ? "disabled" : ""}>${esc(PLANETS[id].name)} ↗</button>`,
      )
      .join("")}</div>`;
    this.canvas = root.querySelector("canvas")!;
    let dragging = false,
      moved = false,
      last = { x: 0, y: 0 };
    this.canvas.onpointerdown = (e) => {
      dragging = true;
      moved = false;
      last = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    };
    this.canvas.onpointermove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - last.x,
        dy = e.clientY - last.y;
      moved ||= Math.abs(dx) + Math.abs(dy) > 2;
      this.pan.x += dx;
      this.pan.y += dy;
      last = { x: e.clientX, y: e.clientY };
      this.draw();
    };
    this.canvas.onpointerup = (e) => {
      dragging = false;
      if (moved) return;
      const r = this.canvas.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top;
      let best: PlanetId | undefined,
        distance = 14;
      for (const item of this.positions) {
        const q = this.project(item.p);
        const d = Math.hypot(q.x - x, q.y - y);
        if (d < distance && this.visible(item.id)) {
          best = item.id;
          distance = d;
        }
      }
      if (best) this.select(best);
    };
    this.canvas.onwheel = (e) => {
      e.preventDefault();
      this.scale(e.deltaY > 0 ? 0.8 : 1.25);
    };
    root.querySelector<HTMLButtonElement>("#map-plus")!.onclick = () =>
      this.scale(1.5);
    root.querySelector<HTMLButtonElement>("#map-minus")!.onclick = () =>
      this.scale(1 / 1.5);
    root.querySelector<HTMLButtonElement>("#map-home")!.onclick = () => {
      this.zoom = 0.3;
      const p = bodyCenter("home");
      this.pan = { x: -p.x * this.zoom, y: -p.z * this.zoom };
      this.draw();
    };
    root.querySelector<HTMLButtonElement>("#map-all")!.onclick = () => {
      this.zoom = 0.035;
      this.pan = { x: 0, y: 0 };
      this.draw();
    };
    root.querySelector<HTMLInputElement>("#planet-search")!.oninput = () => {
      this.results();
      this.draw();
    };
    root.querySelector<HTMLSelectElement>("#sector-filter")!.onchange = () => {
      const value = this.filter;
      const points = this.positions.filter(
        (p) => value === "all" || String(constellationIndex(p.id)) === value,
      );
      if (value !== "all" && points.length) {
        const x = points.reduce((n, i) => n + i.p.x, 0) / points.length,
          z = points.reduce((n, i) => n + i.p.z, 0) / points.length;
        this.zoom = 0.5;
        this.pan = { x: -x * this.zoom, y: -z * this.zoom };
      }
      this.results();
      this.draw();
    };
    root
      .querySelectorAll<HTMLButtonElement>("[data-planet]")
      .forEach((b) => (b.onclick = () => travel(b.dataset.planet as PlanetId)));
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(this.canvas);
    this.detail();
    this.draw();
  }
  private get filter() {
    return this.root.querySelector<HTMLSelectElement>("#sector-filter")!.value;
  }
  private visible(id: PlanetId) {
    const q = this.root
      .querySelector<HTMLInputElement>("#planet-search")!
      .value.toLowerCase();
    return (
      (this.filter === "all" ||
        String(constellationIndex(id)) === this.filter) &&
      (!q ||
        `${PLANETS[id].name} ${constellationName(id)}`
          .toLowerCase()
          .includes(q))
    );
  }
  private scale(f: number) {
    this.zoom = Math.max(0.015, Math.min(4, this.zoom * f));
    this.pan.x *= f;
    this.pan.y *= f;
    this.draw();
  }
  private project(p: { x: number; z: number }) {
    return {
      x: this.canvas.clientWidth / 2 + p.x * this.zoom + this.pan.x,
      y: this.canvas.clientHeight / 2 + p.z * this.zoom + this.pan.y,
    };
  }
  private select(id: PlanetId) {
    this.selection = id;
    this.detail();
    this.draw();
  }
  private results() {
    const out = this.root.querySelector("#signal-results")!;
    const q =
      this.root.querySelector<HTMLInputElement>("#planet-search")!.value;
    out.innerHTML = q
      ? this.positions
          .filter((p) => this.visible(p.id))
          .slice(0, 40)
          .map(
            (p) =>
              `<button data-signal="${p.id}">${esc(PLANETS[p.id].name)}</button>`,
          )
          .join("")
      : "";
    out.querySelectorAll<HTMLButtonElement>("[data-signal]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.signal as PlanetId,
            p = bodyCenter(id);
          this.zoom = 0.7;
          this.pan = { x: -p.x * this.zoom, y: -p.z * this.zoom };
          this.select(id);
        }),
    );
  }
  private detail() {
    const id = this.selection,
      p = PLANETS[id],
      known = this.save.discovered.includes(id),
      scanned = this.save.scans.includes(id),
      inRange = inScannerRange(this.save, id),
      parts = PLANET_COMPOSITION[id];
    this.root.querySelector("#sector-detail")!.innerHTML =
      `<span class="eyebrow">${esc(constellationName(id))}</span><h3>${esc(p.name)}</h3><div class="scan-orb ${scanned ? "scanned" : ""}" style="--orb:${p.color};--scan-pie:conic-gradient(from 20deg,#74e0d5 0 ${parts[0].percent}%,#8a99e0 ${parts[0].percent}% ${parts[0].percent + parts[1].percent}%,#d6ac70 ${parts[0].percent + parts[1].percent}% 100%)"><span>${scanned ? "◈" : "?"}</span><i></i><b>${scanned ? "СПЕКТР ПОДТВЕРЖДЁН" : "НЕТ ДАННЫХ"}</b></div><p>${Math.round(planetDistance("home", id))} от Родной · ${p.hostile ? "Опасный сектор" : "Мирный сектор"}</p><div class="scan-resources">${scanned ? parts.map((r, i) => `<div><span>${RESOURCE_LABELS[r.resource]}</span><b>${r.percent}%</b><i style="width:${r.percent}%;--bar:${["#6ee6d8", "#8e9df5", "#efb86b"][i]}"></i></div>`).join("") : "<p>Состав неизвестен. Наведите сканер на сигнал.</p>"}</div><button id="scan-selected" class="primary" ${!inRange || scanned || this.save.planet !== "home" || this.save.flight ? "disabled" : ""}>${scanned ? "Скан завершён" : inRange ? "Сканировать планету" : "Вне радиуса сканера"}</button><button id="observe-selected">Рассмотреть планету</button>${known && id !== this.save.planet ? '<button id="selected-course">Проложить маршрут ↗</button>' : ""}<small>Доли определяют реальную добычу поглотителя.</small>`;
    this.root.querySelector<HTMLButtonElement>("#scan-selected")!.onclick =
      () => this.scan(id);
    const optics =
      this.root.querySelector<HTMLButtonElement>("#observe-selected");
    if (optics) optics.onclick = () => this.observe(id);
    const course =
      this.root.querySelector<HTMLButtonElement>("#selected-course");
    if (course) course.onclick = () => this.travel(id);
  }
  private draw() {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(devicePixelRatio, 1.5);
    this.canvas.width = w * ratio;
    this.canvas.height = h * ratio;
    const ctx = this.canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#030b18";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#14263b";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const sectors = new Map<number, typeof this.positions>();
    for (const p of this.positions) {
      const i = constellationIndex(p.id),
        group = sectors.get(i) ?? [];
      group.push(p);
      sectors.set(i, group);
    }
    ctx.strokeStyle = "#33506c";
    ctx.lineWidth = 0.7;
    for (const group of sectors.values()) {
      ctx.beginPath();
      group.forEach((p, i) => {
        const q = this.project(p.p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
      if (this.zoom > 0.06) {
        const p = group[0],
          q = this.project(p.p);
        ctx.font = "10px monospace";
        ctx.fillStyle = "#7894aa";
        if (
          group.some(
            (item) =>
              this.save.scans.includes(item.id) ||
              inScannerRange(this.save, item.id),
          )
        )
          ctx.fillText(
            constellationName(p.id).toUpperCase(),
            q.x + 8,
            q.y - 14,
          );
      }
    }
    const home = this.project(bodyCenter("home")),
      station = scannerBuilding(this.save);
    if (station) {
      ctx.strokeStyle = "#6dded344";
      ctx.fillStyle = "#4cd3cf08";
      ctx.beginPath();
      ctx.arc(
        home.x,
        home.y,
        scannerRange(station.level ?? 1) * this.zoom,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }
    for (const item of this.positions) {
      if (!this.visible(item.id)) continue;
      const q = this.project(item.p);
      if (q.x < -10 || q.y < -10 || q.x > w + 10 || q.y > h + 10) continue;
      const reachable = inScannerRange(this.save, item.id),
        selected = item.id === this.selection;
      ctx.fillStyle = reachable ? PLANETS[item.id].color : "#536174";
      ctx.beginPath();
      ctx.arc(
        q.x,
        q.y,
        selected ? 5 : this.save.scans.includes(item.id) ? 3.4 : 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (selected || item.id === this.save.planet) {
        ctx.strokeStyle = selected ? "#f2c481" : "#81f3e1";
        ctx.beginPath();
        ctx.arc(q.x, q.y, selected ? 10 : 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.zoom > 0.6 || selected) {
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#c3d5e7";
        ctx.fillText(PLANETS[item.id].name, q.x + 8, q.y + 3);
      }
    }
  }
  dispose() {
    this.observer.disconnect();
  }
}
