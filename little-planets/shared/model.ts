import { z } from "zod";
import {
  BEDS,
  BUILDINGS,
  PLANTS,
  PLANETS,
  SIZE,
  SHIP,
  key,
  nodes,
  waterCell,
  type PlanetId,
  type BuildingKind,
} from "./catalog";
export interface Crop {
  plant: string;
  plantedAt: number;
}
export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  z: number;
  rotation: number;
}
export interface PlanetState {
  crops: Record<string, Crop>;
  buildings: Building[];
  depleted: Record<string, number>;
}
export interface Save {
  version: 1;
  revision: number;
  planet: PlanetId;
  position: { x: number; z: number };
  inventory: Record<string, number>;
  worlds: Record<PlanetId, PlanetState>;
  updatedAt: number;
}
const planet = z.enum(["listoria", "mycelia", "pyros"]);
const cell = z
  .number()
  .int()
  .min(0)
  .max(SIZE - 1);
export const ActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("move"),
      x: z
        .number()
        .finite()
        .min(0)
        .max(SIZE - 1),
      z: z
        .number()
        .finite()
        .min(0)
        .max(SIZE - 1),
    })
    .strict(),
  z
    .object({
      type: z.literal("plant"),
      x: cell,
      z: cell,
      plant: z.string().max(30),
    })
    .strict(),
  z.object({ type: z.literal("harvest"), x: cell, z: cell }).strict(),
  z.object({ type: z.literal("mine"), id: z.string().max(30) }).strict(),
  z
    .object({
      type: z.literal("build"),
      kind: z.enum(["house", "greenhouse", "warehouse"]),
      x: cell,
      z: cell,
      rotation: z.union([z.literal(0), z.literal(1)]),
    })
    .strict(),
  z.object({ type: z.literal("travel"), planet }).strict(),
]);
export type Action = z.infer<typeof ActionSchema>;
export class RuleError extends Error {}
export function newGame(now = Date.now()): Save {
  const worlds = {} as Save["worlds"];
  for (const p of Object.keys(PLANETS) as PlanetId[])
    worlds[p] = {
      crops: {},
      buildings: [
        { id: "starter-home", kind: "house", x: 3, z: 3, rotation: 0 },
      ],
      depleted: {},
    };
  const inventory: Record<string, number> = {
    wood: 45,
    stone: 30,
    crystal: 6,
    spores: 4,
    obsidian: 8,
    thermal: 4,
  };
  for (const id of Object.keys(PLANTS)) inventory[`seed:${id}`] = 6;
  return {
    version: 1,
    revision: 0,
    planet: "listoria",
    position: { x: 8, z: 11 },
    inventory,
    worlds,
    updatedAt: now,
  };
}
export function stage(crop: Crop, now: number) {
  return Math.min(
    2,
    Math.floor(
      (Math.max(0, now - crop.plantedAt) /
        (PLANTS[crop.plant].seconds * 1000)) *
        3,
    ),
  );
}
export function ready(crop: Crop, now: number) {
  return now - crop.plantedAt >= PLANTS[crop.plant].seconds * 1000;
}
export function nodeReady(state: PlanetState, id: string, now: number) {
  return state.depleted[id] === undefined || now - state.depleted[id] >= 20000;
}
export function buildingAt(state: PlanetState, x: number, z: number) {
  return state.buildings.find(
    (b) => x >= b.x && x < b.x + 2 && z >= b.z && z < b.z + 2,
  );
}
export function walkable(
  save: Save,
  p: PlanetId,
  x: number,
  z: number,
  now = Date.now(),
): boolean {
  const cx = Math.round(x),
    cz = Math.round(z);
  if (
    x < 0.3 ||
    z < 0.3 ||
    x > SIZE - 1.3 ||
    z > SIZE - 1.3 ||
    waterCell(cx, cz)
  )
    return false;
  const state = save.worlds[p];
  if (buildingAt(state, cx, cz) || BEDS.some((b) => b.x === cx && b.z === cz))
    return false;
  // A depleted stump/base remains solid so a respawning source cannot trap a player.
  return !nodes(p).some((n) => n.x === cx && n.z === cz);
}
export function canBuild(save: Save, x: number, z: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return false;
  for (let dx = 0; dx < 2; dx++)
    for (let dz = 0; dz < 2; dz++) {
      const cx = x + dx,
        cz = z + dz;
      if (
        cx < 1 ||
        cz < 1 ||
        cx >= SIZE - 1 ||
        cz >= SIZE - 1 ||
        waterCell(cx, cz) ||
        buildingAt(save.worlds[save.planet], cx, cz) ||
        BEDS.some((b) => b.x === cx && b.z === cz) ||
        nodes(save.planet).some((n) => n.x === cx && n.z === cz) ||
        (Math.abs(cx - SHIP.x) <= 2 && Math.abs(cz - SHIP.z) <= 2) ||
        Math.hypot(cx - save.position.x, cz - save.position.z) < 0.85
      )
        return false;
    }
  return true;
}
function nearby(save: Save, x: number, z: number, distance = 2.4) {
  if (Math.hypot(save.position.x - x, save.position.z - z) > distance)
    throw new RuleError("Подойдите поближе к объекту.");
}
export function applyAction(
  original: Save,
  raw: unknown,
  now = Date.now(),
): Save {
  const action = ActionSchema.parse(raw),
    save = structuredClone(original),
    state = save.worlds[save.planet];
  switch (action.type) {
    case "move":
      if (!walkable(save, save.planet, action.x, action.z, now))
        throw new RuleError("Здесь нельзя пройти.");
      save.position = { x: action.x, z: action.z };
      break;
    case "plant": {
      nearby(save, action.x, action.z);
      const plant = PLANTS[action.plant],
        k = key(action.x, action.z);
      if (!plant || plant.planet !== save.planet)
        throw new RuleError("Это растение растёт на другой планете.");
      if (
        !BEDS.some((b) => b.x === action.x && b.z === action.z) ||
        state.crops[k]
      )
        throw new RuleError("Нужна свободная грядка.");
      const seed = `seed:${action.plant}`;
      if (!(save.inventory[seed] > 0))
        throw new RuleError("Закончились семена.");
      save.inventory[seed]--;
      state.crops[k] = { plant: action.plant, plantedAt: now };
      break;
    }
    case "harvest": {
      nearby(save, action.x, action.z);
      const k = key(action.x, action.z),
        crop = state.crops[k];
      if (!crop || !ready(crop, now))
        throw new RuleError("Урожай ещё не созрел.");
      const harvest = `crop:${crop.plant}`,
        seed = `seed:${crop.plant}`;
      save.inventory[harvest] = (save.inventory[harvest] ?? 0) + 3;
      save.inventory[seed] = (save.inventory[seed] ?? 0) + 2;
      delete state.crops[k];
      break;
    }
    case "mine": {
      const node = nodes(save.planet).find((n) => n.id === action.id);
      if (!node) throw new RuleError("Ресурс не найден.");
      nearby(save, node.x, node.z);
      if (!nodeReady(state, node.id, now))
        throw new RuleError("Ресурс восстанавливается.");
      save.inventory[node.resource] = (save.inventory[node.resource] ?? 0) + 3;
      state.depleted[node.id] = now;
      break;
    }
    case "build": {
      if (!canBuild(save, action.x, action.z))
        throw new RuleError(
          "Выберите свободные клетки вдали от грядок и площадки.",
        );
      const recipe = BUILDINGS[action.kind];
      for (const [r, cost] of Object.entries(recipe.cost))
        if ((save.inventory[r] ?? 0) < cost)
          throw new RuleError("Не хватает ресурсов для постройки.");
      for (const [r, cost] of Object.entries(recipe.cost))
        save.inventory[r] -= cost;
      state.buildings.push({
        id: `b-${now}-${action.x}-${action.z}`,
        kind: action.kind,
        x: action.x,
        z: action.z,
        rotation: action.rotation,
      });
      break;
    }
    case "travel":
      nearby(save, SHIP.x, SHIP.z, 3);
      if (save.planet === action.planet)
        throw new RuleError("Вы уже на этой планете.");
      save.planet = action.planet;
      save.position = { x: SHIP.x - 2, z: SHIP.z };
      break;
  }
  save.revision++;
  save.updatedAt = now;
  return save;
}
// Accept only saves produced by this version; corrupt local data must not crash play.
export function parseSave(raw: string): Save {
  const data = JSON.parse(raw) as Save;
  if (
    data.version !== 1 ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0 ||
    !PLANETS[data.planet] ||
    !data.inventory ||
    !data.worlds
  )
    throw new Error("Неподдерживаемое сохранение");
  for (const value of Object.values(data.inventory))
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Повреждённый инвентарь");
  for (const p of Object.keys(PLANETS) as PlanetId[]) {
    const world = data.worlds[p];
    if (
      !world ||
      !Array.isArray(world.buildings) ||
      !world.crops ||
      !world.depleted
    )
      throw new Error("Повреждённая планета");
    for (const crop of Object.values(world.crops))
      if (!PLANTS[crop.plant] || !Number.isFinite(crop.plantedAt))
        throw new Error("Повреждённое растение");
  }
  if (
    !Number.isFinite(data.position?.x) ||
    !Number.isFinite(data.position?.z) ||
    data.position.x < 0 ||
    data.position.x >= SIZE ||
    data.position.z < 0 ||
    data.position.z >= SIZE
  )
    throw new Error("Повреждённая позиция");
  return data;
}
export function findPath(
  save: Save,
  target: { x: number; z: number },
  now: number,
): { x: number; z: number }[] {
  const start = {
      x: Math.round(save.position.x),
      z: Math.round(save.position.z),
    },
    queue = [start],
    previous = new Map<string, string | null>([[key(start.x, start.z), null]]);
  let end: typeof start | undefined;
  while (queue.length) {
    const cell = queue.shift()!;
    if (Math.hypot(cell.x - target.x, cell.z - target.z) <= 1.6) {
      end = cell;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: cell.x + dx, z: cell.z + dz },
        k = key(next.x, next.z);
      if (
        !previous.has(k) &&
        walkable(save, save.planet, next.x, next.z, now)
      ) {
        previous.set(k, key(cell.x, cell.z));
        queue.push(next);
      }
    }
  }
  if (!end) return [];
  const path = [];
  let k: string | null = key(end.x, end.z);
  while (k && previous.get(k) !== null) {
    const [x, z] = k.split(",").map(Number);
    path.unshift({ x, z });
    k = previous.get(k) ?? null;
  }
  return path;
}
