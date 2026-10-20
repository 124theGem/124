import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  newGame,
  applyAction,
  parseSave,
  canBuild,
  buildingCenter,
  type Save,
} from "../shared/model";
import {
  cubeVisualUp,
  sphereCoordinates,
  sphereNormal,
} from "../shared/sphere";
import {
  cubeNormal,
  voxelCell,
  cellKey,
  voxelLevel,
  VOXEL_STEP,
} from "../shared/voxel";
import { prepareFoundation, foundationCells } from "../shared/construction";
import { experienceLevel, skillPoints } from "../shared/progression";
import { dayCycle, DAY_DURATION } from "../shared/daylight";
import { grapplePosition } from "../shared/grapple";
import { programSchema } from "../shared/automation";
import { SurfaceFollower, ActorFollower } from "../src/world/Motion";
import { Models } from "../src/world/Models";
import { SphereNature } from "../src/world/SphereNature";
import {
  BUILDINGS,
  beds,
  nodes,
  ship,
  type BuildingKind,
} from "../shared/catalog";
const v = (p: { x: number; y: number; z: number }) =>
  new T.Vector3(p.x, p.y, p.z);
describe("position-dependent camera frames and smooth height", () => {
  it("holds 45° at an edge and shares three directions at a vertex without a delayed turn", () => {
    const edge = sphereCoordinates(cubeNormal(4, 1, 0), "home"),
      up = cubeVisualUp(edge, "home");
    expect(up.x).toBeCloseTo(Math.SQRT1_2, 8);
    expect(up.z).toBeCloseTo(Math.SQRT1_2, 8);
    expect(up.y).toBe(0);
    expect(cubeVisualUp(edge, "home")).toEqual(up);
    const corner = cubeVisualUp(
      sphereCoordinates(cubeNormal(4, 1, 1), "home"),
      "home",
    );
    for (const n of Object.values(corner))
      expect(n).toBeCloseTo(1 / Math.sqrt(3), 8);
    const a = v(
        cubeVisualUp(
          sphereCoordinates(cubeNormal(4, 0.999, 0), "home"),
          "home",
        ),
      ),
      b = v(
        cubeVisualUp(sphereCoordinates(cubeNormal(0, -1, 0.0), "home"), "home"),
      );
    void b;
    expect(a.distanceTo(v(up))).toBeLessThan(0.001);
  });
  it("ascends gradually, falls with gravity and lands without overshoot or teleportation", () => {
    const follower = new SurfaceFollower(),
      up = new T.Vector3(0, 1, 0);
    follower.reset(new T.Vector3());
    follower.update(new T.Vector3(0, 0.45, 0), up, 1 / 60);
    expect(follower.position.y).toBeGreaterThan(0);
    expect(follower.position.y).toBeLessThan(0.45);
    for (let i = 0; i < 20; i++)
      follower.update(new T.Vector3(0, 0.45, 0), up, 1 / 60);
    expect(follower.position.y).toBeCloseTo(0.45);
    follower.update(new T.Vector3(0, -3, 0), up, 1 / 60);
    expect(follower.position.y).toBeGreaterThan(0.4);
    let previous = follower.position.y;
    for (let i = 0; i < 120; i++) {
      follower.update(new T.Vector3(0, -3, 0), up, 1 / 60);
      expect(follower.position.y).toBeLessThanOrEqual(previous + 0.00001);
      expect(follower.position.y).toBeGreaterThanOrEqual(-3);
      previous = follower.position.y;
    }
    expect(previous).toBeCloseTo(-3);
  });
  it("renders intermediate positions between coarse bot snapshots", () => {
    const actor = new ActorFollower();
    actor.update(new T.Vector3(), 1 / 60);
    const first = actor.update(new T.Vector3(3, 0, 0), 1 / 60).x;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.3);
    for (let i = 0; i < 90; i++) actor.update(new T.Vector3(3, 0, 0), 1 / 60);
    expect(actor.position.x).toBeGreaterThan(2.98);
  });
});
describe("automatic foundations and detailed colony buildings", () => {
  it("levels uneven ground, fills pits and permanently clears resource trees below the footprint", () => {
    let s = newGame(0);
    const n = nodes("home")[0],
      point = { x: Math.round(n.x), z: Math.round(n.z) };
    expect(canBuild(s, point.x, point.z, "house", 0)).toBe(true);
    s.position = { ...point };
    const footprint = foundationCells(point, "home", BUILDINGS.house.size + 1),
      first = footprint[0];
    s.worlds.home.terrain[first.key] = {
      height: -1.35,
      material: "stone",
      removed: [1, 2, 3],
    };
    s = applyAction(
      s,
      { type: "build", kind: "house", ...point, rotation: 0 },
      1000,
    );
    const heights = footprint.map((c) => s.worlds.home.terrain[c.key].height);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThanOrEqual(0);
    expect(footprint.every((c) => s.worlds.home.cleared.includes(c.key))).toBe(
      true,
    );
    expect(parseSave(JSON.stringify(s)).worlds.home.terrain).toEqual(
      s.worlds.home.terrain,
    );
    expect(canBuild(s, point.x, point.z, "house", 0)).toBe(false);
  });
  it("actually removes vegetation instances at cleared anchors", () => {
    const kit = new Models(),
      all = new SphereNature(kit, "home"),
      cells: string[] = [];
    // Clearing all cells proves that roots are filtered before batching, rather than merely hidden by terrain.
    for (let face = 0; face < 6; face++)
      for (let i = 0; i < 38; i++)
        for (let j = 0; j < 38; j++) cells.push(`${face}:${i}:${j}`);
    const cleared = new SphereNature(kit, "home", cells);
    let before = 0,
      after = 0;
    all.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) before += o.count;
    });
    cleared.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) after += o.count;
    });
    expect(after).toBeLessThan(before / 10);
    all.dispose();
    cleared.dispose();
    kit.dispose();
  });
  it("uses many architectural parts, windows and roof equipment for every building type", () => {
    const kit = new Models();
    for (const kind of [
      "house",
      "headquarters",
      "greenhouse",
      "warehouse",
      "laboratory",
      "extractor",
      "bioextractor",
    ] as BuildingKind[]) {
      const model = kit.building(kind, "home");
      let parts = 0;
      model.traverse((o) => {
        if (o instanceof T.InstancedMesh) parts += o.count;
        else if (o instanceof T.Mesh) parts++;
      });
      expect(parts, kind).toBeGreaterThan(25);
      expect(model.userData.architecture).toBe("limestone-colony");
    }
    kit.dispose();
  });
});
describe("persistent programs, hands and existing save compatibility", () => {
  it("keeps even an empty program after save parsing and another simulation tick", () => {
    let s = applyAction(
        newGame(0),
        { type: "deploy", kind: "collector" },
        1000,
      ),
      id = s.automation.devices[0].id;
    s = applyAction(
      s,
      { type: "program", id, program: { entry: "", nodes: [] } },
      1100,
    );
    s = parseSave(JSON.stringify(s));
    s = applyAction(s, { type: "combatTick" }, 2000);
    expect(s.automation.devices[0].program.nodes).toEqual([]);
    expect(s.automation.devices[0].status).toBe("Программа пуста");
    expect(programSchema.safeParse({ entry: "bad", nodes: [] }).success).toBe(
      false,
    );
  });
  it("selects only owned weapons and really changes the weapon used in combat", () => {
    let s = newGame(0);
    expect(() =>
      applyAction(s, { type: "hand", item: "blaster" }, 1000),
    ).toThrow();
    s = applyAction(s, { type: "craft", recipe: "gear:sword", count: 1 }, 1000);
    s = applyAction(s, { type: "hand", item: "sword" }, 1000);
    expect(s.equipment.weapon).toBe("sword");
    expect(s.hand).toBe("sword");
    s = applyAction(s, { type: "hand", item: "pickaxe" }, 1000);
    expect(s.equipment.weapon).toBeNull();
    expect(s.inventory["gear:sword"]).toBe(1);
  });
  it("adds new fields to v6 without resetting terrain, inventories, programs or revisions", () => {
    const old: any = newGame(1000);
    old.revision = 17;
    old.inventory.wood = 123;
    delete old.hand;
    delete old.progression;
    delete old.grapple;
    delete old.cycleEpoch;
    delete old.inventory["tool:grapple"];
    for (const world of Object.values(old.worlds) as any[]) {
      delete world.cleared;
      delete world.clearedNodes;
    }
    const next = parseSave(JSON.stringify(old));
    expect(next.revision).toBe(17);
    expect(next.inventory.wood).toBe(123);
    expect(next.inventory["tool:grapple"]).toBe(1);
    expect(next.progression.xp).toBe(0);
    expect(next.worlds.home.cleared).toEqual([]);
  });
});
describe("day-night cycle, progression and real grapple transfer", () => {
  it("has repeatable daylight, twilight and night using the saved epoch", () => {
    expect(dayCycle(1000, 1000).daylight).toBe(1);
    expect(dayCycle(1000, 1000 + DAY_DURATION / 2).daylight).toBe(0);
    expect(dayCycle(1000, 1000 + DAY_DURATION).clock).toBe(
      dayCycle(1000, 1000).clock,
    );
  });
  it("awards harvest experience once, levels up and spends points on a working yield bonus", () => {
    let s = newGame(0),
      bed = beds("home")[0];
    s.position = { ...bed };
    s = applyAction(s, { type: "plant", ...bed, plant: "sunflower" }, 1000);
    s = applyAction(s, { type: "harvest", ...bed }, 17000);
    expect(s.progression.xp).toBe(12);
    expect(() => applyAction(s, { type: "harvest", ...bed }, 18000)).toThrow();
    s.progression.xp = 100;
    expect(experienceLevel(100)).toBe(2);
    expect(skillPoints(s.progression)).toBe(1);
    s = applyAction(s, { type: "spendSkill", skill: "mining" }, 18000);
    expect(skillPoints(s.progression)).toBe(0);
    expect(() =>
      applyAction(s, { type: "spendSkill", skill: "combat" }, 18000),
    ).toThrow();
    const n = nodes("home")[0];
    s.position = { x: n.x, z: n.z };
    const before = s.inventory[n.resource];
    s = applyAction(s, { type: "mine", id: n.id }, 19000);
    expect(s.inventory[n.resource]).toBe(before + 4);
    expect(parseSave(JSON.stringify(s)).progression.skills.mining).toBe(1);
  });
  it("holds the origin until arrival, persists the rope trip, blocks early actions and arrives using server time", () => {
    let s = newGame(1000);
    const inventory = { ...s.inventory };
    s = applyAction(s, { type: "grappleStart", planet: "listoria" }, 2000);
    const g = s.grapple!;
    expect(s.planet).toBe("home");
    expect(g.route.length).toBeGreaterThan(2);
    expect(() => applyAction(s, { type: "move", x: 1, z: 1 }, 2100)).toThrow(
      /трос/,
    );
    const a = grapplePosition(g, g.startedAt),
      b = grapplePosition(g, g.endsAt);
    expect(a.progress).toBe(0);
    expect(b.progress).toBe(1);
    expect(v(a.position).distanceTo(v(b.position))).toBeGreaterThan(100);
    s = parseSave(JSON.stringify(s));
    s = applyAction(s, { type: "grappleTick" }, g.endsAt - 1);
    expect(s.planet).toBe("home");
    s = applyAction(s, { type: "grappleTick" }, g.endsAt);
    expect(s.planet).toBe("listoria");
    expect(s.grapple).toBeNull();
    expect(s.inventory).toEqual(inventory);
    expect(s.progression.xp).toBe(15);
  });
  it("cancels safely and rejects undiscovered destinations", () => {
    let s = newGame(0),
      start = { ...s.position };
    expect(() =>
      applyAction(s, { type: "grappleStart", planet: "wild-1" }, 1000),
    ).toThrow();
    s = applyAction(s, { type: "grappleStart", planet: "listoria" }, 1000);
    s = applyAction(s, { type: "grappleCancel" }, 1100);
    expect(s.position).toEqual(start);
    expect(s.planet).toBe("home");
    expect(s.grapple).toBeNull();
  });
});
