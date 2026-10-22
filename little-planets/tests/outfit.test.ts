import { Models } from "../src/world/Models";
import { SphereWorld, spherePoint } from "../src/world/SphereWorld";
import { describe, it, expect } from "vitest";
import {
  newGame,
  applyAction,
  parseSave,
  landingPad,
  type Save,
} from "../shared/model";
import {
  BEDS,
  planetSize,
  basePlanetSize,
  PLANETS,
  ship,
  beds,
  key,
  type PlanetId,
} from "../shared/catalog";
import { deviceKinds, DEVICE_COSTS } from "../shared/automation";
import { sphereNormal } from "../shared/sphere";
import { cellKey, offsetPoint } from "../shared/voxel";
import { padPoint, len, sub } from "../shared/space";
import { finishFlight } from "./fly";
const design = {
  name: "Караван",
  class: "cargo",
  model: 3,
  hull: "freighter",
  wings: "delta",
  color: "emerald",
} as const;
function withShip() {
  let s = newGame(Date.now(), true);
  s.worlds.home.buildings.push({
    id: "yard-fixture",
    kind: "shipyard",
    x: 2,
    z: 3,
    rotation: 0,
  });
  return applyAction(s, { type: "createShip", ship: design });
}
describe("Outfit inventory, placement and enlarged worlds", () => {
  it("increases every face by about 20 percent and gives home 46 cells", () => {
    expect(planetSize("home")).toBe(46);
    for (const p of Object.keys(PLANETS) as PlanetId[])
      expect(planetSize(p)).toBe(Math.round(basePlanetSize(p) * 1.2));
  });
  it.each(deviceKinds)(
    "crafts %s into inventory without deployment, then consumes exactly one kit on placement",
    (kind) => {
      let s = newGame(Date.now(), true);
      s.position = { x: 7, z: 8 };
      const before = structuredClone(s.inventory);
      s = applyAction(s, { type: "craftDevice", kind });
      expect(s.automation.devices).toHaveLength(0);
      expect(s.inventory[`device:${kind}`]).toBe(1);
      expect(s.inventory.wood).toBe(before.wood);
      s = applyAction(s, { type: "placeDevice", kind, ...s.position });
      expect(s.inventory[`device:${kind}`]).toBe(0);
      expect(s.automation.devices).toHaveLength(1);
      expect(s.automation.devices[0]).toMatchObject({
        kind,
        planet: "home",
        ...s.position,
      });
      expect(parseSave(JSON.stringify(s)).automation.devices).toEqual(
        s.automation.devices,
      );
      expect(() =>
        applyAction(s, { type: "placeDevice", kind, ...s.position }),
      ).toThrow();
    },
  );
  it("charges crafting outside test mode and rejects remote placement without spending the kit", () => {
    let s = newGame(Date.now(), false);
    const cost = DEVICE_COSTS.collector;
    s = applyAction(s, { type: "craftDevice", kind: "collector" });
    expect(s.inventory.wood).toBe(90 - cost.wood);
    expect(() =>
      applyAction(s, { type: "placeDevice", kind: "collector", x: 35, z: 17 }),
    ).toThrow();
    expect(s.inventory["device:collector"]).toBe(1);
    expect(s.automation.devices).toHaveLength(0);
  });
  it("rejects block destruction even when a tool is owned", () => {
    const s = newGame(Date.now(), true);
    s.hand = "none";
    expect(() =>
      applyAction(s, {
        type: "terrain",
        mode: "dig",
        material: "stone",
        ...s.position,
      }),
    ).toThrow();
    expect(s.inventory.stone).toBe(75);
  });
  it("stores a customised ship in inventory, installs its pad and preserves the replaced ship", () => {
    let s = withShip();
    const created = s.fleet.at(-1)!;
    expect(s.activeShip).toBe("starter");
    expect(s.inventory[`ship:${created.id}`]).toBe(1);
    s.position = { x: 8, z: 7 };
    s = applyAction(s, { type: "placeShip", id: created.id, ...s.position });
    expect(s.inventory[`ship:${created.id}`]).toBe(0);
    expect(s.inventory["ship:starter"]).toBe(1);
    expect(s.worlds.home.launchPad).toEqual({
      shipId: created.id,
      ...s.position,
    });
    expect(s.fleet.find((sh) => sh.id === s.activeShip)).toMatchObject(design);
    expect(Object.keys(s.worlds.home.terrain).length).toBeGreaterThan(0);
    const restored = parseSave(JSON.stringify(s));
    expect(restored.worlds.home.launchPad).toEqual(s.worlds.home.launchPad);
    expect(() =>
      applyAction(restored, {
        type: "placeShip",
        id: created.id,
        ...s.position,
      }),
    ).toThrow();
  });
  it("refreshes a placed ship and pad without replacing the world scene or motion state", () => {
    let s = withShip();
    const kit = new Models(),
      world = new SphereWorld(kit, s, s.updatedAt),
      shipRoot = world.ship,
      sceneRoot = world.root;
    const id = s.fleet.at(-1)!.id;
    s.position = { x: 8, z: 7 };
    s = applyAction(s, { type: "placeShip", id, ...s.position });
    world.rebuild(s, s.updatedAt);
    expect(world.root).toBe(sceneRoot);
    expect(world.ship).toBe(shipRoot);
    expect(
      world.ship.position.distanceTo(spherePoint(s.position, 0.14, "home")),
    ).toBeLessThan(0.001);
    expect(world.ship.visible).toBe(true);
    world.dispose();
    kit.dispose();
  });
  it("launches and lands at custom sites, persists sites in flight and prevents boarding an empty pad", () => {
    let s = withShip();
    const id = s.fleet.at(-1)!.id;
    s.position = { x: 8, z: 7 };
    s = applyAction(s, { type: "placeShip", id, ...s.position });
    const home = { ...landingPad(s, "home") };
    s = applyAction(s, { type: "boardShip" });
    expect(s.worlds.home.launchPad?.shipId).toBeNull();
    expect(
      len(sub(s.flight!.position, padPoint("home", 13, home))),
    ).toBeLessThan(0.001);
    s = parseSave(JSON.stringify(s));
    expect(s.flight!.pads!.home).toMatchObject({ x: 8, z: 7 });
    s = applyAction(s, { type: "course", planet: "listoria" });
    s = finishFlight(s);
    s = applyAction(s, { type: "travel", planet: "home" });
    s = finishFlight(s);
    expect(s.worlds.home.launchPad?.shipId).toBe(id);
    expect(s.position.x).not.toBe(ship("home").x);
    expect(s.inventory[`ship:${id}`]).toBe(0);
    s.worlds.home.launchPad!.shipId = null;
    expect(() => applyAction(s, { type: "boardShip" })).toThrow("нет корабля");
  });
  it("migrates old geometry and progress once, preserving edited blocks, crops, programs and ship kits", () => {
    let s = newGame(1000, true);
    s.position = { x: 8.5, z: 9.5 };
    s = applyAction(s, { type: "deploy", kind: "collector" }, 1000);
    s.fleet.push({ ...design, id: "old-cargo" });
    s.planetScale = 1;
    s.position = { x: 8.5, z: 9.5 };
    s.worlds.home.launchPad = undefined;
    s.worlds.home.buildings = [
      { id: "home-hq", kind: "headquarters", x: 12, z: 15, rotation: 0 },
    ];
    s.worlds.home.terrain = {
      "4:12:15": {
        height: 2.7,
        material: "wood",
        removed: [2],
        blocks: { "7": "wood" },
      },
    };
    s.worlds.home.cleared = ["4:12:15"];
    s.worlds.home.crops["13,9"] = { plant: "carrot", plantedAt: 500 };
    // Use an actual pre-expansion bed coordinate rather than an arbitrary cell.
    const current = beds("home")[0],
      ratio = 46 / 38;
    const old = { x: BEDS[0].x + 10, z: BEDS[0].z + 2 };
    s.worlds.home.crops = {
      [key(old.x, old.z)]: { plant: "carrot", plantedAt: 500 },
    };
    const result = parseSave(JSON.stringify(s));
    expect(result.planetScale).toBe(1.2);
    expect(result.position.x).toBeCloseTo(8.5 * ratio);
    expect(result.inventory).toMatchObject(s.inventory);
    expect(result.inventory["ship:old-cargo"]).toBe(1);
    expect(result.automation.devices[0].program).toEqual(
      s.automation.devices[0].program,
    );
    expect(result.automation.devices[0].x).toBeCloseTo(
      s.automation.devices[0].x * ratio,
    );
    expect(
      Object.values(result.worlds.home.terrain).some(
        (t) => t.blocks?.["7"] === "wood" && t.removed?.includes(2),
      ),
    ).toBe(true);
    expect(result.worlds.home.crops[key(current.x, current.z)].plantedAt).toBe(
      500,
    );
    expect(parseSave(JSON.stringify(result))).toEqual(result);
  });
});
