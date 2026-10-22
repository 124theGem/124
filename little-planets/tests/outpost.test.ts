import { prepareFoundation } from "../shared/construction";
import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  newGame,
  parseSave,
  applyAction,
  ActionSchema,
  WORLD_GENERATION,
} from "../shared/model";
import { forestTrees, resourceNodes, cutTree } from "../shared/forestry";
import { sphereNormal } from "../shared/sphere";
import { voxelCell, offsetPoint, cellKey } from "../shared/voxel";
import { prologueActions } from "./fixtures";
import { Models } from "../src/world/Models";
import { SphereWorld, spherePoint, sphereUp } from "../src/world/SphereWorld";
import { shipRegistration } from "../shared/ships";
import { finishFlight } from "./fly";

describe("Outpost industry, conserved timber and compatible saves", () => {
  it("preserves the current generation, progress, buildings, legacy blocks and designs when removing retired tools", () => {
    const old: any = newGame(1000, true);
    old.inventory.wood = 234;
    old.progression.xp = 789;
    old.revision = 19;
    old.inventory["tool:pickaxe"] = 1;
    old.inventory["tool:grapple"] = 1;
    old.hand = "pickaxe";
    old.worlds.home.terrain["0:5:5"] = {
      height: 2.7,
      material: "wood",
      blocks: { "6": "wood" },
      removed: [2],
    };
    delete old.worlds.home.treeDamage;
    delete old.worlds.home.treeTimber;
    delete old.shipBlueprints;
    const save = parseSave(JSON.stringify(old));
    expect(save.generation).toBe(WORLD_GENERATION);
    expect(WORLD_GENERATION).toBe(3);
    expect(save.inventory.wood).toBe(234);
    expect(save.progression.xp).toBe(789);
    expect(save.revision).toBe(19);
    expect(save.worlds.home.terrain).toEqual(old.worlds.home.terrain);
    expect(save.fleet).toEqual(old.fleet);
    expect(save.inventory["tool:pickaxe"]).toBeUndefined();
    expect(save.inventory["tool:grapple"]).toBeUndefined();
    expect(save.hand).toBe("axe");
    expect(save.shipBlueprints).toEqual([]);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });
  it("completes the entire new-player repair quest with empty hands and no retired actions", () => {
    let s = newGame(1000, true, true);
    s.hand = "none";
    for (const action of prologueActions()) s = applyAction(s, action, 1000);
    expect(s.prologue.phase).toBe("complete");
    expect(s.inventory.iron).toBe(0);
    expect(s.inventory["engine:fiber"]).toBe(0);
    for (const action of [
      { type: "terrain", mode: "dig", x: 1, z: 1 },
      { type: "terrain", mode: "place", x: 1, z: 1 },
      { type: "grappleStart", planet: "listoria" },
      { type: "grappleTick" },
      { type: "grappleCancel" },
      { type: "hand", item: "pickaxe" },
      { type: "hand", item: "grapple" },
    ]) {
      expect(ActionSchema.safeParse(action).success).toBe(false);
      expect(() => applyAction(s, action, 2000)).toThrow();
    }
  });
  it("uses stable forest IDs and exposes all six faces to harvesting", () => {
    const trees = forestTrees("home");
    expect(trees).toHaveLength(64);
    expect(
      new Set(trees.map((t) => voxelCell(sphereNormal(t, "home"), "home").face))
        .size,
    ).toBe(6);
    expect(new Set(trees.map((t) => t.id)).size).toBe(trees.length);
    expect(resourceNodes("home").filter((n) => n.tree)).toEqual(trees);
    expect(new Set(trees.map((t) => t.hits)).size).toBeGreaterThan(2);
  });
  it("clears exact forest IDs with a building foundation so invisible trees cannot be harvested", () => {
    const s = newGame(1000, true),
      tree = forestTrees("home")[0],
      world = s.worlds.home;
    prepareFoundation(world, tree, "home", 3);
    expect(world.clearedNodes).toContain(tree.id);
    expect(cutTree(world, tree)).toBe(0);
    expect(s.inventory.wood).toBe(90);
  });
  it("requires multiple axe hits, pays the size-dependent yield once and permanently saves felling", () => {
    for (const tree of [
      forestTrees("home")[0],
      forestTrees("home").find((t) => t.hits === 6)!,
    ]) {
      let s = newGame(1000, true);
      s.position = { x: tree.x, z: tree.z };
      const before = s.inventory.wood;
      for (let hit = 0; hit < tree.hits!; hit++) {
        s = applyAction(s, { type: "mine", id: tree.id }, 2000 + hit * 400);
        if (hit < tree.hits! - 1) expect(s.inventory.wood).toBe(before);
        s = parseSave(JSON.stringify(s));
      }
      expect(s.inventory.wood).toBe(before + tree.timber!);
      expect(s.worlds.home.clearedNodes).toContain(tree.id);
      expect(() =>
        applyAction(s, { type: "mine", id: tree.id }, 1000000),
      ).toThrow();
      expect(
        s.worlds.home.clearedNodes.filter((id) => id === tree.id),
      ).toHaveLength(1);
    }
  });
  it("checks range, tool ownership and stroke cooldown without mutating state", () => {
    let s = newGame(1000, true);
    const t = forestTrees("home")[0];
    s.position = { x: t.x, z: t.z };
    s.hand = "none";
    expect(() => applyAction(s, { type: "mine", id: t.id }, 2000)).toThrow(
      "топор",
    );
    s.hand = "axe";
    s = applyAction(s, { type: "mine", id: t.id }, 2000);
    const copy = structuredClone(s);
    expect(() => applyAction(s, { type: "mine", id: t.id }, 2100)).toThrow(
      "взмаха",
    );
    expect(s).toEqual(copy);
    s.position = offsetPoint(t, 10, 0, "home");
    expect(() => applyAction(s, { type: "mine", id: t.id }, 3000)).toThrow();
  });
  it("conserves partially collected timber when two collectors and the player share the same tree", () => {
    const s = newGame(1000, true),
      world = s.worlds.home,
      tree = forestTrees("home").find((t) => t.timber === 15)!;
    world.treeDamage[tree.id] = tree.hits! - 1;
    const robotA = cutTree(world, tree, 4),
      robotB = cutTree(world, tree, 6);
    const reloaded = parseSave(JSON.stringify(s));
    const player = cutTree(reloaded.worlds.home, tree);
    expect(robotA + robotB + player).toBe(15);
    expect(cutTree(reloaded.worlds.home, tree)).toBe(0);
    expect(
      reloaded.worlds.home.clearedNodes.filter((id) => id === tree.id),
    ).toHaveLength(1);
  });
  it("actually programs collectors to fell large forest trees and preserve their finite cargo", () => {
    let s = newGame(0, true);
    const tree = forestTrees("home").find((t) => t.timber === 15)!;
    s.position = { x: tree.x, z: tree.z };
    s = applyAction(s, { type: "deploy", kind: "collector" }, 1000);
    const d = s.automation.devices[0];
    d.x = tree.x;
    d.z = tree.z;
    d.capacity = 30;
    d.program.nodes.forEach((n) => {
      n.resource = "wood";
      if (n.op === "mine") {
        n.next = n.id;
        n.otherwise = n.id;
        d.program.entry = n.id;
        d.pc = n.id;
      }
    });
    s.worlds.home.clearedNodes = resourceNodes("home")
      .filter((n) => n.resource === "wood" && n.id !== tree.id)
      .map((n) => n.id);
    for (let t = 1200; t < 15000; t += 200)
      s = applyAction(s, { type: "combatTick" }, t);
    expect(s.worlds.home.clearedNodes).toContain(tree.id);
    expect(s.automation.devices[0].cargo.wood).toBe(tree.timber);
    expect(s.inventory.wood).toBe(90);
    expect(parseSave(JSON.stringify(s)).automation.devices[0].cargo.wood).toBe(
      15,
    );
  });
  it("maps instanced crowns to the exact tree and removes its instances after felling", () => {
    const kit = new Models(),
      s = newGame(1000, true),
      tree = forestTrees("home")[0];
    const view = new SphereWorld(kit, s, 1000);
    try {
      view.root.updateMatrixWorld(true);
      const ray = new T.Ray(
        spherePoint(tree, 12, "home"),
        sphereUp(tree, "home").negate(),
      );
      expect(view.nature.wind.pick(ray)).toBe(tree.id);
      s.worlds.home.clearedNodes.push(tree.id);
      view.updateCrops(s, 1200);
      expect(view.nature.stats.trees).toBe(63);
      const ids = view.nature.wind.batches.flatMap((b) => b.userData.treeIds);
      expect(ids).not.toContain(tree.id);
      expect(view.nature.wind.pick(ray)).not.toBe(tree.id);
    } finally {
      view.dispose();
      kit.dispose();
    }
  });
  it("saves a livery blueprint and uses the exact design in inventory, placement and flight", () => {
    let s = newGame(1000, true);
    s.worlds.home.buildings.push({
      id: "yard",
      kind: "shipyard",
      x: 2,
      z: 3,
      rotation: 0,
    });
    const design = {
      name: "Атлас 07",
      class: "cargo",
      model: 3,
      hull: "freighter",
      wings: "delta",
      color: "ivory",
      engine: "fusion",
      module: "hold",
      finish: "titanium",
      livery: "helix",
    } as const;
    s = applyAction(s, { type: "saveShipDesign", ship: design }, 1500);
    s = parseSave(JSON.stringify(s));
    expect(s.shipBlueprints[0]).toMatchObject(design);
    s = applyAction(s, { type: "createShip", ship: design }, 2000);
    const created = s.fleet.at(-1)!;
    expect(created).toMatchObject(design);
    s.position = { x: 8, z: 7 };
    s = applyAction(
      s,
      { type: "placeShip", id: created.id, ...s.position },
      2500,
    );
    s = parseSave(JSON.stringify(s));
    s = applyAction(s, { type: "boardShip" }, 3000);
    expect(s.fleet.find((v) => v.id === s.activeShip)).toMatchObject(design);
    s = applyAction(s, { type: "course", planet: "listoria" }, 3500);
    s = finishFlight(s);
    expect(s.fleet.find((v) => v.id === s.activeShip)?.livery).toBe("helix");
    const preview = { ...created, id: "preview" };
    expect(shipRegistration(created)).toBe(shipRegistration(preview));
  });
});
