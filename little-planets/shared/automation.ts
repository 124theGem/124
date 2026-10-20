import { gainExperience } from "./progression";
import { z } from "zod";
import { PLANETS, nodes, ship, type PlanetId } from "./catalog";
import {
  sphereNormal,
  sphereStep,
  surfaceDistance,
  type Point,
} from "./sphere";
import type { Save } from "./model";
const resource = z.enum([
  "wood",
  "stone",
  "spores",
  "crystal",
  "obsidian",
  "thermal",
  "composite",
  "alloy",
]);
const planet = z.string().refine((p) => Object.hasOwn(PLANETS, p));
export const programNodeSchema = z
  .object({
    id: z.string().min(1).max(40),
    op: z.enum(["mine", "cargo", "unload", "load", "travel", "hunt", "wait"]),
    resource,
    planet,
    threshold: z.number().min(1).max(100),
    next: z.string().max(40),
    otherwise: z.string().max(40),
    x: z.number().min(0).max(2000),
    y: z.number().min(0).max(2000),
  })
  .strict();
export const programSchema = z
  .object({
    entry: z.string().max(40),
    nodes: z.array(programNodeSchema).max(40),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.nodes.length) {
      if (p.entry)
        ctx.addIssue({
          code: "custom",
          message: "Пустая программа не имеет входа.",
        });
      return;
    }
    const ids = new Set(p.nodes.map((n) => n.id));
    if (
      ids.size !== p.nodes.length ||
      !ids.has(p.entry) ||
      p.nodes.some((n) => !ids.has(n.next) || !ids.has(n.otherwise))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Все выходы должны быть соединены с существующими блоками; ID должны быть уникальны.",
      });
  });
export type Program = z.infer<typeof programSchema>;
export type ProgramNode = Program["nodes"][number];
export const deviceKinds = [
  "collector",
  "drone",
  "hunter",
  "warehouse",
  "refinery",
] as const;
export type DeviceKind = (typeof deviceKinds)[number];
export const DEVICE_NAMES: Record<DeviceKind, string> = {
  collector: "Робот-сборщик",
  drone: "Грузовой дрон",
  hunter: "Тяжёлый охотник",
  warehouse: "Местный склад",
  refinery: "Станция переработки",
};
export const DEVICE_COSTS: Record<DeviceKind, Record<string, number>> = {
  collector: { wood: 6, stone: 8 },
  drone: { stone: 10, crystal: 5 },
  hunter: { stone: 16, crystal: 6 },
  warehouse: { wood: 6, stone: 6 },
  refinery: { wood: 8, stone: 10 },
};
export const RECIPES = {
  composite: {
    name: "Композит",
    input: { wood: 3, stone: 3 } as Record<string, number>,
    output: 1,
    seconds: 6,
  },
  alloy: {
    name: "Звёздный сплав",
    input: { composite: 3, crystal: 2 } as Record<string, number>,
    output: 1,
    seconds: 9,
  },
};
export interface Device extends Point {
  id: string;
  kind: DeviceKind;
  planet: PlanetId;
  cargo: Record<string, number>;
  capacity: number;
  program: Program;
  pc: string;
  enabled: boolean;
  status: string;
  cooldown: number;
  transit: null | {
    from: PlanetId;
    to: PlanetId;
    started: number;
    ends: number;
  };
  recipe: keyof typeof RECIPES;
  job: null | { recipe: keyof typeof RECIPES; ends: number };
}
export interface Automation {
  devices: Device[];
  lastTick: number;
  serial: number;
}
export function defaultProgram(kind: DeviceKind, planet: PlanetId): Program {
  const node = (
    id: string,
    op: ProgramNode["op"],
    next: string,
    otherwise = next,
    x = 40,
    y = 40,
  ): ProgramNode => ({
    id,
    op,
    next,
    otherwise,
    x,
    y,
    planet,
    resource: PLANETS[planet].resource[0] as ProgramNode["resource"],
    threshold: 80,
  });
  const ns =
    kind === "drone"
      ? [
          node("load", "load", "fly"),
          node("fly", "travel", "unload", "unload", 300, 40),
          node("unload", "unload", "back", "back", 560, 40),
          node("back", "travel", "load", "load", 300, 250),
        ]
      : kind === "hunter"
        ? [node("hunt", "hunt", "hunt")]
        : [
            node("mine", "mine", "full"),
            node("full", "cargo", "unload", "mine", 300, 40),
            node("unload", "unload", "mine", "mine", 560, 40),
          ];
  return { entry: ns[0].id, nodes: ns };
}
export const cargoAmount = (d: Device) =>
  Object.values(d.cargo).reduce((a, b) => a + b, 0);
export function localWarehouse(save: Save, p: PlanetId) {
  return save.automation.devices.find(
    (d) => d.kind === "warehouse" && d.planet === p,
  );
}
function near(d: Point, p: Point, id: PlanetId) {
  return surfaceDistance(d, p, id) < 1.6;
}
function move(d: Device, target: Point, dt: number) {
  if (near(d, target, d.planet)) return true;
  const a = sphereNormal(d, d.planet),
    b = sphereNormal(target, d.planet);
  let direction = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  // Deterministic fallback when the destination is exactly opposite.
  if (Math.hypot(direction.x, direction.y, direction.z) < 1e-8)
    direction = { x: 1, y: 0, z: 1 };
  const p = sphereStep(
    d,
    direction,
    dt * (d.kind === "drone" ? 8 : 3),
    d.planet,
  );
  if (surfaceDistance(d, p, d.planet) < 1e-7) {
    const q = sphereStep(
      d,
      { x: a.z + 0.4, y: a.x + 0.3, z: a.y + 0.2 },
      dt * 3,
      d.planet,
    );
    d.x = q.x;
    d.z = q.z;
  } else {
    d.x = p.x;
    d.z = p.z;
  }
  return near(d, target, d.planet);
}
/** Each quantum executes at most one graph node per actor. No recursive loops or free resources. */
export function advanceAutomation(save: Save, now: number) {
  const a = save.automation,
    elapsed = Math.max(0, Math.min(2000, now - a.lastTick));
  a.lastTick = Math.max(a.lastTick, now);
  // Connected simulation only, capped after suspension; jobs/transit retain paid inputs/cargo.
  for (let left = elapsed; left > 0; left -= 200) {
    const ms = Math.min(200, left),
      t = now - left + ms,
      dt = ms / 1000;
    for (const d of a.devices) {
      if (d.kind === "warehouse") continue;
      if (d.kind === "refinery") {
        if (d.job && t >= d.job.ends) {
          const r = RECIPES[d.job.recipe];
          const stock = save.worlds[d.planet].stock;
          stock[d.job.recipe] = (stock[d.job.recipe] ?? 0) + r.output;
          d.job = null;
        }
        if (!d.enabled || d.job || !localWarehouse(save, d.planet)) continue;
        const r = RECIPES[d.recipe],
          stock = save.worlds[d.planet].stock;
        if (Object.entries(r.input).every(([k, v]) => (stock[k] ?? 0) >= v)) {
          for (const [k, v] of Object.entries(r.input)) stock[k] -= v;
          d.job = { recipe: d.recipe, ends: t + r.seconds * 1000 };
          d.status = `Переработка: ${r.name}`;
        } else d.status = "Ожидает сырьё на местном складе";
        continue;
      }
      if (d.transit) {
        d.status = `Перелёт → ${PLANETS[d.transit.to].name}`;
        if (t >= d.transit.ends) {
          d.planet = d.transit.to;
          Object.assign(d, ship(d.planet));
          d.transit = null;
        } else continue;
      }
      if (!d.enabled) {
        d.status = "Пауза";
        continue;
      }
      const n = d.program.nodes.find((n) => n.id === d.pc);
      if (!n) {
        d.status = d.program.nodes.length
          ? "Ошибка программы"
          : "Программа пуста";
        continue;
      }
      const next = () => {
          d.pc = n.next;
        },
        warehouse = localWarehouse(save, d.planet),
        stock = save.worlds[d.planet].stock;
      d.status = {
        mine: "Добыча",
        cargo: "Проверка загрузки",
        unload: "На склад",
        load: "Загрузка",
        travel: "Маршрут",
        hunt: "Поиск противника",
        wait: "Ожидание",
      }[n.op];
      if (n.op === "cargo") {
        d.pc =
          cargoAmount(d) >= (d.capacity * n.threshold) / 100
            ? n.next
            : n.otherwise;
        continue;
      }
      if (n.op === "wait") {
        if (!d.cooldown) d.cooldown = t + 1000;
        if (t >= d.cooldown) {
          d.cooldown = 0;
          next();
        }
        continue;
      }
      if (n.op === "travel") {
        if (d.kind !== "drone") {
          d.status = "Межпланетный перелёт доступен дронам";
          continue;
        }
        const dest = n.planet as PlanetId;
        if (!save.discovered.includes(dest) || !localWarehouse(save, dest)) {
          d.status = "Нужен открытый мир со складом";
          continue;
        }
        if (dest !== d.planet) {
          // Transfer duration scales with world separation; resources remain in this drone.
          const i = Object.keys(PLANETS).indexOf(d.planet),
            j = Object.keys(PLANETS).indexOf(dest);
          d.transit = {
            from: d.planet,
            to: dest,
            started: t,
            ends: t + 8000 + Math.abs(i - j) * 1000,
          };
        }
        next();
        continue;
      }
      if (n.op === "load" || n.op === "unload") {
        if (!warehouse) {
          d.status = "Постройте местный склад";
          continue;
        }
        if (!move(d, warehouse, dt)) continue;
        if (n.op === "unload") {
          for (const [k, v] of Object.entries(d.cargo))
            stock[k] = (stock[k] ?? 0) + v;
          d.cargo = {};
          next();
        } else {
          const count = Math.min(
            stock[n.resource] ?? 0,
            d.capacity - cargoAmount(d),
          );
          if (count <= 0) {
            d.status = "Ожидает груз";
            continue;
          }
          stock[n.resource] -= count;
          d.cargo[n.resource] = (d.cargo[n.resource] ?? 0) + count;
          if (cargoAmount(d) >= (d.capacity * n.threshold) / 100) next();
        }
        continue;
      }
      if (n.op === "mine") {
        if (d.kind !== "collector") {
          d.status = "Добыча доступна сборщикам";
          continue;
        }
        if (cargoAmount(d) >= d.capacity) {
          next();
          continue;
        }
        const world = save.worlds[d.planet],
          candidates = nodes(d.planet)
            .filter(
              (p) =>
                p.resource === n.resource &&
                !world.clearedNodes.includes(p.id) &&
                (world.depleted[p.id] === undefined ||
                  t - world.depleted[p.id] >= 20000),
            )
            .sort(
              (a, b) =>
                surfaceDistance(a, d, d.planet) -
                surfaceDistance(b, d, d.planet),
            );
        const target = candidates[0];
        if (!target) {
          d.status = "Ожидает восстановления источника";
          continue;
        }
        if (!move(d, target, dt) || t < d.cooldown) continue;
        const count = Math.min(3, d.capacity - cargoAmount(d));
        world.depleted[target.id] = t;
        d.cargo[n.resource] = (d.cargo[n.resource] ?? 0) + count;
        d.cooldown = t + 900;
        next();
        continue;
      }
      if (n.op === "hunt") {
        if (d.kind !== "hunter") {
          d.status = "Бой доступен охотникам";
          continue;
        }
        const enemy = save.worlds[d.planet].enemies
          .filter((e) => e.hp > 0)
          .sort(
            (a, b) =>
              surfaceDistance(a, d, d.planet) - surfaceDistance(b, d, d.planet),
          )[0];
        if (!enemy) {
          d.status = "Патруль: противников нет";
          continue;
        }
        if (!move(d, enemy, dt) || t < d.cooldown) continue;
        enemy.hp = Math.max(0, enemy.hp - 20);
        d.cooldown = t + 700;
        if (!enemy.hp) {
          enemy.defeatedAt = t;
          save.kills++;
          gainExperience(save, 25);
          d.cargo.crystal = (d.cargo.crystal ?? 0) + 2;
          next();
        }
      }
    }
  }
}
