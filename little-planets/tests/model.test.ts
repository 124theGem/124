import { describe, it, expect } from "vitest";
import {
  newGame,
  applyAction,
  parseSave,
  ready,
  stage,
  canBuild,
  canPlaceFurniture,
  walkable,
  moduleAmount,
  moduleCapacity,
  worldEvent,
  type Save,
} from "../shared/model";
import {
  ship,
  nodes,
  beds,
  ROOM,
  BUILDINGS,
  type BuildingKind,
} from "../shared/catalog";
import { buildingCenter } from "../shared/model";
import { offsetPoint } from "../shared/voxel";
import { finishFlight } from "./fly";
function build(s: Save, kind: BuildingKind) {
  for (let x = 1; x < 36; x++)
    for (let z = 1; z < 18; z++)
      if (canBuild(s, x, z, kind, 0)) {
        try {
          return applyAction(
            s,
            { type: "build", kind, x, z, rotation: 0 },
            1000,
          );
        } catch {}
      }
  throw new Error(`No site for ${kind}`);
}
function enter() {
  let s = newGame(0);
  const b = s.worlds.home.buildings[0];
  s.position = buildingCenter(b);
  return applyAction(s, { type: "enter", id: b.id }, 1000);
}
describe("cube colony, farming, buildings and interior regression checks", () => {
  it("has the home HQ, rejects malformed saves and resets old prototypes", () => {
    const s = newGame(0);
    expect(s.worlds.home.buildings[0].kind).toBe("headquarters");
    expect(() => parseSave("{}")).toThrow();
    expect(() =>
      parseSave(JSON.stringify({ ...s, inventory: { wood: -1 } })),
    ).toThrow();
    for (const version of [1, 2, 3, 4, 5])
      expect(parseSave(JSON.stringify({ version })).version).toBe(6);
  });
  it("grows through stages, persists offline crops, harvests once and produces seeds", () => {
    let s = newGame(0);
    const b = beds("home")[0];
    s.position = { ...b };
    s = applyAction(s, { type: "plant", ...b, plant: "sunflower" }, 1000);
    const k = `${b.x},${b.z}`,
      c = s.worlds.home.crops[k];
    expect(stage(c, 1000)).toBe(0);
    expect(stage(c, 7000)).toBe(1);
    expect(stage(c, 12000)).toBe(2);
    expect(ready(c, 15999)).toBe(false);
    expect(() => applyAction(s, { type: "harvest", ...b }, 15000)).toThrow();
    s = parseSave(JSON.stringify(s));
    s = applyAction(s, { type: "harvest", ...b }, 16000);
    expect(s.inventory["crop:sunflower"]).toBe(3);
    expect(s.inventory["seed:sunflower"]).toBe(7);
    expect(() => applyAction(s, { type: "harvest", ...b }, 17000)).toThrow();
  });
  it("validates biome, occupied beds and replenishing resource sources", () => {
    let s = newGame(0);
    const b = beds("home")[0];
    s.position = { ...b };
    expect(() =>
      applyAction(s, { type: "plant", ...b, plant: "moonshroom" }, 1000),
    ).toThrow();
    s = applyAction(s, { type: "plant", ...b, plant: "carrot" }, 1000);
    expect(() =>
      applyAction(s, { type: "plant", ...b, plant: "carrot" }, 2000),
    ).toThrow();
    const n = nodes("home").find((n) => n.resource !== "wood")!;
    s.position = { x: n.x, z: n.z };
    const before = s.inventory[n.resource];
    s = applyAction(s, { type: "mine", id: n.id }, 3000);
    expect(s.inventory[n.resource]).toBe(before + 3);
    expect(() => applyAction(s, { type: "mine", id: n.id }, 22000)).toThrow();
    s = applyAction(s, { type: "mine", id: n.id }, 23000);
    expect(s.inventory[n.resource]).toBe(before + 6);
  });
  it("constructs civil buildings, validates footprints, prevents partial charges and consumes crafted kits once", () => {
    let s = newGame(0);
    s = applyAction(s, { type: "craft", recipe: "kit:house", count: 2 }, 1000);
    expect(s.inventory.wood).toBe(54);
    s = build(s, "house");
    expect(s.inventory["kit:house"]).toBe(1);
    expect(s.inventory.wood).toBe(54);
    const b = s.worlds.home.buildings.at(-1)!;
    expect(canBuild(s, b.x, b.z, "house", 1000)).toBe(false);
    expect(canBuild(s, 37, 37, "house", 1000)).toBe(false);
    const broke = newGame(0);
    broke.inventory.stone = 0;
    expect(() => build(broke, "house")).toThrow();
    expect(broke.inventory.wood).toBe(90);
    s.planet = "listoria";
    expect(() =>
      applyAction(
        s,
        { type: "build", kind: "house", x: 3, z: 3, rotation: 0 },
        2000,
      ),
    ).toThrow(/родной/);
  });
  it("requires and uses laboratory unlocks, builds production modules and retains their buffers", () => {
    let s = newGame(0);
    expect(() =>
      applyAction(s, { type: "craft", recipe: "gear:blaster", count: 1 }, 1000),
    ).toThrow(/лабораторию/);
    s = build(s, "laboratory");
    s = applyAction(
      s,
      { type: "craft", recipe: "gear:blaster", count: 1 },
      1000,
    );
    expect(s.inventory["gear:blaster"]).toBe(1);
    s.planet = "listoria";
    s.position = { ...ship("listoria") };
    s = build(s, "extractor");
    const b = s.worlds.listoria.buildings.at(-1)!;
    expect(moduleAmount(s, b, 21000)).toBe(3);
    expect(moduleAmount(s, b, 999999)).toBe(40);
    s.position = buildingCenter(b);
    const before = s.inventory[b.resource!];
    s = applyAction(s, { type: "collect", id: b.id }, 41000);
    expect(s.inventory[b.resource!]).toBe(before + 6);
    expect(() =>
      applyAction(s, { type: "collect", id: b.id }, 41000),
    ).toThrow();
  });
  it("enters HQ, furnishes the room, protects door/overlap and restores outside position", () => {
    expect(() =>
      applyAction(newGame(0), { type: "enter", id: "home-hq" }, 1000),
    ).toThrow(/поближе/);
    let s = enter();
    expect(s.position).toEqual(ROOM.spawn);
    const outside = { ...s.outsidePosition! };
    expect(() =>
      applyAction(s, { type: "travel", planet: "listoria" }, 1000),
    ).toThrow(/выйдите/);
    expect(() =>
      applyAction(
        s,
        { type: "placeFurniture", kind: "chair", x: 3, z: 3, rotation: 0 },
        1000,
      ),
    ).toThrow(/создайте/);
    s = applyAction(
      s,
      { type: "craft", recipe: "furniture:chair", count: 1 },
      1000,
    );
    s = applyAction(
      s,
      { type: "placeFurniture", kind: "chair", x: 3, z: 3, rotation: 0 },
      1000,
    );
    expect(walkable(s, "home", 3, 3)).toBe(false);
    expect(canPlaceFurniture(s, 6, 8, "chair", 0)).toBe(false);
    expect(canPlaceFurniture(s, 3, 3, "chair", 0)).toBe(false);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    s.position = { x: 3, z: 5 };
    s = applyAction(
      s,
      { type: "takeFurniture", id: s.interiors["home-hq"][0].id },
      1000,
    );
    expect(s.inventory["furniture:chair"]).toBe(1);
    s.position = { ...ROOM.spawn };
    s = applyAction(s, { type: "exit" }, 1000);
    expect(s.inside).toBeNull();
    expect(s.position).toEqual(outside);
  });
  it("uses real saved weather timelines, rewards meteor salvage once and preserves colony through a flight", () => {
    let s = newGame(0);
    expect(worldEvent(s, "home", 0)).toBeNull();
    const e = worldEvent(s, "home", 40000)!;
    expect(e.type).toBe("meteor");
    s.position = { x: e.x, z: e.z };
    expect(() =>
      applyAction(s, { type: "salvage", event: e.id }, e.startsAt),
    ).toThrow();
    s = applyAction(s, { type: "salvage", event: e.id }, 40000);
    expect(s.inventory.crystal).toBe(24);
    expect(() =>
      applyAction(s, { type: "salvage", event: e.id }, 40000),
    ).toThrow();
    s.position = { ...ship("home") };
    const before = { ...s.inventory };
    s = applyAction(s, { type: "travel", planet: "listoria" }, 41000);
    expect(s.planet).toBe("home");
    s = finishFlight(s);
    expect(s.planet).toBe("listoria");
    expect(s.inventory).toEqual(before);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
});
