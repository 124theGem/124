import { finishFlight } from "./fly";
import { AutomationActors } from "../src/world/AutomationActors";
import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  newGame,
  applyAction,
  parseSave,
  canBuild,
  type Save,
} from "../shared/model";
import {
  PLANETS,
  PLANET_COMPOSITION,
  planetSize,
  ship,
  type PlanetId,
  type BuildingKind,
} from "../shared/catalog";
import { RAW_RESOURCES, INDUSTRIAL_RECIPES } from "../shared/resources";
import {
  constellationIndex,
  inScannerRange,
  scannerRange,
} from "../shared/sector";
import { cubeNormal, offsetPoint } from "../shared/voxel";
import { sphereCoordinates, surfaceDistance } from "../shared/sphere";
import { advanceAutomation, cargoAmount } from "../shared/automation";
import { Models } from "../src/world/Models";
import { SHIP_STATS } from "../shared/ships";
const tick = (s: Save, t: number) => applyAction(s, { type: "combatTick" }, t);
function build(s: Save, kind: BuildingKind) {
  for (let x = 1; x < planetSize(s.planet); x++)
    for (let z = 1; z < planetSize(s.planet) / 2; z++)
      if (canBuild(s, x, z, kind, 1000))
        return applyAction(s, { type: "build", kind, x, z, rotation: 0 }, 1000);
  throw Error("No site");
}
function deploy(s: Save, kind: string) {
  return applyAction(s, { type: "deploy", kind }, 1000);
}
function logisticsFixture() {
  let s = newGame(0, true);
  s.position = { ...ship("home") };
  s = deploy(s, "warehouse");
  s.position = offsetPoint(s.position, 6, 0, "home");
  s = deploy(s, "refinery");
  const ref = s.automation.devices.at(-1)!;
  s = deploy(s, "crawler");
  const crawler = s.automation.devices.at(-1)!;
  s = applyAction(
    s,
    {
      type: "logisticsRoute",
      id: crawler.id,
      from: "home",
      to: "home",
      resource: "wood",
      refineryId: ref.id,
    },
    1000,
  );
  return { s, refId: ref.id, crawlerId: crawler.id };
}
describe("Aurora resource survey and large stellar network", () => {
  it("contains 1206 playable cubes in 61 constellations and exactly thirty raw resources", () => {
    expect(Object.keys(PLANETS)).toHaveLength(1206);
    expect(
      new Set(
        Object.keys(PLANETS).map((p) => constellationIndex(p as PlanetId)),
      ).size,
    ).toBe(61);
    expect(Object.keys(RAW_RESOURCES)).toHaveLength(30);
  });
  it("has three unique immutable resources per world, percentages total 100 and a biome primary", () => {
    for (const p of Object.values(PLANETS)) {
      const c = PLANET_COMPOSITION[p.id];
      expect(new Set(c.map((r) => r.resource)).size).toBe(3);
      expect(c.reduce((n, r) => n + r.percent, 0)).toBe(100);
      expect(p.resource).toEqual(c.map((r) => r.resource));
      for (const r of c)
        expect(Object.hasOwn(RAW_RESOURCES, r.resource)).toBe(true);
      if (p.sphereTheme === "forest") expect(c[0].resource).toBe("wood");
      if (p.sphereTheme === "ice") expect(c[0].resource).toBe("ice");
    }
  });
  it("enforces scanner reach, unlocks far worlds at level ten, persists surveys and creates remote saves lazily", () => {
    let s = build(newGame(0, true), "scanner");
    const b = s.worlds.home.buildings.find((b) => b.kind === "scanner")!;
    expect(Object.keys(s.worlds).length).toBe(30);
    expect(inScannerRange(s, "wild-1200")).toBe(false);
    expect(() =>
      applyAction(s, { type: "scanPlanet", planet: "wild-1200" }, 2000),
    ).toThrow(/радиуса/);
    s.position = { x: b.x, z: b.z };
    for (let l = 1; l < 10; l++)
      s = applyAction(s, { type: "upgradeBuilding", id: b.id }, 2000 + l);
    expect(scannerRange(10)).toBeGreaterThan(scannerRange(9));
    expect(inScannerRange(s, "wild-1200")).toBe(true);
    s = applyAction(s, { type: "scanPlanet", planet: "wild-1200" }, 2100);
    expect(s.scans).toContain("wild-1200");
    expect(s.discovered).toContain("wild-1200");
    expect(Object.keys(s.worlds)).toHaveLength(31);
    expect(() =>
      applyAction(s, { type: "scanPlanet", planet: "wild-1200" }, 2200),
    ).toThrow(/уже/);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    expect(() =>
      applyAction(s, { type: "upgradeBuilding", id: b.id }, 2300),
    ).toThrow(/максимальный/);
  });
  it("keeps old v6 inventories, terrain and programs while adding the passport, fleet and test allowance", () => {
    const old: any = newGame(0);
    old.inventory.iron = 17;
    for (const k of [
      "scans",
      "profile",
      "fleet",
      "activeShip",
      "freeConstruction",
    ])
      delete old[k];
    const s = parseSave(JSON.stringify(old));
    expect(s.inventory.iron).toBe(17);
    expect(s.freeConstruction).toBe(true);
    expect(s.fleet[0].id).toBe(s.activeShip);
    expect(s.scans).toEqual(["home"]);
  });
});
describe("Planetary harvester and modular facilities", () => {
  it("connects an ordinary warehouse building to real stock without rendering a duplicate station", () => {
    let s = build(newGame(0, true), "warehouse");
    const b = s.worlds.home.buildings.find((b) => b.kind === "warehouse")!;
    s.position = { x: b.x, z: b.z };
    s.inventory.wood = 3;
    s = applyAction(
      s,
      { type: "stock", resource: "wood", amount: 3, direction: "deposit" },
      2000,
    );
    expect(s.worlds.home.stock.wood).toBe(3);
    expect(s.inventory.wood).toBe(0);
    const k = new Models(),
      actors = new AutomationActors(k);
    actors.update(s, 1);
    expect(actors.positions).toHaveLength(0);
    actors.dispose();
    k.dispose();
  });
  it("extracts exactly the scanned mix after 100 units, at real level-dependent rates", () => {
    let s = build(newGame(0, true), "planetdrill");
    const id = s.worlds.home.buildings.find(
      (b) => b.kind === "planetdrill",
    )!.id;
    s = deploy(s, "warehouse");
    const start = { ...s.inventory };
    for (let t = 1500; t <= 51000; t += 500) s = tick(s, t);
    const b = s.worlds.home.buildings.find((b) => b.id === id)!;
    expect(b.produced).toBe(100);
    for (const part of PLANET_COMPOSITION.home)
      expect(s.worlds.home.stock[part.resource]).toBe(part.percent);
    expect(s.inventory).toEqual(start);
    s.position = { x: b.x, z: b.z };
    s = applyAction(s, { type: "upgradeBuilding", id }, 51100);
    s = tick(s, 52100);
    expect(
      s.worlds.home.buildings.find((b) => b.id === id)!.produced,
    ).toBeGreaterThanOrEqual(108);
  });
  it("keeps construction free while rejecting retired individual block placement", () => {
    const s = newGame(0, true);
    s.inventory.stone = 0;
    expect(s.freeConstruction).toBe(true);
    expect(() =>
      applyAction(
        s,
        { type: "terrain", mode: "place", material: "stone", ...s.position },
        1000,
      ),
    ).toThrow();
    expect(s.inventory.stone).toBe(0);
    expect(s.worlds.home.terrain).toEqual({});
  });
  it("grows to near a whole face and twenty-three meters tall, with increasing architectural detail", () => {
    const k = new Models();
    let previous = 0;
    for (let level = 1; level <= 5; level++) {
      const g = k.building("planetdrill", "home", level),
        bounds = new T.Box3().setFromObject(g).getSize(new T.Vector3());
      expect(bounds.x).toBeGreaterThan(previous);
      previous = bounds.x;
      if (level === 5) {
        expect(bounds.x).toBeGreaterThan(planetSize("home") * 0.8);
        expect(bounds.y).toBeGreaterThan(22);
      }
    }
    const a = new T.Box3()
        .setFromObject(k.building("scanner", "home", 1))
        .getSize(new T.Vector3()),
      b = new T.Box3()
        .setFromObject(k.building("scanner", "home", 10))
        .getSize(new T.Vector3());
    expect(b.y).toBeGreaterThan(a.y * 1.8);
    k.dispose();
  });
  it("constructs and upgrades for zero in test mode, but does not create processing inputs", () => {
    let s = newGame(0, true);
    s.inventory = {};
    s = build(s, "planetdrill");
    const b = s.worlds.home.buildings.find((b) => b.kind === "planetdrill")!;
    s.position = { x: b.x, z: b.z };
    for (let i = 1; i < 5; i++)
      s = applyAction(s, { type: "upgradeBuilding", id: b.id }, 1100 + i);
    expect(s.inventory).toEqual({});
    expect(
      s.worlds.home.buildings.find((item) => item.id === b.id)!.level,
    ).toBe(5);
  });
});
describe("Physical freight and Skylab production", () => {
  it("all recipes consume two distinct types and each higher-tier chain consumes rarer inputs", () => {
    expect(Object.keys(INDUSTRIAL_RECIPES).length).toBeGreaterThan(20);
    for (const [id, r] of Object.entries(INDUSTRIAL_RECIPES)) {
      expect(Object.keys(r.input)).toHaveLength(2);
      expect(Object.values(r.input).every((n) => n > 0)).toBe(true);
      if (id.startsWith("tier"))
        for (const input of Object.keys(r.input))
          expect(INDUSTRIAL_RECIPES[input].tier).toBe(r.tier - 1);
    }
  });
  it("does not teleport warehouse resources into a refinery without a carrier", () => {
    let s = newGame(0, true);
    s = deploy(s, "warehouse");
    s = deploy(s, "refinery");
    s.worlds.home.stock = { wood: 3, stone: 3 };
    for (let t = 1200; t <= 30000; t += 200) s = tick(s, t);
    expect(s.worlds.home.stock).toEqual({ wood: 3, stone: 3 });
    expect(s.automation.devices[1].job).toBeNull();
    expect(s.automation.devices[1].output).toEqual({});
  });
  it("physically transports both inputs, consumes a paid job once and returns its output to stock", () => {
    let { s, refId, crawlerId } = logisticsFixture();
    s.worlds.home.stock = { wood: 3, stone: 3 };
    let moved = false,
      carried = false,
      job = false;
    const start = { ...s.automation.devices.find((d) => d.id === crawlerId)! };
    for (let t = 1200; t < 70000; t += 200) {
      s = tick(s, t);
      const c = s.automation.devices.find((d) => d.id === crawlerId)!;
      moved ||= surfaceDistance(start, c, "home") > 1;
      carried ||= cargoAmount(c) > 0;
      job ||= !!s.automation.devices.find((d) => d.id === refId)!.job;
      if (s.worlds.home.stock.composite === 1) break;
    }
    expect(moved && carried && job).toBe(true);
    expect(s.worlds.home.stock).toEqual({ wood: 0, stone: 0, composite: 1 });
    const after = JSON.stringify(s.worlds.home.stock);
    s = tick(s, s.updatedAt);
    expect(JSON.stringify(s.worlds.home.stock)).toBe(after);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
  it("executes a two-planet route with partial loads and conserves the actual resource", () => {
    let s = newGame(0, true);
    for (const p of ["listoria", "mycelia"] as const) {
      s.planet = p;
      s.position = { ...ship(p) };
      s = deploy(s, "warehouse");
    }
    s.planet = "listoria";
    s.position = { ...ship("listoria") };
    s = deploy(s, "drone");
    const id = s.automation.devices.at(-1)!.id;
    s.worlds.listoria.stock.iron = 7;
    s = applyAction(
      s,
      {
        type: "logisticsRoute",
        id,
        from: "listoria",
        to: "mycelia",
        resource: "iron",
      },
      1000,
    );
    let flying = false;
    for (let t = 1200; t < 90000; t += 200) {
      s = tick(s, t);
      flying ||= !!s.automation.devices.find((d) => d.id === id)!.transit;
      if (s.worlds.mycelia.stock.iron === 7) break;
    }
    expect(flying).toBe(true);
    expect(s.worlds.listoria.stock.iron).toBe(0);
    expect(s.worlds.mycelia.stock.iron).toBe(7);
    expect(cargoAmount(s.automation.devices.find((d) => d.id === id)!)).toBe(0);
  });
  it("allows logistics across opposite cube faces without trapping a collector", () => {
    let { s, refId, crawlerId } = logisticsFixture();
    const ref = s.automation.devices.find((d) => d.id === refId)!;
    Object.assign(ref, sphereCoordinates(cubeNormal(5, 0.1, 0.2), "home"));
    s.worlds.home.stock = { wood: 3, stone: 3 };
    for (let t = 1200; t < 180000; t += 200) {
      s = tick(s, t);
      if (s.worlds.home.stock.composite === 1) break;
    }
    expect(s.worlds.home.stock.composite).toBe(1);
    expect(s.automation.devices.find((d) => d.id === crawlerId)!.cargo).toEqual(
      {},
    );
  });
});
describe("Personal fleet and access passport", () => {
  it("builds all nine ship classes/marks, selects their actual parts and uses their speed in flight", () => {
    let s = build(newGame(0, true), "shipyard");
    for (const kind of ["exploration", "combat", "cargo"] as const)
      for (const model of [1, 2, 3] as const)
        s = applyAction(
          s,
          {
            type: "createShip",
            ship: {
              name: `${kind}-${model}`,
              class: kind,
              model,
              hull: "freighter",
              wings: "delta",
              color: "cobalt",
            },
          },
          1100 + model,
        );
    expect(s.fleet).toHaveLength(10);
    const constructed = s.fleet.at(-1)!;
    expect(s.inventory[`ship:${constructed.id}`]).toBe(1);
    s.position = { x: 8, z: 7 };
    s = applyAction(
      s,
      { type: "placeShip", id: constructed.id, ...s.position },
      1500,
    );
    const active = s.fleet.find((sh) => sh.id === s.activeShip)!;
    expect(active.class).toBe("cargo");
    s = applyAction(s, { type: "travel", planet: "listoria" }, 2000);
    expect(s.flight!.topSpeed).toBe(SHIP_STATS(active).speed);
    expect(parseSave(JSON.stringify(s)).activeShip).toBe(active.id);
  });
  it("records arrivals and connected activity by planet for real interest zones", () => {
    let s = newGame(1000, true);
    s = tick(s, 6000);
    expect(s.profile.visits.home.seconds).toBe(5);
    s.position = { ...ship("home") };
    s = applyAction(s, { type: "travel", planet: "listoria" }, 6100);
    s = finishFlight(s);
    expect(s.profile.visits.listoria.arrivals).toBe(1);
    s = tick(s, s.updatedAt + 1000);
    expect(s.profile.visits.listoria.seconds).toBe(1);
    expect(parseSave(JSON.stringify(s)).profile).toEqual(s.profile);
  });
});
