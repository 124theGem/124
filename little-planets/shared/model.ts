import {
  STORY_PLANTS,
  STORY_METEOR,
  STORY_ROBOT,
  SYSTEM_PLANETS,
  type Prologue,
} from "./prologue";
import { expandSavedWorlds } from "./expansion";
import { resourceValid, INDUSTRIAL_RECIPES, RAW_RESOURCES } from "./resources";
import {
  scannerBuilding,
  inScannerRange,
  constellationName,
  recordVisit,
  upgradeCost,
  drillSize,
} from "./sector";
import {
  starterShip,
  shipCost,
  SHIP_CLASSES,
  SHIP_STATS,
  type Starship,
} from "./ships";
import { advanceIndustry } from "./industry";
import { prepareFoundation, foundationCells } from "./construction";
import {
  gainExperience,
  freshProgression,
  skillPoints,
  type Progression,
} from "./progression";
import type { GrappleState } from "./grapple";
import { resourceNodes as nodes, cutTree, treeCleared } from "./forestry";
import {
  advanceAutomation,
  programSchema,
  DEVICE_COSTS,
  deviceKinds,
  defaultProgram,
  RECIPES,
  localWarehouse,
  cargoAmount,
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
  level?: number;
  produced?: number;
  productionAt?: number;
  buffer?: Record<string, number>;
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
  gardens: { x: number; z: number }[];
  fences: {
    x: number;
    z: number;
    kind: "wood" | "stone" | "energy";
    rotation: number;
  }[];
  buildings: Building[];
  depleted: Record<string, number>;
  treeDamage: Record<string, number>;
  treeTimber: Record<string, number>;
  eventEpoch: number;
  salvaged: number[];
  enemies: Enemy[];
  lastSimAt: number;
  terrain: TerrainEdits;
  cleared: string[];
  clearedNodes: string[];
  stock: Record<string, number>;
  launchPad?: { x: number; z: number; shipId: string | null };
}
export function landingPad(save: Pick<Save, "worlds">, p: PlanetId) {
  return save.worlds[p]?.launchPad ?? ship(p);
}
export function flightPads(save: Pick<Save, "worlds">) {
  return Object.fromEntries(
    Object.entries(save.worlds)
      .filter(([, w]) => w.launchPad)
      .map(([p, w]) => [p, { x: w.launchPad!.x, z: w.launchPad!.z }]),
  ) as Partial<Record<PlanetId, { x: number; z: number }>>;
}
function validatePlacement(
  save: Save,
  at: { x: number; z: number },
  size: number,
) {
  if (
    save.inside ||
    at.x >= planetSize(save.planet) ||
    at.z >= planetDepth(save.planet)
  )
    throw new RuleError("Выберите поверхность планеты.");
  nearby(save, at.x, at.z, 7);
  if (
    save.worlds[save.planet].buildings.some(
      (b) =>
        surfaceDistance(at, buildingCenter(b), save.planet) <
        (BUILDINGS[b.kind].size + size) / 2,
    )
  )
    throw new RuleError("Площадка пересекается со зданием.");
  if (
    save.automation.devices.some(
      (d) =>
        d.planet === save.planet && surfaceDistance(at, d, save.planet) < 1.4,
    )
  )
    throw new RuleError("Участок занят устройством.");
}
// One-time test-world reset; future reloads retain this generation.
export const WORLD_GENERATION = 3;
export interface Save {
  version: 6;
  generation: number;
  planetScale: number;
  prologue: Prologue;
  freeConstruction: boolean;
  scans: PlanetId[];
  profile: {
    visits: Record<string, { seconds: number; arrivals: number }>;
    lastAt: number;
  };
  fleet: Starship[];
  activeShip: string;
  shipBlueprints: Starship[];
  hand: "cultivator" | "axe" | "sword" | "spear" | "blaster" | "none";
  progression: Progression;
  grapple: GrappleState | null;
  cycleEpoch: number;
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
const resourceSchema = z.string().refine(resourceValid);
const recipeSchema = z
  .string()
  .refine((r) => Object.hasOwn(INDUSTRIAL_RECIPES, r));
const starshipSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(40),
  class: z.enum(SHIP_CLASSES),
  model: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  hull: z.enum(["needle", "armored", "freighter"]),
  wings: z.enum(["swept", "delta", "twin"]),
  color: z.enum(["ivory", "graphite", "cobalt", "ember", "emerald"]),
  livery: z.enum(["aurora", "helix", "polar", "obsidian"]).optional(),
  engine: z.enum(["ion", "plasma", "fusion"]).optional(),
  module: z.enum(["standard", "survey", "shield", "hold"]).optional(),
  finish: z.enum(["ceramic", "titanium", "carbon"]).optional(),
});
export const ActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("story"),
      step: z.enum(["begin", "plant", "meteor", "repair", "launch", "finish"]),
      index: z.number().int().min(0).max(2).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("removeFence"),
      index: z.number().int().nonnegative().max(511),
    })
    .strict(),
  z
    .object({
      type: z.literal("cultivate"),
      x: cell,
      z: cell,
    })
    .strict(),
  z
    .object({
      type: z.literal("fence"),
      x: z.number().finite().nonnegative(),
      z: z.number().finite().nonnegative(),
      kind: z.enum(["wood", "stone", "energy"]),
      rotation: z.number().int().min(0).max(3),
    })
    .strict(),
  z
    .object({ type: z.literal("upgradeBuilding"), id: z.string().max(100) })
    .strict(),
  z.object({ type: z.literal("scanPlanet"), planet }).strict(),
  z
    .object({
      type: z.literal("createShip"),
      ship: starshipSchema.omit({ id: true }),
    })
    .strict(),
  z
    .object({
      type: z.literal("saveShipDesign"),
      ship: starshipSchema.omit({ id: true }),
    })
    .strict(),
  z.object({ type: z.literal("selectShip"), id: z.string().max(100) }).strict(),
  z
    .object({
      type: z.literal("logisticsRoute"),
      id: z.string().max(100),
      from: planet,
      to: planet,
      resource: resourceSchema,
      refineryId: z.string().max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("hand"),
      item: z.enum(["cultivator", "axe", "sword", "spear", "blaster", "none"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("spendSkill"),
      skill: z.enum(["farming", "mining", "combat"]),
    })
    .strict(),
  z.object({ type: z.literal("deploy"), kind: z.enum(deviceKinds) }).strict(),
  z
    .object({ type: z.literal("craftDevice"), kind: z.enum(deviceKinds) })
    .strict(),
  z
    .object({
      type: z.literal("placeDevice"),
      kind: z.enum(deviceKinds),
      x: z.number().finite().min(0).max(224),
      z: z.number().finite().min(0).max(224),
    })
    .strict(),
  z
    .object({
      type: z.literal("placeShip"),
      id: z.string().max(100),
      x: z.number().finite().min(0).max(224),
      z: z.number().finite().min(0).max(224),
    })
    .strict(),
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
      recipe: recipeSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("stock"),
      resource: resourceSchema,
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
  z.object({ type: z.literal("boardShip") }).strict(),
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
        "planetdrill",
        "scanner",
        "shipyard",
        "telescope",
      ]),
      x: z.number().finite().min(0).max(224),
      z: z.number().finite().min(0).max(224),
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
export function freshWorld(p: PlanetId, now: number): PlanetState {
  return {
    crops: {},
    gardens: [],
    fences: [],
    buildings:
      p === "home"
        ? [
            {
              id: "home-hq",
              kind: "headquarters",
              ...HOME_HQ,
              rotation: 0,
              level: 1,
              produced: 0,
              buffer: {},
            },
          ]
        : [],
    depleted: {},
    treeDamage: {},
    treeTimber: {},
    eventEpoch: now,
    salvaged: [],
    enemies: spawnEnemies(p),
    lastSimAt: now,
    terrain: {},
    cleared: [],
    clearedNodes: [],
    stock: {},
  };
}
// The plain factory is also used by simulations; real new players opt into the prologue.
export function newGame(
  now = Date.now(),
  freeConstruction = false,
  introduction = false,
): Save {
  const worlds = {} as Save["worlds"];
  for (const p of Object.keys(PLANETS).slice(0, 30) as PlanetId[])
    worlds[p] = freshWorld(p, now);
  worlds.home.launchPad = { ...ship("home"), shipId: "starter" };
  if (introduction) {
    worlds.home.buildings[0].x = 13;
    worlds.home.buildings[0].z = 15;
    prepareFoundation(worlds.home, worlds.home.buildings[0], "home", 3);
  }
  if (introduction)
    for (const p of [...STORY_PLANTS, STORY_METEOR, STORY_ROBOT])
      prepareFoundation(worlds.home, p, "home", 2);
  const inventory: Record<string, number> = {
    "tool:axe": 1,
    "tool:cultivator": 1,
    wood: 90,
    stone: 75,
    crystal: 20,
    spores: 15,
    obsidian: 12,
    thermal: 8,
  };
  for (const id of Object.keys(RAW_RESOURCES)) inventory[id] ??= 0;
  for (const id of Object.keys(PLANTS)) inventory[`seed:${id}`] = 6;
  return {
    version: 6,
    generation: WORLD_GENERATION,
    planetScale: 1.2,
    prologue: {
      phase: introduction ? "arrival" : "complete",
      plants: [],
      meteor: false,
    },
    freeConstruction,
    scans: ["home"],
    profile: { visits: { home: { seconds: 0, arrivals: 1 } }, lastAt: now },
    fleet: [starterShip()],
    activeShip: "starter",
    shipBlueprints: [],
    hand: "axe",
    progression: freshProgression(),
    grapple: null,
    cycleEpoch: now,
    automation: { devices: [], lastTick: now, serial: 0 },
    lastMine: 0,
    flight: null,
    revision: 0,
    planet: "home",
    position: { x: ship("home").x - 2, z: ship("home").z },
    inventory,
    worlds,
    updatedAt: now,
    inside: null,
    outsidePosition: null,
    interiors: { "home-hq": [] },
    discovered: introduction ? ["home"] : [...INITIAL_PLANETS],
    lastDiscovery: null,
    equipment: { weapon: null, armor: null },
    health: 100,
    kills: 0,
    deaths: 0,
    lastAttack: 0,
    lastDamage: 0,
  };
}
export function gardenBeds(save: Pick<Save, "worlds">, p: PlanetId) {
  return [...beds(p), ...(save.worlds[p]?.gardens ?? [])];
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
  return (
    !state.clearedNodes.includes(id) &&
    (state.depleted[id] === undefined || now - state.depleted[id] >= 20000)
  );
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
  return { x: b.x, z: b.z };
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
      !(save.worlds[p]?.fences ?? []).some(
        (f) => surfaceDistance(f, { x, z }, p) < 0.45,
      ) &&
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
  if (save.inside || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const b = BUILDINGS[kind];
  if (
    !b ||
    (b.zone !== "any" &&
      b.zone !== (save.planet === "home" ? "home" : "outpost"))
  )
    return false;
  if (b.zone === "outpost" && !moduleResources(save.planet, kind).length)
    return false;
  if (
    x < 0 ||
    z < 0 ||
    x >= planetSize(save.planet) ||
    z >= planetDepth(save.planet)
  )
    return false;
  if (
    surfaceDistance({ x, z }, landingPad(save, save.planet), save.planet) <
    2.5 + b.size / 2
  )
    return false;
  if (
    save.worlds[save.planet].buildings.some(
      (existing) =>
        surfaceDistance({ x, z }, existing, save.planet) <
        (b.size + BUILDINGS[existing.kind].size) / 2 + 0.4,
    )
  )
    return false;

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
  return (
    save.freeConstruction ||
    Object.entries(cost).every(
      ([r, n]) => (save.inventory[r] ?? 0) >= n * count,
    )
  );
}
function charge(save: Save, cost: Record<string, number>, count = 1) {
  if (save.freeConstruction) return;
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
  const visit = save.profile.visits[save.planet] ?? { seconds: 0, arrivals: 1 };
  visit.seconds += Math.max(
    0,
    Math.min(30, (now - save.profile.lastAt) / 1000),
  );
  save.profile.visits[save.planet] = visit;
  save.profile.lastAt = now;
  advanceIndustry(save, now);
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
      "hand",
      "spendSkill",
      "combatTick",
    ].includes(action.type)
  )
    throw new RuleError("Сначала выйдите из дома.");
  if (
    save.prologue.phase !== "complete" &&
    ["boardShip", "travel", "createShip", "placeShip"].includes(action.type)
  )
    throw new RuleError(
      "Сначала восстановите двигатель и выполните первый запуск.",
    );
  switch (action.type) {
    case "story": {
      const q = save.prologue;
      if (save.planet !== "home" || save.inside)
        throw new RuleError("Вернитесь к кораблю на Родной.");
      if (action.step === "begin" && q.phase === "arrival") q.phase = "plants";
      else if (
        action.step === "plant" &&
        q.phase === "plants" &&
        action.index !== undefined
      ) {
        const plant = STORY_PLANTS[action.index];
        nearby(save, plant.x, plant.z, 3);
        if (q.plants.includes(action.index))
          throw new RuleError("Растение уже собрано.");
        q.plants.push(action.index);
        save.inventory["engine:fiber"] =
          (save.inventory["engine:fiber"] ?? 0) + 1;
        save.inventory[`crop:${plant.plant}`] =
          (save.inventory[`crop:${plant.plant}`] ?? 0) + 1;
        gainExperience(save, 12);
        if (q.plants.length === 3) q.phase = "meteor";
      } else if (action.step === "meteor" && q.phase === "meteor") {
        nearby(save, STORY_METEOR.x, STORY_METEOR.z, 3);
        save.inventory.iron = (save.inventory.iron ?? 0) + 3;
        q.meteor = true;
        q.phase = "repair";
        gainExperience(save, 8);
      } else if (action.step === "repair" && q.phase === "repair") {
        const pad = landingPad(save, "home");
        nearby(save, pad.x, pad.z, 3);
        if (
          !q.meteor ||
          q.plants.length !== 3 ||
          save.inventory.iron < 3 ||
          !(save.inventory["engine:fiber"] >= 3)
        )
          throw new RuleError(
            "Нужны 3 биоволокна растений и 3 железа из метеорита.",
          );
        save.inventory.iron -= 3;
        save.inventory["engine:fiber"] -= 3;
        q.phase = "launch";
        gainExperience(save, 25);
      } else if (action.step === "launch" && q.phase === "launch") {
        const pad = landingPad(save, "home");
        nearby(save, pad.x, pad.z, 3);
        q.phase = "reveal";
        save.discovered = [...new Set([...save.discovered, ...SYSTEM_PLANETS])];
      } else if (action.step === "finish" && q.phase === "reveal")
        q.phase = "complete";
      else throw new RuleError("Сначала завершите предыдущий этап задания.");
      break;
    }
    case "cultivate": {
      if (save.hand !== "cultivator" || !save.inventory["tool:cultivator"])
        throw new RuleError("Возьмите культиватор.");
      validatePlacement(save, action, 0.8);
      nearby(save, action.x, action.z, 3.2);
      if (
        gardenBeds(save, save.planet).some(
          (b) => surfaceDistance(b, action, save.planet) < 0.85,
        )
      )
        throw new RuleError("Здесь уже есть грядка.");
      if (world.gardens.length >= 256)
        throw new RuleError("Лимит: 256 новых грядок на планете.");
      if (
        surfaceDistance(action, landingPad(save, save.planet), save.planet) < 3
      )
        throw new RuleError("На площадке нельзя делать грядки.");
      prepareFoundation(world, action, save.planet, 1);
      world.gardens.push({ x: action.x, z: action.z });
      gainExperience(save, 2);
      break;
    }
    case "removeFence": {
      const f = world.fences[action.index];
      if (!f) throw new RuleError("Ограда не найдена.");
      nearby(save, f.x, f.z, 3.2);
      world.fences.splice(action.index, 1);
      break;
    }
    case "fence": {
      if (surfaceDistance(action, save.position, save.planet) < 0.6)
        throw new RuleError("Отойдите от места установки ограды.");
      validatePlacement(save, action, 0.2);
      nearby(save, action.x, action.z, 7);
      if (
        surfaceDistance(action, landingPad(save, save.planet), save.planet) < 3
      )
        throw new RuleError("Площадка должна оставаться свободной.");
      if (world.fences.length >= 512)
        throw new RuleError("Лимит оград на планете.");
      if (
        world.fences.some((f) => surfaceDistance(f, action, save.planet) < 0.65)
      )
        throw new RuleError("Здесь уже есть ограда.");
      charge(
        save,
        action.kind === "energy"
          ? { iron: 1, quartz: 1 }
          : { [action.kind]: 1 },
      );
      world.fences.push({
        x: action.x,
        z: action.z,
        kind: action.kind,
        rotation: action.rotation,
      });
      break;
    }
    case "upgradeBuilding": {
      const b = world.buildings.find((b) => b.id === action.id);
      if (!b || !["scanner", "planetdrill"].includes(b.kind))
        throw new RuleError("Это здание не имеет уровней.");
      nearby(save, b.x, b.z, b.kind === "planetdrill" ? 6 : 4);
      const limit = b.kind === "scanner" ? 10 : 5;
      if ((b.level ?? 1) >= limit)
        throw new RuleError("Достигнут максимальный уровень.");
      charge(save, upgradeCost(b));
      b.level = (b.level ?? 1) + 1;
      break;
    }
    case "scanPlanet": {
      const target = action.planet as PlanetId;
      if (save.planet !== "home" || !scannerBuilding(save))
        throw new RuleError("Постройте сканер на Родной.");
      if (!inScannerRange(save, target))
        throw new RuleError("Цель вне радиуса. Улучшите сканер.");
      if (save.scans.includes(target))
        throw new RuleError("Планета уже просканирована.");
      if (!save.discovered.includes(target)) save.discovered.push(target);
      save.worlds[target] ??= freshWorld(target, now);
      save.scans.push(target);
      save.lastDiscovery = target;
      // Reveals the surrounding constellation chart; resources still need their own scan.
      break;
    }
    case "saveShipDesign": {
      const existing = save.shipBlueprints.findIndex(
        (s) => s.name === action.ship.name,
      );
      if (existing < 0 && save.shipBlueprints.length >= 20)
        throw new RuleError("Сохранено максимум 20 проектов.");
      const blueprint = {
        ...action.ship,
        id: existing < 0 ? `project-${now}` : save.shipBlueprints[existing].id,
      };
      if (existing < 0) save.shipBlueprints.push(blueprint);
      else save.shipBlueprints[existing] = blueprint;
      break;
    }
    case "createShip": {
      if (
        !save.worlds.home.buildings.some((b) => b.kind === "shipyard") ||
        save.planet !== "home"
      )
        throw new RuleError("Нужна верфь на Родной.");
      if (save.fleet.length >= 30)
        throw new RuleError("Лимит ангара: 30 кораблей.");
      charge(save, shipCost(action.ship));
      const ship = { ...action.ship, id: `ship-${now}-${save.fleet.length}` };
      save.fleet.push(ship);
      save.inventory[`ship:${ship.id}`] =
        (save.inventory[`ship:${ship.id}`] ?? 0) + 1;
      break;
    }
    case "selectShip": {
      if (!save.fleet.some((s) => s.id === action.id))
        throw new RuleError("Корабль не найден.");
      if (save.inventory[`ship:${action.id}`] > 0)
        throw new RuleError(
          "Сначала разместите корабль с площадкой из инвентаря.",
        );
      if (world.launchPad && world.launchPad.shipId !== action.id)
        throw new RuleError("Этот корабль не находится на местной площадке.");
      save.activeShip = action.id;
      break;
    }
    case "logisticsRoute": {
      const d = save.automation.devices.find((d) => d.id === action.id),
        from = action.from as PlanetId,
        to = action.to as PlanetId;
      if (!d || !["drone", "crawler"].includes(d.kind))
        throw new RuleError("Выберите грузовой или гусеничный дрон.");
      if (d.transit || cargoAmount(d) > 0)
        throw new RuleError(
          "Дождитесь завершения перевозки перед сменой маршрута.",
        );
      if (!save.discovered.includes(from) || !save.discovered.includes(to))
        throw new RuleError("Сначала откройте обе планеты.");
      if (!localWarehouse(save, from) || !localWarehouse(save, to))
        throw new RuleError("На маршруте нужны местные склады.");
      if (d.kind === "crawler") {
        const ref = save.automation.devices.find(
          (r) =>
            r.id === action.refineryId &&
            r.kind === "refinery" &&
            r.planet === d.planet,
        );
        if (!ref || from !== to || from !== d.planet)
          throw new RuleError(
            "Гусеничный дрон работает между местным складом и переработкой.",
          );
        if (cargoAmount(d) > 0)
          throw new RuleError("Дождитесь выгрузки текущего груза.");
        d.logistics = {
          from,
          to,
          resource: action.resource,
          refineryId: ref.id,
          phase: "warehouse",
        };
      } else {
        const node = (id: string, op: any, planet: PlanetId, next: string) => ({
          id,
          op,
          planet,
          next,
          otherwise: next,
          resource: action.resource,
          threshold: 1,
          x: 40 + ["back", "load", "fly", "unload"].indexOf(id) * 270,
          y: 40,
        });
        d.program = {
          entry: "back",
          nodes: [
            node("back", "travel", from, "load"),
            node("load", "load", from, "fly"),
            node("fly", "travel", to, "unload"),
            node("unload", "unload", to, "back"),
          ],
        };
        d.pc = "back";
        d.logistics = {
          from,
          to,
          resource: action.resource,
          phase: "warehouse",
        };
      }
      d.enabled = true;
      break;
    }
    case "hand": {
      if (action.item === "cultivator" || action.item === "axe") {
        if (!(save.inventory[`tool:${action.item}`] > 0))
          throw new RuleError("Предмета нет в рюкзаке.");
        save.equipment.weapon = null;
      } else if (action.item !== "none") {
        if (!(save.inventory[`gear:${action.item}`] > 0))
          throw new RuleError("Сначала создайте оружие.");
        save.equipment.weapon = action.item;
      } else save.equipment.weapon = null;
      save.hand = action.item;
      break;
    }
    case "spendSkill": {
      if (skillPoints(save.progression) <= 0)
        throw new RuleError("Нет свободных очков.");
      if (save.progression.skills[action.skill] >= 5)
        throw new RuleError("Навык уже максимальный.");
      save.progression.skills[action.skill]++;
      break;
    }
    case "craftDevice": {
      charge(save, DEVICE_COSTS[action.kind]);
      const item = `device:${action.kind}`;
      save.inventory[item] = (save.inventory[item] ?? 0) + 1;
      break;
    }
    case "placeShip": {
      const item = `ship:${action.id}`;
      if (
        !(save.inventory[item] > 0) ||
        !save.fleet.some((s) => s.id === action.id)
      )
        throw new RuleError("Корабля нет в инвентаре.");
      validatePlacement(save, action, 7);
      const previous = world.launchPad;
      if (previous?.shipId)
        save.inventory[`ship:${previous.shipId}`] =
          (save.inventory[`ship:${previous.shipId}`] ?? 0) + 1;
      prepareFoundation(world, action, save.planet, 6);
      world.launchPad = { x: action.x, z: action.z, shipId: action.id };
      save.inventory[item]--;
      save.activeShip = action.id;
      break;
    }
    case "placeDevice":
    case "deploy": {
      const at =
        action.type === "placeDevice"
          ? { x: action.x, z: action.z }
          : save.position;
      if (action.type === "placeDevice") {
        if (!(save.inventory[`device:${action.kind}`] > 0))
          throw new RuleError("Устройства нет в инвентаре.");
        validatePlacement(save, at, 3);
      }
      if (save.automation.devices.length >= 80)
        throw new RuleError("Лимит: 80 устройств.");
      if (
        ["warehouse", "refinery"].includes(action.kind) &&
        save.automation.devices.some(
          (d) =>
            d.kind === action.kind &&
            d.planet === save.planet &&
            surfaceDistance(d, at, save.planet) < 3,
        )
      )
        throw new RuleError("Здесь уже есть станция.");
      if (action.type === "deploy") charge(save, DEVICE_COSTS[action.kind]);
      else save.inventory[`device:${action.kind}`]--;
      if (action.kind === "warehouse" || action.kind === "refinery")
        prepareFoundation(world, at, save.planet, 3);
      const program = defaultProgram(action.kind, save.planet);
      save.automation.devices.push({
        id: `device-${++save.automation.serial}`,
        kind: action.kind,
        planet: save.planet,
        ...at,
        cargo: {},
        buffer: {},
        output: {},
        logistics: null,
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
      if (!action.program.nodes.length) d.status = "Программа пуста";
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
      const pad = landingPad(save, save.planet);
      save.position = offsetPoint(pad, -1, 0, save.planet);
      save.worlds[save.planet] ??= freshWorld(save.planet, now);
      const previous = save.worlds[save.planet].launchPad;
      if (previous?.shipId && previous.shipId !== save.activeShip)
        save.inventory[`ship:${previous.shipId}`] =
          (save.inventory[`ship:${previous.shipId}`] ?? 0) + 1;
      save.worlds[save.planet].launchPad = {
        x: pad.x,
        z: pad.z,
        shipId: save.activeShip,
      };
      recordVisit(save, save.planet, now);
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
      if (action.slot === "weapon")
        save.hand = (action.item as Save["hand"]) ?? "axe";
      break;
    }
    case "scan": {
      if (save.planet !== "home" || !scannerBuilding(save))
        throw new RuleError("Постройте здание сканера на Родной.");
      const pool = (Object.keys(PLANETS) as PlanetId[]).filter(
        (p) => !save.scans.includes(p) && inScannerRange(save, p),
      );
      if (!pool.length)
        throw new RuleError("Все цели в радиусе исследованы. Улучшите сканер.");
      const p = pool[hash(Math.floor(now) ^ save.revision) % pool.length];
      if (!save.discovered.includes(p)) save.discovered.push(p);
      save.worlds[p] ??= freshWorld(p, now);
      save.scans.push(p);
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
      enemy.hp = Math.max(
        0,
        enemy.hp - (weapon?.damage ?? 5) - save.progression.skills.combat * 2,
      );
      save.lastAttack = now;
      if (!enemy.hp) {
        enemy.defeatedAt = now;
        save.kills++;
        gainExperience(save, 25);
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
        !gardenBeds(save, save.planet).some(
          (b) => b.x === action.x && b.z === action.z,
        ) ||
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
        [
          `crop:${crop.plant}`,
          3 + Math.floor(save.progression.skills.farming / 2),
        ],
        [`seed:${crop.plant}`, 2],
      ] as const)
        save.inventory[item] = (save.inventory[item] ?? 0) + n;
      delete world.crops[k];
      gainExperience(save, 12);
      break;
    }
    case "mine": {
      const n = nodes(save.planet).find((n) => n.id === action.id);
      if (!n) throw new RuleError("Ресурс не найден.");
      nearby(save, n.x, n.z, n.tree ? 3.2 : 2.2);
      if (
        !nodeReady(world, n.id, now) ||
        treeCleared(save.planet, n, world.cleared, [])
      )
        throw new RuleError("Источник уже собран.");
      if (now - save.lastMine < 300)
        throw new RuleError("Дождитесь следующего взмаха.");
      if (n.resource === "wood") {
        if (save.hand !== "axe") throw new RuleError("Возьмите топор.");
        const amount = cutTree(world, n);
        if (amount) {
          save.inventory.wood = (save.inventory.wood ?? 0) + amount;
          gainExperience(save, 3);
        }
      } else {
        save.inventory[n.resource] =
          (save.inventory[n.resource] ?? 0) +
          3 +
          save.progression.skills.mining;
        world.depleted[n.id] = now;
        gainExperience(save, 3);
      }
      save.lastMine = now;
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
      if (
        recipe.zone !== "any" &&
        recipe.zone !== (save.planet === "home" ? "home" : "outpost")
      )
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
      if (!save.freeConstruction && (save.inventory[kit] ?? 0) > 0)
        save.inventory[kit]--;
      else charge(save, recipe.cost);
      const b: Building = {
        id: `b-${now}-${action.x}-${action.z}`,
        kind: action.kind,
        x: action.x,
        z: action.z,
        rotation: action.rotation,
        level: 1,
        produced: 0,
        productionAt: now,
        buffer: {},
        ...(resource ? { resource, collectedAt: now } : {}),
      };
      prepareFoundation(world, b, save.planet, recipe.size + 1);
      world.buildings.push(b);
      if (b.kind === "warehouse") {
        const program = defaultProgram("warehouse", save.planet);
        save.automation.devices.push({
          id: `device-${++save.automation.serial}`,
          kind: "warehouse",
          planet: save.planet,
          x: b.x,
          z: b.z,
          cargo: {},
          buffer: {},
          output: {},
          logistics: null,
          capacity: 30,
          program,
          pc: program.entry,
          enabled: true,
          status: "Склад колонии",
          cooldown: 0,
          transit: null,
          recipe: "composite",
          job: null,
        });
      }
      gainExperience(save, 12);
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
    case "boardShip":
    case "travel": {
      const target =
        action.type === "boardShip" ? save.planet : (action.planet as PlanetId);
      const pad = landingPad(save, save.planet);
      nearby(save, pad.x, pad.z, 3);
      if (!save.discovered.includes(target))
        throw new RuleError("Сначала найдите эту планету сканером.");
      if (action.type === "travel" && save.planet === target)
        throw new RuleError("Вы уже здесь.");
      const parked = world.launchPad;
      if (parked?.shipId === null)
        throw new RuleError(
          "На площадке нет корабля. Разместите его из инвентаря.",
        );
      if (parked?.shipId) save.activeShip = parked.shipId;
      save.flight = beginFlight(
        save.planet,
        target,
        save.discovered,
        now,
        flightPads(save),
      );
      world.launchPad = { x: pad.x, z: pad.z, shipId: null };
      save.flight.topSpeed = SHIP_STATS(
        save.fleet.find((s) => s.id === save.activeShip)!,
      ).speed;
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
    "planetdrill",
    "scanner",
    "shipyard",
    "telescope",
  ]),
  x: z.number().finite().min(0).max(224),
  z: z.number().finite().min(0).max(224),
  rotation: z.number().int().min(0).max(1),
  resource: z.string().optional(),
  collectedAt: z.number().finite().optional(),
  level: z.number().int().min(1).max(10).default(1),
  produced: z.number().int().nonnegative().default(0),
  productionAt: z.number().finite().optional(),
  buffer: z.record(z.string(), z.number().int().nonnegative()).default({}),
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
  gardens: z
    .array(
      z.object({
        x: z.number().finite().nonnegative(),
        z: z.number().finite().nonnegative(),
      }),
    )
    .max(256)
    .default([]),
  fences: z
    .array(
      z.object({
        x: z.number().finite().nonnegative(),
        z: z.number().finite().nonnegative(),
        kind: z.enum(["wood", "stone", "energy"]),
        rotation: z.number().int().min(0).max(3),
      }),
    )
    .max(512)
    .default([]),
  buildings: z.array(bSchema),
  depleted: z.record(z.string(), z.number().finite()),
  treeDamage: z.record(z.string(), z.number().int().nonnegative()).default({}),
  treeTimber: z.record(z.string(), z.number().int().nonnegative()).default({}),
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
  cleared: z.array(z.string()).default([]),
  clearedNodes: z.array(z.string()).default([]),
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
  launchPad: z
    .object({
      x: z.number().finite().nonnegative(),
      z: z.number().finite().nonnegative(),
      shipId: z.string().max(100).nullable(),
    })
    .optional(),
});
const positionSchema = z.object({
  x: z.number().finite().nonnegative(),
  z: z.number().finite().nonnegative(),
});
const saveSchema = z.object({
  version: z.literal(6),
  generation: z.literal(WORLD_GENERATION),
  prologue: z
    .object({
      phase: z.enum([
        "arrival",
        "plants",
        "meteor",
        "repair",
        "launch",
        "reveal",
        "complete",
      ]),
      plants: z.array(z.number().int().min(0).max(2)).max(3),
      meteor: z.boolean(),
    })
    .default({ phase: "complete", plants: [], meteor: false }),
  planetScale: z.union([z.literal(1), z.literal(1.2)]).default(1),
  freeConstruction: z.boolean().default(true),
  scans: z.array(planet).default(["home"]),
  profile: z
    .object({
      visits: z.record(
        planet,
        z.object({
          seconds: z.number().nonnegative(),
          arrivals: z.number().int().nonnegative(),
        }),
      ),
      lastAt: z.number().finite(),
    })
    .default(() => ({
      visits: { home: { seconds: 0, arrivals: 1 } },
      lastAt: Date.now(),
    })),
  fleet: z
    .array(starshipSchema)
    .min(1)
    .max(30)
    .default(() => [starterShip()]),
  activeShip: z.string().default("starter"),
  shipBlueprints: z.array(starshipSchema).max(20).default([]),
  hand: z
    .enum(["cultivator", "axe", "sword", "spear", "blaster", "none"])
    .default("axe"),
  progression: z
    .object({
      xp: z.number().int().min(0).max(1000000000),
      skills: z.object({
        farming: z.number().int().min(0).max(5),
        mining: z.number().int().min(0).max(5),
        combat: z.number().int().min(0).max(5),
      }),
    })
    .default(freshProgression),
  cycleEpoch: z
    .number()
    .finite()
    .default(() => Date.now()),
  grapple: z
    .object({
      origin: planet,
      target: planet,
      originPosition: z.object({
        x: z.number().finite(),
        z: z.number().finite(),
      }),
      route: z
        .array(
          z.object({
            x: z.number().finite(),
            y: z.number().finite(),
            z: z.number().finite(),
          }),
        )
        .min(2),
      startedAt: z.number().finite(),
      endsAt: z.number().finite(),
      duration: z.number().positive(),
    })
    .nullable()
    .default(null),
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
          buffer: z
            .record(z.string(), z.number().int().nonnegative())
            .default({}),
          output: z
            .record(z.string(), z.number().int().nonnegative())
            .default({}),
          logistics: z
            .object({
              from: planet,
              to: planet,
              resource: resourceSchema,
              refineryId: z.string().optional(),
              phase: z.enum(["warehouse", "refinery"]),
            })
            .nullable()
            .default(null),
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
          recipe: recipeSchema,
          job: z
            .object({
              recipe: recipeSchema,
              ends: z.number().finite(),
            })
            .nullable(),
        }),
      )
      .max(80),
  }),
  flight: z
    .object({
      topSpeed: z.number().min(20).max(100).default(46),
      origin: planet,
      target: planet,
      pads: z
        .record(
          planet,
          z.object({
            x: z.number().finite().nonnegative(),
            z: z.number().finite().nonnegative(),
          }),
        )
        .optional(),

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
  // This release deliberately retires all previous test worlds, once.
  if (
    [1, 2, 3, 4, 5].includes(data?.version) ||
    (data?.version === 6 &&
      (data.generation === undefined || data.generation < WORLD_GENERATION))
  )
    return newGame(Date.now(), true, true);
  // Retire tools and unfinished zipline journeys without resetting the world.
  if (data?.version === 6 && data.generation === WORLD_GENERATION) {
    if (data.grapple) {
      data.planet = data.grapple.origin;
      data.position = data.grapple.originPosition;
      data.grapple = null;
    }
    if (["pickaxe", "grapple"].includes(data.hand)) data.hand = "axe";
    if (data.inventory) {
      delete data.inventory["tool:pickaxe"];
      delete data.inventory["tool:grapple"];
    }
  }
  const save = saveSchema.parse(data) as Save;
  expandSavedWorlds(save);
  save.inventory["tool:axe"] ??= 1;
  save.inventory["tool:cultivator"] ??= 1;
  if (data.hand === undefined)
    save.hand = (save.equipment.weapon as Save["hand"]) ?? "axe";
  for (const p of save.discovered)
    save.worlds[p] ??= freshWorld(p, save.updatedAt);
  if (
    save.flight &&
    (save.flight.origin !== save.planet ||
      !save.discovered.includes(save.flight.target))
  )
    throw new Error("Повреждённый полёт");
  if (
    save.grapple &&
    (save.grapple.origin !== save.planet ||
      !save.discovered.includes(save.grapple.target) ||
      save.flight)
  )
    throw new Error("Повреждённый трос");
  for (const [id, w] of Object.entries(save.worlds)) {
    const p = id as PlanetId;
    if (
      [...w.gardens, ...w.fences].some(
        (v) => v.x >= planetSize(p) || v.z >= planetDepth(p),
      )
    )
      throw new Error("Повреждённый сад");
    if (
      w.launchPad &&
      (w.launchPad.x >= planetSize(id as PlanetId) ||
        w.launchPad.z >= planetDepth(id as PlanetId) ||
        (w.launchPad.shipId &&
          !save.fleet.some((s) => s.id === w.launchPad!.shipId)))
    )
      throw new Error("Повреждённая взлётная площадка");
  }
  if (!save.fleet.some((s) => s.id === save.activeShip))
    throw new Error("Повреждённый ангар");
  if (!save.discovered.includes(save.planet))
    throw new Error("Планета не открыта");
  for (const p of Object.keys(save.worlds) as PlanetId[])
    for (const [k, crop] of Object.entries(save.worlds[p].crops)) {
      const [x, z] = k.split(",").map(Number);
      if (
        !PLANTS[crop.plant] ||
        !gardenBeds(save, p).some((b) => b.x === x && b.z === z)
      )
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
  if (
    save.grapple ||
    save.flight ||
    save.inside ||
    !PLANETS[save.planet].hostile
  )
    return false;
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
      save.position = offsetPoint(landingPad(save, "home"), -1, 0, "home");
      save.inside = null;
      save.outsidePosition = null;
      return true;
    }
  }
  return false;
}
