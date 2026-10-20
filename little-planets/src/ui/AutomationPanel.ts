import {
  DEVICE_NAMES,
  DEVICE_COSTS,
  RECIPES,
  defaultProgram,
  cargoAmount,
  type Program,
  type ProgramNode,
  type DeviceKind,
} from "../../shared/automation";
import { PLANETS, RESOURCE_LABELS, type PlanetId } from "../../shared/catalog";
import type { Save, Action } from "../../shared/model";
import { UI } from "./UI";
const e = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const ops: Record<ProgramNode["op"], string> = {
  mine: "⛏ Добывать",
  cargo: "◇ Загрузка ≥ %",
  unload: "▣ На склад / выгрузить",
  load: "▣ Загрузить со склада",
  travel: "🚀 Лететь на планету",
  hunt: "⚔ Найти и уничтожить",
  wait: "◷ Подождать 1 сек.",
};
export class AutomationPanel {
  private selected = "";
  private draft?: Program;
  private source?: { id: string; port: "next" | "otherwise" };
  private serial = 0;
  private drafts = new Map<string, Program>();
  private writes = Promise.resolve();
  private editVersion = 0;
  constructor(
    private ui: UI,
    private state: () => Save,
    private act: (a: Action) => Promise<void>,
  ) {}
  open(id?: string) {
    if (id) this.selected = id;
    this.draft = this.drafts.get(this.selected);
    this.render();
  }
  private render() {
    const s = this.state(),
      devices = s.automation.devices,
      selected = devices.find((d) => d.id === this.selected);
    this.ui.panel(
      `<span class="eyebrow">АВТОМАТИЗАЦИЯ КОЛОНИИ</span><h2>Машины и цепочки</h2><p>Устройства создаются рядом с вами за материалы. Склад принадлежит планете; дроны перевозят его запасы. Симуляция работает во время открытой игры, в том числе на других планетах.</p><div class="device-palette">${(
        Object.keys(DEVICE_NAMES) as DeviceKind[]
      )
        .map(
          (k) =>
            `<button data-deploy="${k}">${DEVICE_NAMES[k]}<small>${
              s.freeConstruction
                ? "0 ресурсов · TEST"
                : Object.entries(DEVICE_COSTS[k])
                    .map(([r, n]) => `${n} ${RESOURCE_LABELS[r]}`)
                    .join(" + ")
            }</small></button>`,
        )
        .join(
          "",
        )}</div><div class="device-list">${devices.map((d) => `<button data-device="${d.id}" class="${d.id === this.selected ? "active" : ""}">${DEVICE_NAMES[d.kind]} · ${e(d.id)}<small>${PLANETS[d.planet].name} · ${e(d.status)} · груз ${cargoAmount(d)}/${d.capacity}</small></button>`).join("") || "<p>Создайте склад и первого сборщика.</p>"}</div><div id="device-detail"></div>`,
    );
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLButtonElement>("[data-deploy]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            void this.run({
              type: "deploy",
              kind: b.dataset.deploy as DeviceKind,
            })),
      );
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLButtonElement>("[data-device]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            this.selected = b.dataset.device!;
            this.draft = this.drafts.get(this.selected);
            this.render();
          }),
      );
    if (!selected) return;
    const detail = this.ui.el("device-detail");
    detail.innerHTML = `<h3>${DEVICE_NAMES[selected.kind]} · ${PLANETS[selected.planet].name}</h3><p id="device-status">${e(selected.status)}</p><button id="device-toggle">${selected.enabled ? "Приостановить" : "Запустить"}</button>`;
    this.ui.button(
      "device-toggle",
      () =>
        void this.run({
          type: "toggleDevice",
          id: selected.id,
          enabled: !selected.enabled,
        }),
    );
    if (selected.kind === "warehouse") {
      detail.insertAdjacentHTML(
        "beforeend",
        `<h3>Запасы планеты</h3><p id="stock-status">${
          Object.entries(s.worlds[selected.planet].stock)
            .map(([r, n]) => `${RESOURCE_LABELS[r] ?? e(r)}: ${n}`)
            .join(" · ") || "Пусто"
        }</p><label>Ресурс <select id="stock-resource">${Object.entries(
          RESOURCE_LABELS,
        )
          .map(
            ([r, n]) =>
              `<option value="${r}">${n} · рюкзак ${s.inventory[r] ?? 0}</option>`,
          )
          .join(
            "",
          )}</select></label><label>Количество <input id="stock-count" type="number" min="1" max="1000" value="3"></label><button id="stock-in">Положить</button><button id="stock-out">Забрать</button><p>Для ручного переноса подойдите к складу. Несколько складов на одной планете используют общий запас.</p>`,
      );
      for (const [id, direction] of [
        ["stock-in", "deposit"],
        ["stock-out", "withdraw"],
      ] as const)
        this.ui.button(
          id,
          () =>
            void this.run({
              type: "stock",
              resource: (this.ui.el("stock-resource") as HTMLSelectElement)
                .value as "wood",
              amount: Number(
                (this.ui.el("stock-count") as HTMLInputElement).value,
              ),
              direction,
            }),
        );
      return;
    }
    if (selected.kind === "refinery") {
      detail.insertAdjacentHTML(
        "beforeend",
        `<p>Сырьё привозят гусеничные дроны. Готовый материал они возвращают на склад.</p><h3>Входной буфер</h3><p id="refinery-inputs">${
          Object.entries(selected.buffer)
            .map(([k, n]) => `${RESOURCE_LABELS[k]}: ${n}`)
            .join(" · ") || "Пусто"
        }</p><h3>Готовая продукция</h3><p id="refinery-outputs">${
          Object.entries(selected.output)
            .map(([k, n]) => `${RESOURCE_LABELS[k]}: ${n}`)
            .join(" · ") || "Пусто"
        }</p><select id="refinery-recipe">${Object.entries(RECIPES)
          .map(
            ([id, r]) =>
              `<option value="${id}" ${id === selected.recipe ? "selected" : ""}>${Object.entries(
                r.input,
              )
                .map(([k, n]) => `${n} ${RESOURCE_LABELS[k]}`)
                .join(" + ")} → ${r.name} (${r.seconds} сек.)</option>`,
          )
          .join("")}</select><button id="recipe-save">Выбрать цепочку</button>`,
      );
      this.ui.button(
        "recipe-save",
        () =>
          void this.run({
            type: "refineryRecipe",
            id: selected.id,
            recipe: (this.ui.el("refinery-recipe") as HTMLSelectElement)
              .value as "composite",
          }),
      );
      return;
    }
    if (selected.kind === "drone" || selected.kind === "crawler") {
      const route = selected.logistics,
        options = (current: string) =>
          s.discovered
            .map(
              (p) =>
                `<option value="${p}" ${p === current ? "selected" : ""}>${PLANETS[p].name}</option>`,
            )
            .join("");
      detail.insertAdjacentHTML(
        "beforeend",
        `<section class="route-builder"><span class="eyebrow">${selected.kind === "crawler" ? "НАЗЕМНАЯ ДОСТАВКА" : "МЕЖПЛАНЕТНАЯ ЛОГИСТИКА"}</span><h3>${selected.kind === "crawler" ? "Склад ⇄ Переработка" : "Склад А → Склад Б"}</h3><label>Отправление<select id="route-from">${options(route?.from ?? selected.planet)}</select></label>${
          selected.kind === "drone"
            ? `<label>Получение<select id="route-to">${options(route?.to ?? s.planet)}</select></label><label>Ресурс<select id="route-resource">${Object.entries(
                RESOURCE_LABELS,
              )
                .map(
                  ([r, n]) =>
                    `<option value="${r}" ${r === route?.resource ? "selected" : ""}>${n}</option>`,
                )
                .join("")}</select></label>`
            : `<label>Станция переработки<select id="route-refinery">${s.automation.devices
                .filter(
                  (d) => d.kind === "refinery" && d.planet === selected.planet,
                )
                .map(
                  (d) =>
                    `<option value="${d.id}" ${d.id === route?.refineryId ? "selected" : ""}>${e(d.id)} · ${RECIPES[d.recipe].name}</option>`,
                )
                .join(
                  "",
                )}</select></label><p>Автоматически доставляет оба вида сырья выбранного рецепта и увозит продукцию на склад.</p>`
        }<button id="route-save" class="primary">Назначить и запустить маршрут</button><p>${route ? `${PLANETS[route.from].name} → ${selected.kind === "crawler" ? "переработка" : PLANETS[route.to].name}` : "Маршрут не назначен"}</p></section>`,
      );
      this.ui.button("route-save", () => {
        const from = (this.ui.el("route-from") as HTMLSelectElement)
          .value as PlanetId;
        void this.run({
          type: "logisticsRoute",
          id: selected.id,
          from,
          to:
            selected.kind === "crawler"
              ? from
              : ((this.ui.el("route-to") as HTMLSelectElement)
                  .value as PlanetId),
          resource:
            selected.kind === "crawler"
              ? "wood"
              : (this.ui.el("route-resource") as HTMLSelectElement).value,
          ...(selected.kind === "crawler"
            ? {
                refineryId: (this.ui.el("route-refinery") as HTMLSelectElement)
                  .value,
              }
            : {}),
        });
      });
      if (selected.kind === "crawler") return;
    }
    this.draft ??= structuredClone(selected.program);
    this.drafts.set(selected.id, this.draft);
    detail.insertAdjacentHTML(
      "beforeend",
      `<h3>Программа из блоков</h3><p>Перетащите блок за заголовок. Нажмите выход «Далее» или «Нет», затем «Вход» другого блока для соединения. Ромб проверки направляет груз ≥ порога по выходу «Далее». Начальный блок отмечен ★. Циклы выполняются по шагам.</p><div class="graph-tools"><select id="add-op">${Object.entries(
        ops,
      )
        .map(([op, n]) => `<option value="${op}">${n}</option>`)
        .join(
          "",
        )}</select><button id="add-node">+ Блок</button><button id="save-program" class="primary">Сохранить программу</button><button id="reset-program">Пример программы</button></div><p id="graph-message" role="status"></p><div class="graph-scroll"><div id="program-graph"><svg id="graph-wires" width="2000" height="1600" aria-label="Соединения программы"></svg><div id="graph-nodes"></div></div></div>`,
    );
    this.ui.button("add-node", () => {
      const id = `n-${Date.now()}-${++this.serial}`,
        op = (this.ui.el("add-op") as HTMLSelectElement)
          .value as ProgramNode["op"];
      this.draft!.nodes.push({
        id,
        op,
        next: id,
        otherwise: id,
        planet: selected.planet,
        resource: "wood",
        threshold: 80,
        x: 40 + (this.draft!.nodes.length % 4) * 270,
        y: 80 + Math.floor(this.draft!.nodes.length / 4) * 300,
      });
      if (!this.draft!.entry) this.draft!.entry = id;
      this.graph();
      this.changed();
    });
    this.ui.button("save-program", () => this.changed());
    this.ui.button("reset-program", () => {
      this.draft = defaultProgram(selected.kind, selected.planet);
      this.graph();
      this.changed();
    });
    this.graph();
  }
  private graph() {
    const draft = this.draft!,
      s = this.state(),
      root = this.ui.el("graph-nodes");
    root.innerHTML = draft.nodes
      .map(
        (n) =>
          `<article class="program-node ${n.op === "cargo" ? "condition" : ""}" data-node="${n.id}" style="left:${n.x}px;top:${n.y}px"><header>${draft.entry === n.id ? "★ " : ""}${ops[n.op]}<button data-entry="${n.id}" title="Начать с этого блока">★</button></header><div class="node-fields"><label>Ресурс<select data-field="resource">${Object.entries(
            RESOURCE_LABELS,
          )
            .map(
              ([r, name]) =>
                `<option value="${r}" ${r === n.resource ? "selected" : ""}>${name}</option>`,
            )
            .join(
              "",
            )}</select></label><label>Планета<select data-field="planet">${s.discovered.map((p) => `<option value="${p}" ${p === n.planet ? "selected" : ""}>${PLANETS[p].name}</option>`).join("")}</select></label><label>Порог %<input data-field="threshold" type="number" min="1" max="100" value="${n.threshold}"></label><div class="node-ports"><button data-input="${n.id}">● Вход</button><button data-output="${n.id}" data-port="next">Далее ●</button>${n.op === "cargo" ? `<button data-output="${n.id}" data-port="otherwise">Нет ●</button>` : ""}</div><button data-delete="${n.id}">Удалить блок</button></div></article>`,
      )
      .join("");
    root.querySelectorAll<HTMLElement>("[data-node]").forEach((el) => {
      const n = draft.nodes.find((n) => n.id === el.dataset.node)!;
      el.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "[data-field]",
      ).forEach(
        (input) =>
          (input.onchange = () => {
            const f = input.dataset.field!;
            if (f === "threshold") n.threshold = Number(input.value);
            else if (f === "resource")
              n.resource = input.value as ProgramNode["resource"];
            else n.planet = input.value;
            this.changed();
          }),
      );
      const header = el.querySelector("header")!;
      header.onpointerdown = (ev) => {
        if ((ev.target as HTMLElement).closest("button")) return;
        ev.preventDefault();
        header.setPointerCapture(ev.pointerId);
        const x = ev.clientX,
          y = ev.clientY,
          a = n.x,
          b = n.y;
        header.onpointermove = (e) => {
          n.x = Math.max(0, Math.min(1700, a + e.clientX - x));
          n.y = Math.max(0, Math.min(1300, b + e.clientY - y));
          el.style.left = n.x + "px";
          el.style.top = n.y + "px";
          this.wires();
        };
        header.onpointerup = () => {
          header.onpointermove = null;
          this.changed();
        };
      };
    });
    root.querySelectorAll<HTMLButtonElement>("[data-output]").forEach(
      (b) =>
        (b.onclick = () => {
          this.source = {
            id: b.dataset.output!,
            port: b.dataset.port as "next" | "otherwise",
          };
          this.ui.el("graph-message").textContent =
            "Теперь нажмите «Вход» нужного блока.";
        }),
    );
    root.querySelectorAll<HTMLButtonElement>("[data-input]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!this.source) return;
          const n = draft.nodes.find((n) => n.id === this.source!.id)!;
          n[this.source.port] = b.dataset.input!;
          if (n.op !== "cargo") n.otherwise = n.next;
          this.source = undefined;
          this.ui.el("graph-message").textContent =
            "Блоки соединены. Сохраните программу.";
          this.wires();
          this.changed();
        }),
    );
    root.querySelectorAll<HTMLButtonElement>("[data-entry]").forEach(
      (b) =>
        (b.onclick = () => {
          draft.entry = b.dataset.entry!;
          this.graph();
          this.changed();
        }),
    );
    root.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.delete!;
          draft.nodes = draft.nodes.filter((n) => n.id !== id);
          if (draft.entry === id) draft.entry = draft.nodes[0]?.id ?? "";
          for (const n of draft.nodes) {
            if (n.next === id) n.next = n.id;
            if (n.otherwise === id) n.otherwise = n.id;
          }
          this.graph();
          this.changed();
        }),
    );
    this.wires();
  }
  private wires() {
    const d = this.draft!;
    this.ui.el("graph-wires").innerHTML = d.nodes
      .flatMap((n) =>
        (n.op === "cargo"
          ? (["next", "otherwise"] as const)
          : (["next"] as const)
        ).map((p, i) => {
          const to = d.nodes.find((q) => q.id === n[p]);
          if (!to) return "";
          const x = n.x + 235,
            y = n.y + 180 + i * 30,
            a = to.x,
            b = to.y + 180;
          return `<path d="M${x},${y} C${x + 90},${y} ${a - 90},${b} ${a},${b}" fill="none" stroke="${i ? "#daa364" : "#7dc3a3"}" stroke-width="3"/><circle cx="${a}" cy="${b}" r="5" fill="#f3d292"/>`;
        }),
      )
      .join("");
  }
  refresh() {
    if (!this.ui.modalOpen || !this.ui.el("device-detail")) return;
    const s = this.state(),
      d = s.automation.devices.find((d) => d.id === this.selected);
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLButtonElement>("[data-device]")
      .forEach((b) => {
        const actor = s.automation.devices.find(
          (d) => d.id === b.dataset.device,
        );
        if (actor)
          b.querySelector("small")!.textContent =
            `${PLANETS[actor.planet].name} · ${actor.status} · груз ${cargoAmount(actor)}/${actor.capacity}`;
      });
    if (!d) return;
    const status = this.ui.el("device-status");
    if (status)
      status.textContent =
        d.status +
        (d.job
          ? ` · ${Math.max(0, Math.ceil((d.job.ends - Date.now()) / 1000))} сек.`
          : "");
    this.ui
      .el("modal-content")
      .querySelectorAll<HTMLElement>("[data-node]")
      .forEach((n) =>
        n.classList.toggle("executing", n.dataset.node === d.pc && d.enabled),
      );
    for (const [id, values] of [
      ["refinery-inputs", d.buffer],
      ["refinery-outputs", d.output],
    ] as const) {
      const el = this.ui.el(id);
      if (el)
        el.textContent =
          Object.entries(values)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${RESOURCE_LABELS[k]}: ${n}`)
            .join(" · ") || "Пусто";
    }
    const stock = this.ui.el("stock-status");
    if (stock)
      stock.textContent =
        Object.entries(s.worlds[d.planet].stock)
          .map(([r, n]) => `${RESOURCE_LABELS[r] ?? r}: ${n}`)
          .join(" · ") || "Пусто";
  }
  private changed() {
    if (!this.draft) return;
    const id = this.selected,
      program = structuredClone(this.draft),
      version = ++this.editVersion;
    this.drafts.set(id, structuredClone(program));
    const message = this.ui.el("graph-message");
    if (message) message.textContent = "Сохранение…";
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        try {
          await this.act({ type: "program", id, program });
          if (version === this.editVersion) {
            const el = this.ui.el("graph-message");
            if (el) el.textContent = "Все изменения сохранены";
          }
        } catch (error) {
          const el = this.ui.el("graph-message");
          if (el) el.textContent = "Не сохранено: " + (error as Error).message;
          this.ui.toast(
            "Не удалось сохранить программу: " + (error as Error).message,
          );
        }
      });
  }
  private async run(action: Action) {
    try {
      await this.act(action);
      this.draft = undefined;
      this.render();
    } catch (error) {
      this.ui.toast((error as Error).message);
    }
  }
}
