import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  newGame,
  parseSave,
  applyAction,
  WORLD_GENERATION,
} from "../shared/model";
import { Store, Conflict } from "../server/store";
import {
  cubeNormal,
  naturalVoxelLevel,
  voxelResolution,
} from "../shared/voxel";
import { Models } from "../src/world/Models";
import { SphereNature } from "../src/world/SphereNature";

function retiredSave() {
  const s: any = newGame(1000, true);
  delete s.generation;
  s.inventory.wood = 9876;
  s.revision = 42;
  s.progression.xp = 5400;
  s.worlds.home.buildings.push({
    id: "old-scanner",
    kind: "scanner",
    x: 8,
    z: 7,
    rotation: 0,
  });
  s.worlds.home.terrain = { "0:5:5": { height: 12.6, material: "wood" } };
  s.worlds.home.gardens = [{ x: 5, z: 6 }];
  s.worlds.home.fences = [{ x: 6, z: 6, kind: "wood", rotation: 0 }];
  s.worlds.home.stock = { iron: 900 };
  s.automation.devices = [{ id: "old-machine" }];
  return s;
}
describe("New Dawn one-time reset and gentler home", () => {
  it("replaces every old test-world system with the playable arrival and starter objects", () => {
    const s = parseSave(JSON.stringify(retiredSave()));
    expect(s.generation).toBe(WORLD_GENERATION);
    expect(s.prologue.phase).toBe("arrival");
    expect(s.revision).toBe(0);
    expect(s.inventory.wood).toBe(90);
    expect(s.progression.xp).toBe(0);
    expect(s.worlds.home.buildings.map((b) => b.kind)).toEqual([
      "headquarters",
    ]);
    expect(s.worlds.home.terrain["0:5:5"]).toBeUndefined();
    expect(s.worlds.home.gardens).toEqual([]);
    expect(s.worlds.home.fences).toEqual([]);
    expect(s.worlds.home.stock).toEqual({});
    expect(s.automation.devices).toEqual([]);
    expect(s.fleet).toHaveLength(1);
    expect(s.activeShip).toBe("starter");
    expect(s.discovered).toEqual(["home"]);
    expect(s.flight).toBeNull();
    expect(s.grapple).toBeNull();
  });
  it("retains new progress after reload and rejects unknown future generations", () => {
    let s = parseSave(JSON.stringify(retiredSave()));
    s = applyAction(s, { type: "story", step: "begin" });
    s = applyAction(s, { type: "move", x: 8, z: 13 });
    s = applyAction(s, { type: "story", step: "plant", index: 0 });
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    expect(s.prologue.plants).toEqual([0]);
    expect(() =>
      parseSave(JSON.stringify({ ...s, generation: WORLD_GENERATION + 1 })),
    ).toThrow();
  });
  it("persists the reset in SQLite for each player and never resets the next session again", () => {
    const dir = mkdtempSync(join(tmpdir(), "planets-dawn-")),
      file = join(dir, "worlds.sqlite");
    let store = new Store(file);
    store.close();
    const db = new DatabaseSync(file);
    for (const user of [101, 202])
      db.prepare("INSERT INTO saves VALUES(?,?)").run(
        String(user),
        JSON.stringify(retiredSave()),
      );
    db.close();
    try {
      store = new Store(file);
      let first = store.get(101);
      const other = store.get(202);
      expect(first.prologue.phase).toBe("arrival");
      expect(other.prologue.phase).toBe("arrival");
      expect(() =>
        store.action(101, 42, { type: "move", x: 8, z: 13 }),
      ).toThrow(Conflict);
      first = store.action(101, first.revision, {
        type: "story",
        step: "begin",
      });
      store.close();
      store = new Store(file);
      expect(store.get(101)).toEqual(first);
      expect(store.get(202)).toEqual(other);
      const verify = new DatabaseSync(file, { readOnly: true });
      expect(
        JSON.parse(
          (
            verify
              .prepare("SELECT state FROM saves WHERE user_id='101'")
              .get() as any
          ).state,
        ).generation,
      ).toBe(WORLD_GENERATION);
      verify.close();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("keeps all six home faces gentle with level shared edges and discrete non-flat terraces", () => {
    const n = voxelResolution("home"),
      heights: number[] = [];
    for (let f = 0; f < 6; f++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const h = naturalVoxelLevel(
            cubeNormal(f, -1 + ((i + 0.5) * 2) / n, -1 + ((j + 0.5) * 2) / n),
            "home",
          );
          heights.push(h);
          if (i === 0 || j === 0 || i === n - 1 || j === n - 1)
            expect(h).toBe(0);
        }
    expect(Math.max(...heights)).toBeLessThanOrEqual(1.35);
    expect(new Set(heights).size).toBeGreaterThan(2);
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length,
      sd = Math.sqrt(
        heights.reduce((a, b) => a + (b - mean) ** 2, 0) / heights.length,
      );
    expect(sd).toBeLessThan(0.4); // Previous 0.11 home measured 1.319 m.
  });
  it("renders half the previous 128 home trees and leaves fields and undergrowth dense", () => {
    const kit = new Models(),
      world = new SphereNature(kit, "home");
    expect(world.stats.treeCandidates).toBe(128);
    expect(world.stats.trees).toBe(64);
    expect(world.stats.bushes).toBeGreaterThan(250);
    expect(world.stats.stalks).toBeGreaterThan(650);
    world.dispose();
    kit.dispose();
  });
});
