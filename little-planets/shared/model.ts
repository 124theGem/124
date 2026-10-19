import {
  advanceAutomation,
  programSchema,
  DEVICE_COSTS,
  deviceKinds,
  defaultProgram,
  RECIPES,
  localWarehouse,
  type Automation,
} from "./automation";
import {
  cubeNormal,
  voxelResolution,
  blockSolid,
  blockMaterial,
  setTerrainEdits,
  cellKey,
  voxelCell,
  voxelLevel,
  naturalVoxelLevel,
  VOXEL_STEP,
  offsetPoint,
  type TerrainEdits,
} from "./voxel";
import { sphereNormal } from "./sphere";
import {
  beginFlight,
  redirectFlight,
  stepFlight,
  landingInfo,
  type FlightState,
} from "./space";
import { surfaceDistance } from "./sphere";
import { z } from "zod";
import {
  GEAR,
  INITIAL_PLANETS,
  biomeOf,
  isSphere,
  planetDepth,
  type GearKind,
  BUILDINGS,
  FURNITURE,
  PLANTS,
  PLANETS,
  ROOM,
  HOME_HQ,
  beds,
  ship,
  planetSize,
  key,
  nodes,
  waterCell,
  moduleResources,
  recipes,
  type PlanetId,
  type BuildingKind,
  type FurnitureKind,
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
  resource?: string;
  collectedAt?: number;
}
export interface Furniture {
  id: string;
  kind: FurnitureKind;
  x: number;
  z: number;
  rotation: number;
}
export interface Enemy {
  id: string;
  kind: "beetle" | "drone" | "stalker";
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  hp: number;
  maxHp: number;
  lastAttack: number;
  defeatedAt: number | null;
}
export interface PlanetState {
  crops: Record<string, Crop>;
  buildings: Building[];
  depleted: Record<string, number>;
  eventEpoch: number;
  salvaged: number[];
  enemies: Enemy[];
  lastSimAt: number;
  terrain: TerrainEdits;
  stock: Record<string, number>;
}
export interface Save {
  version: 6;
  automation: Automation;
  lastMine: number;
  flight: FlightState | null;
  revision: number;
  planet: PlanetId;
  position: { x: number; z: number };
  inventory: Record<string, number>;
  worlds: Record<PlanetId, PlanetState>;
  updatedAt: number;
  inside: string | null;
  outsidePosition: { x: number; z: number } | null;
  interiors: Record<string, Furniture[]>;
  discovered: PlanetId[];
  lastDiscovery: PlanetId | null;
  equipment: { weapon: GearKind | null; armor: GearKind | null };
  health: number;
  kills: number;
  deaths: number;
  lastAttack: number;
  lastDamage: number;
}
export class RuleError extends Error {}
const planet = z.string().refine((p) => Object.hasOwn(PLANETS, p)),
  cell = z.number().int().min(0).max(224);
const pilotInput = z
  .object({
    throttle: z.number().min(-1).max(1),
    turn: z.number().min(-1).max(1),
    pitch: z.number().min(-1).max(1),
    brake: z.boolean(),
    boost: z.boolean(),
    autopilot: z.boolean(),
  })
  .strict();
export const ActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("terrain"),
      mode: z.enum(["dig", "place"]),
      x: z.number().finite().min(0).max(224),
      z: z.number().finite().min(0).max(224),
      material: z.enum(["stone", "wood", "obsidian"]).default("stone"),
      level: z.number().int().min(-4).max(28).optional(),
    })
    .strict(),
  z.object({ type: z.literal("deploy"), kind: z.enum(deviceKinds) }).strict(),
  z
    .object({
      type: z.literal("program"),
      id: z.string().max(100),
      program: programSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("toggleDevice"),
      id: z.string().max(100),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("refineryRecipe"),
      id: z.string().max(100),
      recipe: z.enum(["composite", "alloy"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("stock"),
      resource: z.enum([
        "wood",
        "stone",
        "spores",
        "crystal",
        "obsidian",
        "thermal",
        "composite",
        "alloy",
      ]),
      amount: z.number().int().min(1).max(1000),
      direction: z.enum(["deposit", "withdraw"]),
    })
    .strict(),

  z
    .object({
      type: z.literal("pilot"),
      commands: z
        .array(
          z
            .object({ input: pilotInput, dt: z.number().min(0.001).max(0.2) })
            .strict(),
        )
        .min(1)
        .max(40),
    })
    .strict(),
  z.object({ type: z.literal("course"), planet }).strict(),
  z.object({ type: z.literal("land") }).strict(),
  z.object({ type: z.literal("scan") }).strict(),
  z
    .object({
      type: z.literal("equip"),
      slot: z.enum(["weapon", "armor"]),
      item: z
        .enum(["sword", "spear", "blaster", "scout", "guardian", "aegis"])
        .nullable(),
    })
    .strict(),
  z.object({ type: z.literal("attack"), id: z.string().max(100) }).strict(),
  z.object({ type: z.literal("combatTick") }).strict(),
  z
    .object({
      type: z.literal("move"),
      x: z.number().finite().min(0).max(224),
      z: z.number().finite().min(0).max(224),
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
      kind: z.enum([
        "headquarters",
        "house",
        "greenhouse",
        "warehouse",
        "laboratory",
        "extractor",
        "bioextractor",
      ]),
      x: cell,
      z: cell,
      rotation: z.union([z.literal(0), z.literal(1)]),
      resource: z.string().max(20).optional(),
    })
    .strict(),
  z.object({ type: z.literal("travel"), planet }).strict(),
  z
    .object({
      type: z.literal("craft"),
      recipe: z.string().max(50),
      count: z.number().int().min(1).max(10).default(1),
    })
    .strict(),
  z.object({ type: z.literal("collect"), id: z.string().max(100) }).strict(),
  z.object({ type: z.literal("enter"), id: z.string().max(100) }).strict(),
  z.object({ type: z.literal("exit") }).strict(),
  z
    .object({
      type: z.literal("placeFurniture"),
      kind: z.enum([
        "chair",
        "table",
        "bed",
        "sofa",
        "cabinet",
        "fireplace",
        "rug",
      ]),
      x: cell,
      z: cell,
      rotation: z.union([z.literal(0), z.literal(1)]),
    })
    .strict(),
  z
    .object({ type: z.literal("takeFurniture"), id: z.string().max(100) })
    .strict(),
  z
    .object({
      type: z.literal("salvage"),
      event: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type Action = z.infer<typeof ActionSchema>;
export function newGame(now = Date.now()): Save {
  const worlds = {} as Save["worlds"];
  for (const p of Object.keys(PLANETS) as PlanetId[])
    worlds[p] = {
      crops: {},
      buildings:
        p === "home"
          ? [{ id: "home-hq", kind: "headquarters", ...HOME_HQ, rotation: 0 }]
          : [],
      depleted: {},
      eventEpoch: now,
      salvaged: [],
      enemies: spawnEnemies(p),
      lastSimAt: now,
      terrain: {},
      stock: {},
    };
  const inventory: Record<string, number> = {
    "tool:pickaxe": 1,
    wood: 90,
    stone: 75,
    crystal: 20,
    spores: 15,
    obsidian: 12,
    thermal: 8,
  };
  for (const id of Object.keys(PLANTS)) inventory[`seed:${id}`] = 6;
  return {
    version: 6,
    automation: { devices: [], lastTick: now, serial: 0 },
    lastMine: 0,
    flight: null,
    revision: 0,
    planet: "home",
    position: { x: ship("home").x - 1, z: ship("home").z },
    inventory,
    worlds,
    updatedAt: now,
    inside: null,
    outsidePosition: null,
    interiors: { "home-hq": [] },
    discovered: [...INITIAL_PLANETS],
    lastDiscovery: null,
    equipment: { weapon: null, armor: null },
    health: 100,
    kills: 0,
    deaths: 0,
    lastAttack: 0,
    lastDamage: 0,
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
    (b) =>
      x >= b.x &&
      x < b.x + BUILDINGS[b.kind].size &&
      z >= b.z &&
      z < b.z + BUILDINGS[b.kind].size,
  );
}
export function buildingCenter(b: Building) {
  const offset = (BUILDINGS[b.kind].size - 1) / 2;
  return { x: b.x + offset, z: b.z + offset };
}
export function roomItems(save: Save) {
  return save.inside ? (save.interiors[save.inside] ?? []) : [];
}
export function furnitureSize(kind: FurnitureKind, rotation: number) {
  const f = FURNITURE[kind];
  return rotation ? { w: f.d, d: f.w } : { w: f.w, d: f.d };
}
export function furnitureAt(save: Save, x: number, z: number) {
  return roomItems(save).find((f) => {
    const size = furnitureSize(f.kind, f.rotation);
    return x >= f.x && x < f.x + size.w && z >= f.z && z < f.z + size.d;
  });
}
export function walkable(
  save: Save,
  p: PlanetId,
  x: number,
  z: number,
  _now = Date.now(),
): boolean {
  if (!save.inside && isSphere(p))
    return (
      Number.isFinite(x) &&
      Number.isFinite(z) &&
      x >= 0 &&
      x < planetSize(p) &&
      z >= 0 &&
      z <= planetDepth(p)
    );
  const cx = Math.round(x),
    cz = Math.round(z);
  if (save.inside) {
    if (x < 0.6 || z < 0.6 || x > ROOM.width - 1.6 || z > ROOM.depth - 1.2)
      return false;
    return !roomItems(save).some((f) => {
      const s = furnitureSize(f.kind, f.rotation);
      return (
        !FURNITURE[f.kind].walkable &&
        cx >= f.x &&
        cx < f.x + s.w &&
        cz >= f.z &&
        cz < f.z + s.d
      );
    });
  }
  const size = planetSize(p);
  if (
    x < 0.3 ||
    z < 0.3 ||
    x > size - 1.3 ||
    z > size - 1.3 ||
    waterCell(cx, cz)
  )
    return false;
  return (
    !buildingAt(save.worlds[p], cx, cz) &&
    !beds(p).some((b) => b.x === cx && b.z === cz) &&
    !nodes(p).some((n) => n.x === cx && n.z === cz)
  );
}
export interface WorldEvent {
  id: number;
  type: "meteor" | "wind" | "rain" | "storm" | "hurricane";
  x: number;
  z: number;
  startsAt: number;
  impactAt: number;
  endsAt: number;
  claimed: boolean;
}
function hash(n: number) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
export function worldEvent(
  save: Save,
  p: PlanetId,
  now: number,
): WorldEvent | null {
  const world = save.worlds[p],
    elapsed = now - world.eventEpoch;
  if (elapsed < 25000) return null;
  const id = Math.floor((elapsed - 25000) / 85000),
    seed = hash(
      id * 131 +
        (Object.keys(PLANETS).indexOf(p) + 1) * 4093 +
        Math.floor(world.eventEpoch / 1000),
    );
  const startsAt = world.eventEpoch + 25000 + id * 85000 + (seed % 12000);
  const types = ["meteor", "wind", "rain", "storm", "hurricane"] as const;
  const type = types[id % 5],
    endsAt = startsAt + (type === "meteor" ? 65000 : 40000);
  if (now < startsAt || now > endsAt) return null;
  const size = planetSize(p);
  let x = 3,
    z = 3;
  for (let i = 0; i < 160; i++) {
    x = 2 + (hash(seed + i * 17) % (size - 4));
    z =
      2 +
      (hash(seed + i * 29 + 1) % Math.max(1, Math.floor(planetDepth(p) - 4)));
    if (
      walkable({ ...save, inside: null }, p, x, z, now) &&
      Math.hypot(x - ship(p).x, z - ship(p).z) > 3
    )
      break;
  }
  return {
    id,
    type,
    x,
    z,
    startsAt,
    impactAt: startsAt + 5000,
    endsAt,
    claimed: world.salvaged.includes(id),
  };
}
export function canBuild(
  save: Save,
  x: number,
  z: number,
  kind: BuildingKind = "house",
  now = Date.now(),
): boolean {
  if (save.inside || !Number.isInteger(x) || !Number.isInteger(z)) return false;
  const b = BUILDINGS[kind];
  if (!b || b.zone !== (save.planet === "home" ? "home" : "outpost"))
    return false;
  if (b.zone === "outpost" && !moduleResources(save.planet, kind).length)
    return false;
  const event = worldEvent(save, save.planet, now),
    pad = ship(save.planet),
    size = planetSize(save.planet);
  for (let dx = 0; dx < b.size; dx++)
    for (let dz = 0; dz < b.size; dz++) {
      const cx = x + dx,
        cz = z + dz;
      if (
        cx < 1 ||
        cz < 1 ||
        cx >= size - 1 ||
        cz >= planetDepth(save.planet) - 1 ||
        waterCell(cx, cz) ||
        buildingAt(save.worlds[save.planet], cx, cz) ||
        beds(save.planet).some((p) => p.x === cx && p.z === cz) ||
        nodes(save.planet).some((n) => n.x === cx && n.z === cz) ||
        (Math.abs(cx - pad.x) <= 2 && Math.abs(cz - pad.z) <= 2) ||
        Math.hypot(cx - save.position.x, cz - save.position.z) < 0.9 ||
        (event?.type === "meteor" &&
          Math.hypot(cx - event.x, cz - event.z) < 1.5)
      )
        return false;
    }
  return true;
}
export function canPlaceFurniture(
  save: Save,
  x: number,
  z: number,
  kind: FurnitureKind,
  rotation: number,
) {
  if (!save.inside || !Number.isInteger(x) || !Number.isInteger(z))
    return false;
  const s = furnitureSize(kind, rotation);
  for (let dx = 0; dx < s.w; dx++)
    for (let dz = 0; dz < s.d; dz++) {
      const cx = x + dx,
        cz = z + dz;
      if (
        cx < 1 ||
        cz < 1 ||
        cx >= ROOM.width - 1 ||
        cz >= ROOM.depth - 1 ||
        Math.hypot(cx - ROOM.door.x, cz - ROOM.door.z) < 1.5 ||
        furnitureAt(save, cx, cz) ||
        (!FURNITURE[kind].walkable &&
          Math.hypot(cx - save.position.x, cz - save.position.z) < 0.9)
      )
        return false;
    }
  return true;
}
export function hasLab(save: Save) {
  return save.worlds.home.buildings.some((b) => b.kind === "laboratory");
}
export function moduleCapacity(save: Save) {
  return (
    40 +
    save.worlds.home.buildings.filter((b) => b.kind === "warehouse").length * 40
  );
}
export function moduleAmount(save: Save, b: Building, now: number) {
  return Math.min(
    moduleCapacity(save),
    Math.max(0, Math.floor((now - (b.collectedAt ?? now)) / 20000)) *
      (BUILDINGS[b.kind].rate ?? 0),
  );
}
export function canAfford(save: Save, cost: Record<string, number>, count = 1) {
  return Object.entries(cost).every(
    ([r, n]) => (save.inventory[r] ?? 0) >= n * count,
  );
}
function charge(save: Save, cost: Record<string, number>, count = 1) {
  if (!canAfford(save, cost, count))
    throw new RuleError("Не хватает ресурсов.");
  for (const [r, n] of Object.entries(cost)) save.inventory[r] -= n * count;
}
function nearby(save: Save, x: number, z: number, distance = 2.7) {
  if (
    surfaceDistance(
      save.position,
      { x, z },
      !save.inside && isSphere(save.planet) ? save.planet : false,
    ) > distance
  )
    throw new RuleError("Подойдите поближе к объекту.");
}
export function applyAction(
  original: Save,
  raw: unknown,
  now = Date.now(),
): Save {
  for (const [p, w] of Object.entries(original.worlds))
    setTerrainEdits(p as PlanetId, w.terrain);
  const action = ActionSchema.parse(raw),
    save = structuredClone(original),
    world = save.worlds[save.planet];
  if (save.flight && !["pilot", "course", "land"].includes(action.type))
    throw new RuleError("Сначала завершите полёт и посадку.");
  advanceAutomation(save, now);
  if (advanceEnemies(save, now)) {
    save.revision++;
    save.updatedAt = now;
    return save;
  }
  if (
    save.inside &&
    ![
      "move",
      "craft",
      "placeFurniture",
      "takeFurniture",
      "exit",
      "equip",
      "combatTick",
    ].includes(action.type)
  )
    throw new RuleError("Сначала выйдите из дома.");
  switch (action.type) {
    case "terrain": {
      if (save.flight || save.inside)
        throw new RuleError("Выйдите на поверхность.");
      if (!walkable(save, save.planet, action.x, action.z, now))
        throw new RuleError("Вне поверхности.");
      nearby(save, action.x, action.z, 3.2);
      if (now - save.lastMine < 250)
        throw new RuleError("Дождитесь следующего взмаха.");
      const n = sphereNormal(action, save.planet),
        c = voxelCell(n, save.planet),
        k = cellKey(n, save.planet);
      const h = voxelLevel(c.normal, save.planet, world.terrain);
      const natural = Math.round(
          naturalVoxelLevel(c.normal, save.planet) / VOXEL_STEP,
        ),
        level =
          action.level ??
          Math.round(h / VOXEL_STEP) + (action.mode === "place" ? 1 : 0),
        blocks = { ...(world.terrain[k]?.blocks ?? {}) },
        removed = new Set(world.terrain[k]?.removed ?? []);
      if (action.mode === "dig") {
        if (!save.inventory["tool:pickaxe"])
          throw new RuleError("Нужна кирка.");
        if (level <= -4) throw new RuleError("Неразрушимое ядро.");
        if (!blockSolid(c.normal, save.planet, level, world.terrain))
          throw new RuleError("Блок уже разрушен.");
        const resource = blockMaterial(
          c.normal,
          save.planet,
          level,
          world.terrain,
        );
        save.inventory[resource] = (save.inventory[resource] ?? 0) + 1;
        removed.add(level);
        delete blocks[String(level)];
      } else {
        if (level > 28) throw new RuleError("Достигнута предельная высота.");
        if (blockSolid(c.normal, save.planet, level, world.terrain))
          throw new RuleError("Здесь уже есть блок.");
        if (!(save.inventory[action.material] > 0))
          throw new RuleError("Не хватает материала.");
        // Placed blocks must touch the terrain/another block; no floating placement.
        const connected =
          blockSolid(c.normal, save.planet, level - 1, world.terrain) ||
          blockSolid(c.normal, save.planet, level + 1, world.terrain) ||
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([di, dj]) => {
            const near = voxelCell(
              cubeNormal(
                c.face,
                -1 + ((c.i + 0.5 + di) * 2) / voxelResolution(save.planet),
                -1 + ((c.j + 0.5 + dj) * 2) / voxelResolution(save.planet),
              ),
              save.planet,
            );
            return blockSolid(near.normal, save.planet, level, world.terrain);
          });
        if (!connected)
          throw new RuleError(
            "Блок должен примыкать к земле или другому блоку.",
          );
        save.inventory[action.material]--;
        removed.delete(level);
        blocks[String(level)] = action.material;
      }
      let top = 28;
      while (
        top > -4 &&
        !(removed.has(top) ? false : top <= natural || blocks[String(top)])
      )
        top--;
      world.terrain[k] = {
        height: Math.round(top * VOXEL_STEP * 100) / 100,
        material: blocks[String(top)] ?? "stone",
        blocks,
        removed: [...removed].sort((a, b) => a - b),
      };
      save.lastMine = now;
      break;
    }
    case "deploy": {
      if (save.automation.devices.length >= 80)
        throw new RuleError("Лимит: 80 устройств.");
      if (
        ["warehouse", "refinery"].includes(action.kind) &&
        save.automation.devices.some(
          (d) =>
            d.kind === action.kind &&
            d.planet === save.planet &&
            surfaceDistance(d, save.position, save.planet) < 3,
        )
      )
        throw new RuleError("Здесь уже есть станция.");
      charge(save, DEVICE_COSTS[action.kind]);
      const program = defaultProgram(action.kind, save.planet);
      save.automation.devices.push({
        id: `device-${++save.automation.serial}`,
        kind: action.kind,
        planet: save.planet,
        ...save.position,
        cargo: {},
        capacity: 30,
        program,
        pc: program.entry,
        enabled: true,
        status: "Готов",
        cooldown: 0,
        transit: null,
        recipe: "composite",
        job: null,
      });
      break;
    }
    case "program": {
      const d = save.automation.devices.find((d) => d.id === action.id);
      if (!d || ["warehouse", "refinery"].includes(d.kind))
        throw new RuleError("Робот не найден.");
      if (
        action.program.nodes.some(
          (n) => !save.discovered.includes(n.planet as PlanetId),
        )
      )
        throw new RuleError("Неизвестная планета в программе.");
      d.program = action.program;
      d.pc = action.program.entry;
      d.cooldown = 0;
      break;
    }
    case "toggleDevice": {
      const d = save.automation.devices.find((d) => d.id === action.id);
      if (!d) throw new RuleError("Устройство не найдено.");
      d.enabled = action.enabled;
      break;
    }
    case "refineryRecipe": {
      const d = save.automation.devices.find(
        (d) => d.id === action.id && d.kind === "refinery",
      );
      if (!d) throw new RuleError("Станция не найдена.");
      d.recipe = action.recipe;
      break;
    }
    case "stock": {
      const w = localWarehouse(save, save.planet);
      if (!w) throw new RuleError("Постройте местный склад.");
      nearby(save, w.x, w.z, 3.5);
      const from =
          action.direction === "deposit" ? save.inventory : world.stock,
        to = action.direction === "deposit" ? world.stock : save.inventory;
      if ((from[action.resource] ?? 0) < action.amount)
        throw new RuleError("Не хватает ресурса.");
      from[action.resource] -= action.amount;
      to[action.resource] = (to[action.resource] ?? 0) + action.amount;
      break;
    }

    case "pilot": {
      if (!save.flight) throw new RuleError("Корабль на поверхности.");
      const total = action.commands.reduce((n, c) => n + c.dt, 0);
      if (total > 1.45 || total > (now - save.flight.lastUpdate) / 1000 + 0.35)
        throw new RuleError("Некорректное время управления полётом.");
      for (const c of action.commands)
        save.flight = stepFlight(save.flight, c.input, c.dt, save.discovered);
      save.flight.lastUpdate = Math.max(
        save.flight.lastUpdate + total * 1000,
        now - 1500,
      );
      break;
    }
    case "course": {
      if (!save.flight || !save.discovered.includes(action.planet as PlanetId))
        throw new RuleError("Недоступный курс.");
      save.flight = redirectFlight(
        save.flight,
        action.planet as PlanetId,
        save.discovered,
      );
      break;
    }
    case "land": {
      if (!save.flight || !landingInfo(save.flight).allowed)
        throw new RuleError(
          "Подлетите к посадочному маяку и снизьте скорость до 7 м/с.",
        );
      save.planet = save.flight.target;
      save.flight = null;
      const pad = ship(save.planet);
      save.position = offsetPoint(pad, -1, 0, save.planet);
      save.worlds[save.planet].lastSimAt = now;
      if (save.planet === "home") save.health = 100;
      break;
    }
    case "combatTick":
      break;
    case "equip": {
      if (action.item) {
        const gear = GEAR[action.item];
        if (
          gear.slot !== action.slot ||
          !(save.inventory[`gear:${action.item}`] > 0)
        )
          throw new RuleError("Сначала создайте подходящую экипировку.");
      }
      save.equipment[action.slot] = action.item;
      break;
    }
    case "scan": {
      const pad = ship(save.planet);
      nearby(save, pad.x, pad.z, 3);
      const pool = Object.keys(PLANETS).filter(
        (p) =>
          p.startsWith("wild-") && !save.discovered.includes(p as PlanetId),
      ) as PlanetId[];
      if (!pool.length)
        throw new RuleError("Все 24 экспедиционных мира уже обнаружены.");
      const p = pool[hash(Math.floor(now) ^ save.revision) % pool.length];
      save.discovered.push(p);
      save.lastDiscovery = p;
      break;
    }
    case "attack": {
      const enemy = world.enemies.find((e) => e.id === action.id && e.hp > 0);
      if (!enemy) throw new RuleError("Противник уже повержен.");
      const weapon = save.equipment.weapon ? GEAR[save.equipment.weapon] : null;
      if (now - save.lastAttack < (weapon?.cooldown ?? 650))
        throw new RuleError("Оружие ещё не готово.");
      nearby(save, enemy.x, enemy.z, weapon?.range ?? 1.9);
      enemy.hp = Math.max(0, enemy.hp - (weapon?.damage ?? 5));
      save.lastAttack = now;
      if (!enemy.hp) {
        enemy.defeatedAt = now;
        save.kills++;
        const resource =
          PLANETS[save.planet].resource[world.enemies.indexOf(enemy) % 2];
        save.inventory[resource] = (save.inventory[resource] ?? 0) + 5;
        save.inventory.crystal = (save.inventory.crystal ?? 0) + 2;
      }
      break;
    }
    case "move":
      if (!walkable(save, save.planet, action.x, action.z, now))
        throw new RuleError("Здесь нельзя пройти.");
      save.position = { x: action.x, z: action.z };
      break;
    case "plant": {
      nearby(save, action.x, action.z);
      const plant = PLANTS[action.plant],
        k = key(action.x, action.z);
      if (
        !plant ||
        (plant.planet !== biomeOf(save.planet) &&
          !(save.planet === "home" && plant.planet === "listoria"))
      )
        throw new RuleError("Это растение для другого биома.");
      if (
        !beds(save.planet).some((b) => b.x === action.x && b.z === action.z) ||
        world.crops[k]
      )
        throw new RuleError("Нужна свободная грядка.");
      const seed = `seed:${action.plant}`;
      if (!(save.inventory[seed] > 0))
        throw new RuleError("Закончились семена.");
      save.inventory[seed]--;
      world.crops[k] = { plant: action.plant, plantedAt: now };
      break;
    }
    case "harvest": {
      nearby(save, action.x, action.z);
      const k = key(action.x, action.z),
        crop = world.crops[k];
      if (!crop || !ready(crop, now))
        throw new RuleError("Урожай ещё не созрел.");
      for (const [item, n] of [
        [`crop:${crop.plant}`, 3],
        [`seed:${crop.plant}`, 2],
      ] as const)
        save.inventory[item] = (save.inventory[item] ?? 0) + n;
      delete world.crops[k];
      break;
    }
    case "mine": {
      const n = nodes(save.planet).find((n) => n.id === action.id);
      if (!n) throw new RuleError("Ресурс не найден.");
      nearby(save, n.x, n.z);
      if (!nodeReady(world, n.id, now))
        throw new RuleError("Ресурс восстанавливается.");
      save.inventory[n.resource] = (save.inventory[n.resource] ?? 0) + 3;
      world.depleted[n.id] = now;
      break;
    }
    case "craft": {
      const recipe = recipes().find((r) => r.id === action.recipe);
      if (!recipe) throw new RuleError("Рецепт не найден.");
      if (recipe.lab && !hasLab(save))
        throw new RuleError("Сначала постройте лабораторию на родной планете.");
      charge(save, recipe.cost, action.count);
      save.inventory[recipe.id] =
        (save.inventory[recipe.id] ?? 0) + action.count;
      break;
    }
    case "build": {
      const recipe = BUILDINGS[action.kind];
      if (recipe.zone !== (save.planet === "home" ? "home" : "outpost"))
        throw new RuleError(
          save.planet === "home"
            ? "Добывающие модули размещаются на исследовательских планетах."
            : "Здания базы можно строить только на родной планете.",
        );
      if (!canBuild(save, action.x, action.z, action.kind, now))
        throw new RuleError(
          "Выберите свободные клетки вдали от грядок, ресурсов и площадки.",
        );
      let resource: string | undefined;
      if (recipe.zone === "outpost") {
        const valid = moduleResources(save.planet, action.kind);
        resource = action.resource ?? valid[0];
        if (!resource || !valid.includes(resource as never))
          throw new RuleError("Этот модуль не добывает выбранный ресурс.");
        const center = {
          x: action.x + (recipe.size - 1) / 2,
          z: action.z + (recipe.size - 1) / 2,
        };
        if (
          !nodes(save.planet).some(
            (n) =>
              n.resource === resource &&
              Math.hypot(n.x - center.x, n.z - center.z) <= 5,
          )
        )
          throw new RuleError(
            "Разместите модуль не дальше 5 клеток от нужного источника.",
          );
      }
      if (action.kind === "bioextractor" && !hasLab(save))
        throw new RuleError("Для биомодуля нужна лаборатория.");
      const kit = `kit:${action.kind}`;
      if ((save.inventory[kit] ?? 0) > 0) save.inventory[kit]--;
      else charge(save, recipe.cost);
      const b: Building = {
        id: `b-${now}-${action.x}-${action.z}`,
        kind: action.kind,
        x: action.x,
        z: action.z,
        rotation: action.rotation,
        ...(resource ? { resource, collectedAt: now } : {}),
      };
      world.buildings.push(b);
      if (b.kind === "headquarters") save.interiors[b.id] = [];
      break;
    }
    case "collect": {
      const b = world.buildings.find((b) => b.id === action.id);
      if (!b?.resource || !BUILDINGS[b.kind].rate)
        throw new RuleError("Добывающий модуль не найден.");
      const c = buildingCenter(b);
      nearby(save, c.x, c.z, 3);
      const amount = moduleAmount(save, b, now);
      if (!amount) throw new RuleError("Модуль ещё добывает ресурс.");
      save.inventory[b.resource] = (save.inventory[b.resource] ?? 0) + amount;
      b.collectedAt = now;
      break;
    }
    case "travel": {
      const pad = ship(save.planet);
      nearby(save, pad.x, pad.z, 3);
      if (!save.discovered.includes(action.planet as PlanetId))
        throw new RuleError("Сначала найдите эту планету сканером.");
      if (save.planet === action.planet) throw new RuleError("Вы уже здесь.");
      save.flight = beginFlight(
        save.planet,
        action.planet as PlanetId,
        save.discovered,
        now,
      );
      break;
    }
    case "enter": {
      if (save.planet !== "home")
        throw new RuleError("Главный дом находится на родной планете.");
      const b = world.buildings.find(
        (b) => b.id === action.id && b.kind === "headquarters",
      );
      if (!b) throw new RuleError("Главный дом не найден.");
      const c = buildingCenter(b);
      nearby(save, c.x, c.z, 3.3);
      save.inside = b.id;
      save.outsidePosition = { ...save.position };
      save.position = { ...ROOM.spawn };
      save.interiors[b.id] ??= [];
      break;
    }
    case "exit": {
      if (!save.inside) throw new RuleError("Вы уже снаружи.");
      nearby(save, ROOM.door.x, ROOM.door.z, 1.7);
      save.position = save.outsidePosition ?? { x: 18, z: 21 };
      save.inside = null;
      save.outsidePosition = null;
      break;
    }
    case "placeFurniture": {
      if (
        !canPlaceFurniture(
          save,
          action.x,
          action.z,
          action.kind,
          action.rotation,
        )
      )
        throw new RuleError(
          "Мебель нельзя поставить здесь. Оставьте проход к двери.",
        );
      const item = `furniture:${action.kind}`;
      if (!(save.inventory[item] > 0))
        throw new RuleError("Сначала создайте предмет в разделе крафта.");
      save.inventory[item]--;
      save.interiors[save.inside!].push({
        id: `f-${now}-${action.x}-${action.z}`,
        kind: action.kind,
        x: action.x,
        z: action.z,
        rotation: action.rotation,
      });
      break;
    }
    case "takeFurniture": {
      if (!save.inside) throw new RuleError("Нужно войти в дом.");
      const items = roomItems(save),
        item = items.find((f) => f.id === action.id);
      if (!item) throw new RuleError("Предмет не найден.");
      nearby(save, item.x, item.z, 4);
      save.interiors[save.inside] = items.filter((f) => f.id !== item.id);
      const id = `furniture:${item.kind}`;
      save.inventory[id] = (save.inventory[id] ?? 0) + 1;
      break;
    }
    case "salvage": {
      const event = worldEvent(save, save.planet, now);
      if (
        !event ||
        event.type !== "meteor" ||
        event.id !== action.event ||
        now < event.impactAt ||
        event.claimed
      )
        throw new RuleError("Метеорит недоступен.");
      nearby(save, event.x, event.z);
      save.inventory.crystal = (save.inventory.crystal ?? 0) + 4;
      save.inventory.stone = (save.inventory.stone ?? 0) + 6;
      world.salvaged.push(event.id);
      world.salvaged = world.salvaged.slice(-30);
      break;
    }
  }
  save.revision++;
  save.updatedAt = now;
  return save;
}
const cropSchema = z.object({
  plant: z.string(),
  plantedAt: z.number().finite(),
});
const bSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "headquarters",
    "house",
    "greenhouse",
    "warehouse",
    "laboratory",
    "extractor",
    "bioextractor",
  ]),
  x: cell,
  z: cell,
  rotation: z.number().int().min(0).max(1),
  resource: z.string().optional(),
  collectedAt: z.number().finite().optional(),
});
const fSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "chair",
    "table",
    "bed",
    "sofa",
    "cabinet",
    "fireplace",
    "rug",
  ]),
  x: cell,
  z: cell,
  rotation: z.number().int().min(0).max(1),
});
const worldSchema = z.object({
  crops: z.record(z.string(), cropSchema),
  buildings: z.array(bSchema),
  depleted: z.record(z.string(), z.number().finite()),
  eventEpoch: z.number().finite(),
  salvaged: z.array(z.number().int().nonnegative()),
  enemies: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["beetle", "drone", "stalker"]),
      x: z.number().finite(),
      z: z.number().finite(),
      homeX: z.number().finite(),
      homeZ: z.number().finite(),
      hp: z.number().nonnegative(),
      maxHp: z.number().positive(),
      lastAttack: z.number().finite(),
      defeatedAt: z.number().finite().nullable(),
    }),
  ),
  lastSimAt: z.number().finite(),
  terrain: z.record(
    z.string(),
    z.object({
      height: z.number().min(-1.8).max(12.6),
      material: z.enum(["stone", "wood", "obsidian"]),
      blocks: z
        .record(z.string(), z.enum(["stone", "wood", "obsidian"]))
        .optional(),
      removed: z.array(z.number().int().min(-3).max(28)).max(32).optional(),
    }),
  ),
  stock: z.record(z.string(), z.number().int().nonnegative()),
});
const positionSchema = z.object({
  x: z.number().finite().nonnegative(),
  z: z.number().finite().nonnegative(),
});
const saveSchema = z.object({
  version: z.literal(6),
  lastMine: z.number().finite(),
  automation: z.object({
    lastTick: z.number().finite(),
    serial: z.number().int().nonnegative(),
    devices: z
      .array(
        z.object({
          id: z.string(),
          kind: z.enum(deviceKinds),
          planet,
          x: z.number().finite(),
          z: z.number().finite(),
          cargo: z.record(z.string(), z.number().int().nonnegative()),
          capacity: z.number().positive(),
          program: programSchema,
          pc: z.string(),
          enabled: z.boolean(),
          status: z.string(),
          cooldown: z.number().finite(),
          transit: z
            .object({
              from: planet,
              to: planet,
              started: z.number().finite(),
              ends: z.number().finite(),
            })
            .nullable(),
          recipe: z.enum(["composite", "alloy"]),
          job: z
            .object({
              recipe: z.enum(["composite", "alloy"]),
              ends: z.number().finite(),
            })
            .nullable(),
        }),
      )
      .max(80),
  }),
  flight: z
    .object({
      origin: planet,
      target: planet,
      position: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
      }),
      velocity: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
      }),
      forward: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
      }),
      up: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
      }),
      route: z.array(
        z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          z: z.number().finite(),
        }),
      ),
      waypoint: z.number().int().nonnegative(),
      autopilot: z.boolean(),
      startedAt: z.number().finite(),
      lastUpdate: z.number().finite(),
      distance: z.number().nonnegative(),
    })
    .nullable(),
  revision: z.number().int().nonnegative(),
  planet,
  position: positionSchema,
  inventory: z.record(z.string(), z.number().int().nonnegative()),
  worlds: z.record(planet, worldSchema),
  updatedAt: z.number().finite(),
  inside: z.string().nullable(),
  outsidePosition: positionSchema.nullable(),
  interiors: z.record(z.string(), z.array(fSchema)),
  discovered: z.array(planet),
  lastDiscovery: planet.nullable(),
  equipment: z.object({
    weapon: z.enum(["sword", "spear", "blaster"]).nullable(),
    armor: z.enum(["scout", "guardian", "aegis"]).nullable(),
  }),
  health: z.number().min(1).max(100),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  lastAttack: z.number().finite(),
  lastDamage: z.number().finite(),
});
export function parseSave(raw: string): Save {
  const data = JSON.parse(raw);
  // Prototype builds deliberately start a new world; no version-to-version migration.
  if ([1, 2, 3, 4, 5].includes(data?.version)) return newGame();
  const save = saveSchema.parse(data) as Save;
  for (const p of Object.keys(PLANETS) as PlanetId[])
    if (!save.worlds[p]) throw new Error("Отсутствует планета");
  if (
    save.flight &&
    (save.flight.origin !== save.planet ||
      !save.discovered.includes(save.flight.target))
  )
    throw new Error("Повреждённый полёт");
  if (!save.discovered.includes(save.planet))
    throw new Error("Планета не открыта");
  for (const p of Object.keys(PLANETS) as PlanetId[])
    for (const [k, crop] of Object.entries(save.worlds[p].crops)) {
      const [x, z] = k.split(",").map(Number);
      if (!PLANTS[crop.plant] || !beds(p).some((b) => b.x === x && b.z === z))
        throw new Error("Повреждённое растение");
    }
  if (
    save.inside &&
    (save.planet !== "home" ||
      !save.worlds.home.buildings.some(
        (b) => b.id === save.inside && b.kind === "headquarters",
      ) ||
      !save.interiors[save.inside] ||
      !save.outsidePosition)
  )
    throw new Error("Повреждённый интерьер");
  const maxX = save.inside ? ROOM.width : planetSize(save.planet),
    maxZ = save.inside ? ROOM.depth : planetDepth(save.planet);
  if (save.position.x >= maxX || save.position.z > maxZ)
    throw new Error("Повреждённая позиция");
  return save;
}
export function findPath(
  save: Save,
  target: { x: number; z: number },
  now: number,
  reach = 1.6,
): { x: number; z: number }[] {
  const start = {
      x: Math.round(save.position.x),
      z: Math.round(save.position.z),
    },
    queue = [start],
    previous = new Map<string, string | null>([[key(start.x, start.z), null]]);
  let end: typeof start | undefined;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const c = queue[cursor];
    if (Math.hypot(c.x - target.x, c.z - target.z) <= reach) {
      end = c;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: c.x + dx, z: c.z + dz },
        k = key(n.x, n.z);
      if (!previous.has(k) && walkable(save, save.planet, n.x, n.z, now)) {
        previous.set(k, key(c.x, c.z));
        queue.push(n);
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

export function spawnEnemies(p: PlanetId): Enemy[] {
  if (!PLANETS[p].hostile) return [];
  const size = planetSize(p),
    result: Enemy[] = [];
  for (let i = 0; i < 6; i++) {
    let x = 3 + ((i * 7 + 3 + (PLANETS[p].seed ?? 0)) % (size - 6)),
      z = 2 + ((i * 5 + 4) % Math.max(1, Math.floor(planetDepth(p) - 4)));
    for (let n = 0; n < 100; n++) {
      if (
        !waterCell(x, z) &&
        !beds(p).some((b) => b.x === x && b.z === z) &&
        !nodes(p).some((b) => b.x === x && b.z === z) &&
        Math.hypot(x - ship(p).x, z - ship(p).z) > 4
      )
        break;
      x = 2 + ((x + 3) % (size - 4));
      z = 2 + ((z + 7) % Math.max(1, Math.floor(planetDepth(p) - 4)));
    }
    const kind = (["beetle", "drone", "stalker"] as const)[i % 3],
      maxHp = kind === "stalker" ? 65 : kind === "drone" ? 42 : 35;
    result.push({
      id: `enemy-${i}`,
      kind,
      x,
      z,
      homeX: x,
      homeZ: z,
      hp: maxHp,
      maxHp,
      lastAttack: 0,
      defeatedAt: null,
    });
  }
  return result;
}
/** Only connected play advances combat; offline time never kills the player. */
export function advanceEnemies(save: Save, now: number): boolean {
  const world = save.worlds[save.planet];
  // Respawns run on every world, including those with deployed hunters.
  for (const w of Object.values(save.worlds))
    for (const e of w.enemies)
      if (e.hp <= 0 && e.defeatedAt !== null && now - e.defeatedAt >= 30000) {
        e.hp = e.maxHp;
        e.defeatedAt = null;
        e.x = e.homeX;
        e.z = e.homeZ;
        e.lastAttack = now;
      }
  if (save.flight || save.inside || !PLANETS[save.planet].hostile) return false;
  const dt = Math.max(0, Math.min(1.5, (now - world.lastSimAt) / 1000));
  world.lastSimAt = now;
  for (const [i, e] of world.enemies.entries()) {
    if (e.hp <= 0) {
      if (e.defeatedAt !== null && now - e.defeatedAt >= 30000) {
        e.hp = e.maxHp;
        e.defeatedAt = null;
        e.x = e.homeX;
        e.z = e.homeZ;
        e.lastAttack = now;
      } else continue;
    }
    const distance = surfaceDistance(e, save.position, save.planet),
      chasing = distance < 9;
    const target = chasing
      ? save.position
      : {
          x: e.homeX + Math.sin(now / 3500 + i) * 1.4,
          z: e.homeZ + Math.cos(now / 3000 + i) * 1.4,
        };
    const dx = target.x - e.x,
      dz = target.z - e.z,
      d = Math.hypot(dx, dz),
      speed = (e.kind === "stalker" ? 1.25 : 0.85) * dt;
    if (d > 1.1) {
      const x = e.x + (dx / d) * Math.min(speed, d),
        z = e.z + (dz / d) * Math.min(speed, d);
      if (walkable(save, save.planet, x, e.z, now)) e.x = x;
      if (walkable(save, save.planet, e.x, z, now)) e.z = z;
    }
    if (
      surfaceDistance(e, save.position, save.planet) < 1.8 &&
      now - e.lastAttack >= 1200
    ) {
      const defense = save.equipment.armor
        ? (GEAR[save.equipment.armor].defense ?? 0)
        : 0;
      save.health -= Math.max(1, (e.kind === "stalker" ? 14 : 9) - defense);
      save.lastDamage = now;
      e.lastAttack = now;
    }
    if (save.health <= 0) {
      save.health = 100;
      save.deaths++;
      save.planet = "home";
      save.position = { x: 18, z: 21 };
      save.inside = null;
      save.outsidePosition = null;
      return true;
    }
  }
  return false;
}
