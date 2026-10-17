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
} from "../shared/model";
import { SHIP } from "../shared/catalog";
describe("growth and inventory", () => {
  it("plants, changes stage by elapsed time, harvests once and returns seeds", () => {
    let save = newGame(1000);
    save.position = { x: 6, z: 10 };
    save = applyAction(
      save,
      { type: "plant", x: 6, z: 9, plant: "sunflower" },
      1000,
    );
    const crop = save.worlds.listoria.crops["6,9"];
    expect(stage(crop, 1000)).toBe(0);
    expect(stage(crop, 7000)).toBe(1);
    expect(stage(crop, 12000)).toBe(2);
    expect(ready(crop, 15999)).toBe(false);
    expect(() =>
      applyAction(save, { type: "harvest", x: 6, z: 9 }, 15999),
    ).toThrow();
    save = applyAction(save, { type: "harvest", x: 6, z: 9 }, 16000);
    expect(save.inventory["crop:sunflower"]).toBe(3);
    expect(save.inventory["seed:sunflower"]).toBe(7);
    expect(() =>
      applyAction(save, { type: "harvest", x: 6, z: 9 }, 20000),
    ).toThrow();
  });
  it("rare crops need 30 seconds and survive serialized saves and offline time", () => {
    let save = newGame(0);
    save.position = { x: 6, z: 10 };
    save = applyAction(
      save,
      { type: "plant", x: 6, z: 9, plant: "glowbush" },
      0,
    );
    save = parseSave(JSON.stringify(save));
    expect(ready(save.worlds.listoria.crops["6,9"], 29999)).toBe(false);
    expect(ready(save.worlds.listoria.crops["6,9"], 30000)).toBe(true);
  });
  it("rejects wrong biome and occupied beds without spending resources", () => {
    let save = newGame();
    save.position = { x: 6, z: 10 };
    expect(() =>
      applyAction(save, { type: "plant", x: 6, z: 9, plant: "moonshroom" }),
    ).toThrow();
    save = applyAction(save, { type: "plant", x: 6, z: 9, plant: "carrot" });
    expect(() =>
      applyAction(save, { type: "plant", x: 6, z: 9, plant: "carrot" }),
    ).toThrow();
    expect(save.inventory["seed:carrot"]).toBe(5);
  });
});
describe("building, gathering and travel", () => {
  it("validates footprint against buildings, beds, resources, water, ship and edges", () => {
    const save = newGame();
    for (const [x, z] of [
      [3, 3],
      [6, 8],
      [2, 7],
      [11, 4],
      [12, 12],
      [16, 16],
    ])
      expect(canBuild(save, x, z)).toBe(false);
    expect(canBuild(save, 7, 5)).toBe(true);
    const built = applyAction(save, {
      type: "build",
      kind: "house",
      x: 7,
      z: 5,
      rotation: 1,
    });
    expect(built.inventory.wood).toBe(27);
    expect(canBuild(built, 7, 5)).toBe(false);
    expect(() =>
      applyAction(built, {
        type: "build",
        kind: "house",
        x: 7,
        z: 5,
        rotation: 0,
      }),
    ).toThrow();
  });
  it("does not spend partially on unaffordable buildings", () => {
    const save = newGame();
    save.inventory.stone = 0;
    expect(() =>
      applyAction(save, {
        type: "build",
        kind: "house",
        x: 7,
        z: 5,
        rotation: 0,
      }),
    ).toThrow();
    expect(save.inventory.wood).toBe(45);
  });
  it("regenerates a resource after 20 seconds and prevents double gathering", () => {
    let save = newGame();
    save.position = { x: 2, z: 8 };
    save = applyAction(save, { type: "mine", id: "node-0" }, 1000);
    expect(save.inventory.wood).toBe(48);
    expect(() =>
      applyAction(save, { type: "mine", id: "node-0" }, 20999),
    ).toThrow();
    save = applyAction(save, { type: "mine", id: "node-0" }, 21000);
    expect(save.inventory.wood).toBe(51);
  });
  it("keeps depleted resource bases solid so regeneration cannot trap the astronaut", () => {
    const save = newGame();
    save.worlds.listoria.depleted["node-0"] = 1000;
    expect(walkable(save, "listoria", 2, 7, 2000)).toBe(false);
    expect(walkable(save, "listoria", 2, 7, 22000)).toBe(false);
  });
  it("travels to all biomes and back with shared inventory, planted crops and buildings retained", () => {
    let save = newGame(0);
    save.position = { x: 6, z: 10 };
    save = applyAction(save, { type: "plant", x: 6, z: 9, plant: "carrot" }, 0);
    save = applyAction(
      save,
      { type: "build", kind: "house", x: 7, z: 5, rotation: 0 },
      0,
    );
    for (const planet of ["mycelia", "pyros", "listoria"]) {
      save.position = { x: SHIP.x - 2, z: SHIP.z };
      save = applyAction(save, { type: "travel", planet }, 4000);
    }
    expect(save.worlds.listoria.crops["6,9"].plant).toBe("carrot");
    expect(save.worlds.listoria.buildings).toHaveLength(2);
    expect(save.inventory.wood).toBe(27);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });
  it("requires reaching the ship and navigates around bed obstacles", () => {
    const save = newGame();
    expect(() =>
      applyAction(save, { type: "travel", planet: "mycelia" }),
    ).toThrow();
    const path = findPath(save, { x: 6, z: 8 }, 0);
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((p) => !(p.x === 6 && p.z === 9))).toBe(true);
  });
  it("rejects corrupt saves", () => {
    expect(() => parseSave("{}")).toThrow();
    expect(() =>
      parseSave(JSON.stringify({ ...newGame(), inventory: { wood: -1 } })),
    ).toThrow();
  });
});
