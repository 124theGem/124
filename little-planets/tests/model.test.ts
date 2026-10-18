import { finishFlight } from "./fly";
import { describe, it, expect } from "vitest";
import {
  newGame,
  applyAction,
  ready,
  stage,
  parseSave,
  canBuild,
  findPath,
  walkable,
  moduleAmount,
  moduleCapacity,
  canPlaceFurniture,
  worldEvent,
  type Save,
} from "../shared/model";
import {
  ship,
  planetSize,
  nodes,
  ROOM,
  BUILDINGS,
  type PlanetId,
  type BuildingKind,
} from "../shared/catalog";
import { legacySave } from "./fixtures";
const homePlant = { type: "plant", x: 16, z: 19, plant: "sunflower" } as const;
const build = (kind: BuildingKind = "house", x = 16, z = 14) =>
  ({ type: "build", kind, x, z, rotation: 0 }) as const;
function outpost(p: PlanetId = "listoria") {
  const save = newGame(0);
  save.planet = p;
  save.position = { x: 8, z: 11 };
  return save;
}
function enter() {
  const save = newGame(0);
  save.position = { x: 13, z: 18 };
  return applyAction(save, { type: "enter", id: "home-hq" }, 0);
}
function moduleSave() {
  const save = outpost();
  for (let z = 1; z < 15; z++)
    for (let x = 1; x < 15; x++)
      if (canBuild(save, x, z, "extractor", 0))
        try {
          return applyAction(
            save,
            { ...build("extractor", x, z), resource: "stone" },
            0,
          );
        } catch {}
  throw new Error("No module site");
}
describe("home world and prototype saves", () => {
  it("adds a 38×38 home, about five times the area, with one enterable HQ", () => {
    const s = newGame();
    expect(planetSize("home")).toBe(38);
    expect(38 ** 2 / 17 ** 2).toBeCloseTo(5, 0);
    expect(s.planet).toBe("home");
    expect(s.worlds.home.buildings[0].kind).toBe("headquarters");
    for (const p of ["listoria", "mycelia", "pyros"] as const)
      expect(s.worlds[p].buildings).toHaveLength(0);
  });
  it("starts a fresh world for old prototype formats without transferring progress", () => {
    for (const version of [1, 2, 3]) {
      const old = legacySave();
      old.version = version;
      const save = parseSave(JSON.stringify(old));
      expect(save.version).toBe(4);
      expect(save.planet).toBe("home");
      expect(save.revision).toBe(0);
      expect(save.inventory.wood).toBe(90);
      expect(save.worlds.home.buildings).toHaveLength(1);
      expect(save.kills).toBe(0);
    }
  });
  it("rejects malformed current saves with invalid inventory or crops", () => {
    expect(() => parseSave("{}")).toThrow();
    expect(() =>
      parseSave(JSON.stringify({ ...newGame(), inventory: { wood: -1 } })),
    ).toThrow();
    const s = newGame();
    s.worlds.listoria.crops["6,9"] = { plant: "unknown", plantedAt: 0 };
    expect(() => parseSave(JSON.stringify(s))).toThrow();
  });
});
describe("growth and gathering", () => {
  it("grows through three stages and harvests once with new seeds", () => {
    let s = newGame(1000);
    s.position = { x: 16, z: 20 };
    s = applyAction(s, homePlant, 1000);
    const c = s.worlds.home.crops["16,19"];
    expect(stage(c, 1000)).toBe(0);
    expect(stage(c, 7000)).toBe(1);
    expect(stage(c, 12000)).toBe(2);
    expect(ready(c, 15999)).toBe(false);
    expect(() =>
      applyAction(s, { type: "harvest", x: 16, z: 19 }, 15999),
    ).toThrow();
    s = applyAction(s, { type: "harvest", x: 16, z: 19 }, 16000);
    expect(s.inventory["crop:sunflower"]).toBe(3);
    expect(s.inventory["seed:sunflower"]).toBe(7);
    expect(() =>
      applyAction(s, { type: "harvest", x: 16, z: 19 }, 20000),
    ).toThrow();
  });
  it("preserves rare crops over offline time and rejects wrong biomes or occupied beds", () => {
    let s = newGame(0);
    s.position = { x: 16, z: 20 };
    s = applyAction(s, { ...homePlant, plant: "glowbush" }, 0);
    s = parseSave(JSON.stringify(s));
    expect(ready(s.worlds.home.crops["16,19"], 29999)).toBe(false);
    expect(ready(s.worlds.home.crops["16,19"], 30000)).toBe(true);
    expect(() => applyAction(s, homePlant, 0)).toThrow();
    expect(() =>
      applyAction(s, { ...homePlant, x: 17, plant: "moonshroom" }, 0),
    ).toThrow();
  });
  it("regenerates after 20 seconds while keeping resource bases solid", () => {
    let s = outpost();
    s.position = { x: 2, z: 8 };
    s = applyAction(s, { type: "mine", id: "node-0" }, 1000);
    expect(s.inventory.wood).toBe(93);
    expect(() =>
      applyAction(s, { type: "mine", id: "node-0" }, 20999),
    ).toThrow();
    s = applyAction(s, { type: "mine", id: "node-0" }, 21000);
    expect(s.inventory.wood).toBe(96);
    expect(walkable(s, "listoria", 2, 7, 22000)).toBe(false);
  });
});
describe("base construction, crafting and extraction", () => {
  it("validates civil footprints, water, resources, pad and edges", () => {
    const s = newGame(0);
    for (const [x, z] of [
      [12, 15],
      [16, 18],
      [2, 2],
      [11, 4],
      [22, 22],
      [37, 37],
    ])
      expect(canBuild(s, x, z, "house", 0), `${x},${z}`).toBe(false);
    expect(canBuild(s, 16, 14, "house", 0)).toBe(true);
    const b = applyAction(s, build(), 0);
    expect(b.inventory.wood).toBe(72);
    expect(canBuild(b, 16, 14, "house", 0)).toBe(false);
  });
  it("allows civil buildings only at home and modules only on secondary planets", () => {
    for (const p of ["listoria", "mycelia", "pyros"] as const) {
      expect(() => applyAction(outpost(p), build(), 0)).toThrow(/родной/);
      expect(canBuild(outpost(p), 7, 5, "warehouse", 0)).toBe(false);
    }
    expect(() => applyAction(newGame(0), build("extractor"), 0)).toThrow(
      /исследовательских/,
    );
  });
  it("does not partially spend resources on failure", () => {
    const s = newGame(0);
    s.inventory.stone = 0;
    expect(() => applyAction(s, build(), 0)).toThrow();
    expect(s.inventory.wood).toBe(90);
    expect(s.worlds.home.buildings).toHaveLength(1);
  });
  it("crafts kits in batches and consumes a kit without double charging", () => {
    let s = newGame(0);
    s = applyAction(s, { type: "craft", recipe: "kit:house", count: 2 }, 0);
    expect(s.inventory.wood).toBe(54);
    s = applyAction(s, build(), 0);
    expect(s.inventory["kit:house"]).toBe(1);
    expect(s.inventory.wood).toBe(54);
    expect(() =>
      applyAction(s, { type: "craft", recipe: "kit:house", count: 10 }, 0),
    ).toThrow();
    expect(s.inventory.wood).toBe(54);
  });
  it("unlocks advanced recipes with the home laboratory", () => {
    let s = newGame(0);
    expect(() =>
      applyAction(
        s,
        { type: "craft", recipe: "furniture:fireplace", count: 1 },
        0,
      ),
    ).toThrow(/лабораторию/);
    expect(() =>
      applyAction(
        s,
        { type: "craft", recipe: "kit:bioextractor", count: 1 },
        0,
      ),
    ).toThrow();
    s = applyAction(s, build("laboratory"), 0);
    s = applyAction(
      s,
      { type: "craft", recipe: "furniture:fireplace", count: 1 },
      0,
    );
    expect(s.inventory["furniture:fireplace"]).toBe(1);
  });
  it("makes seeds from harvest via a recipe", () => {
    let s = newGame(0);
    s.inventory["crop:carrot"] = 2;
    s = applyAction(s, { type: "craft", recipe: "seed:carrot", count: 1 }, 0);
    expect(s.inventory["crop:carrot"]).toBe(0);
    expect(s.inventory["seed:carrot"]).toBe(7);
  });
  it("requires the right nearby resource and lab for biomodules", () => {
    const s = outpost();
    expect(() =>
      applyAction(s, { ...build("extractor", 7, 5), resource: "wood" }, 0),
    ).toThrow();
    expect(() =>
      applyAction(s, { ...build("bioextractor", 7, 5), resource: "wood" }, 0),
    ).toThrow(/лаборатория/);
    const m = moduleSave().worlds.listoria.buildings[0];
    expect(
      nodes("listoria").some(
        (n) =>
          n.resource === m.resource &&
          Math.hypot(n.x - m.x - 0.5, n.z - m.z - 0.5) <= 5,
      ),
    ).toBe(true);
  });
  it("accumulates offline, caps its buffer, collects once, and gains warehouse capacity", () => {
    let s = moduleSave();
    const b = s.worlds.listoria.buildings[0];
    expect(moduleAmount(s, b, 19999)).toBe(0);
    expect(moduleAmount(s, b, 20000)).toBe(3);
    expect(moduleAmount(s, b, 999999)).toBe(40);
    s.position = { x: b.x - 1, z: b.z };
    const stone = s.inventory.stone;
    s = applyAction(s, { type: "collect", id: b.id }, 40000);
    expect(s.inventory.stone).toBe(stone + 6);
    expect(() =>
      applyAction(s, { type: "collect", id: b.id }, 40000),
    ).toThrow();
    s.planet = "home";
    s.position = { x: 18, z: 21 };
    s = applyAction(s, build("warehouse"), 40000);
    expect(moduleCapacity(s)).toBe(80);
    expect(moduleAmount(s, s.worlds.listoria.buildings[0], 999999)).toBe(80);
  });
});
describe("interior and furniture", () => {
  it("requires approaching HQ and creates a separate persistent interior", () => {
    expect(() =>
      applyAction(newGame(0), { type: "enter", id: "home-hq" }, 0),
    ).toThrow(/поближе/);
    const s = enter();
    expect(s.inside).toBe("home-hq");
    expect(s.position).toEqual(ROOM.spawn);
    expect(s.outsidePosition).toEqual({ x: 13, z: 18 });
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
  it("only places crafted furniture inside, protects the door and prevents overlap", () => {
    let s = enter();
    expect(() =>
      applyAction(
        s,
        { type: "placeFurniture", kind: "chair", x: 3, z: 3, rotation: 0 },
        0,
      ),
    ).toThrow(/создайте/);
    s = applyAction(
      s,
      { type: "craft", recipe: "furniture:chair", count: 1 },
      0,
    );
    s = applyAction(
      s,
      { type: "placeFurniture", kind: "chair", x: 3, z: 3, rotation: 0 },
      0,
    );
    expect(s.interiors["home-hq"]).toHaveLength(1);
    expect(s.inventory["furniture:chair"]).toBe(0);
    expect(canPlaceFurniture(s, 3, 3, "chair", 0)).toBe(false);
    expect(canPlaceFurniture(s, 6, 8, "chair", 0)).toBe(false);
    expect(walkable(s, "home", 3, 3)).toBe(false);
    expect(canPlaceFurniture(newGame(0), 3, 3, "chair", 0)).toBe(false);
  });
  it("handles rotated footprints, walking over rugs and returning furniture to the bag", () => {
    let s = enter();
    s = applyAction(s, { type: "craft", recipe: "furniture:rug", count: 1 }, 0);
    s = applyAction(
      s,
      { type: "placeFurniture", kind: "rug", x: 3, z: 3, rotation: 1 },
      0,
    );
    expect(walkable(s, "home", 3, 3)).toBe(true);
    s.position = { x: 3, z: 5 };
    s = applyAction(
      s,
      { type: "takeFurniture", id: s.interiors["home-hq"][0].id },
      0,
    );
    expect(s.inventory["furniture:rug"]).toBe(1);
    expect(s.interiors["home-hq"]).toHaveLength(0);
  });
  it("exits only at the door and returns to the outside position; blocks outside actions indoors", () => {
    let s = enter();
    expect(() =>
      applyAction(s, { type: "travel", planet: "pyros" }, 0),
    ).toThrow(/выйдите/);
    s.position = { x: 2, z: 2 };
    expect(() => applyAction(s, { type: "exit" }, 0)).toThrow();
    s.position = { ...ROOM.spawn };
    s = applyAction(s, { type: "exit" }, 0);
    expect(s.inside).toBeNull();
    expect(s.position).toEqual({ x: 13, z: 18 });
  });
});
describe("events, paths and travel", () => {
  it("produces deterministic meteor and wind events with quiet periods", () => {
    const s = newGame(0);
    expect(worldEvent(s, "home", 0)).toBeNull();
    const meteor = worldEvent(s, "home", 40000)!;
    expect(meteor.type).toBe("meteor");
    expect(worldEvent(parseSave(JSON.stringify(s)), "home", 40000)).toEqual(
      meteor,
    );
    let wind = null;
    for (let t = 110000; t < 140000; t += 1000) {
      const e = worldEvent(s, "home", t);
      if (e?.type === "wind") {
        wind = e;
        break;
      }
    }
    expect(wind?.type).toBe("wind");
  });
  it("requires impact and proximity and only salvages once", () => {
    let s = newGame(0);
    const e = worldEvent(s, "home", 40000)!;
    expect(() =>
      applyAction(s, { type: "salvage", event: e.id }, e.startsAt),
    ).toThrow();
    s.position = { x: e.x, z: e.z };
    s = applyAction(s, { type: "salvage", event: e.id }, 40000);
    expect(s.inventory.crystal).toBe(24);
    expect(s.inventory.stone).toBe(81);
    expect(() =>
      applyAction(s, { type: "salvage", event: e.id }, 40000),
    ).toThrow();
  });
  it("navigates around home obstacles and preserves all four worlds over flights", () => {
    let s = newGame(0);
    expect(() =>
      applyAction(s, { type: "travel", planet: "mycelia" }, 0),
    ).toThrow();
    const path = findPath(s, { x: 13, z: 16 }, 0, 2.4);
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((p) => walkable(s, "home", p.x, p.z))).toBe(true);
    s = applyAction(s, build(), 0);
    for (const p of ["listoria", "mycelia", "pyros", "home"] as PlanetId[]) {
      const pad = ship(s.planet);
      s.position = { x: pad.x - 2, z: pad.z };
      s = applyAction(s, { type: "travel", planet: p }, s.updatedAt + 1000);
      s = finishFlight(s);
    }
    expect(s.worlds.home.buildings).toHaveLength(2);
    expect(s.inventory.wood).toBe(72);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
});
