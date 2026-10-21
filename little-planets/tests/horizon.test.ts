import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  applyAction,
  newGame,
  parseSave,
  ActionSchema,
  WORLD_GENERATION,
} from "../shared/model";
import {
  SHIP_STATS,
  shipConfiguration,
  starterShip,
  type Starship,
} from "../shared/ships";
import { Models } from "../src/world/Models";
import { SphereNature } from "../src/world/SphereNature";
import { Occlusion } from "../src/world/Occlusion";
const design = {
  name: "Atlas",
  class: "cargo",
  model: 3,
  hull: "freighter",
  wings: "delta",
  color: "graphite",
  engine: "fusion",
  module: "hold",
  finish: "titanium",
} as const;
describe("Horizon shipworks and living voxels", () => {
  it("gives cargo and survey modules visible hardware even on ships of their matching class", () => {
    const kit = new Models();
    const count = (s: Starship) => {
      const root = kit.ship(s);
      let n = 0;
      root.traverse((o) => {
        if (o instanceof T.InstancedMesh) {
          n += o.count;
          o.dispose();
        }
      });
      return n;
    };
    try {
      const cargo: Starship = { ...design, id: "cargo", module: "standard" };
      const explorer: Starship = { ...starterShip(), module: "standard" };
      expect(count({ ...cargo, module: "hold" })).toBeGreaterThan(count(cargo));
      expect(count({ ...explorer, module: "survey" })).toBeGreaterThan(
        count(explorer),
      );
    } finally {
      kit.dispose();
    }
  });
  it("releases the occlusion material when a replaced vegetation material is disposed", () => {
    const original = new T.MeshStandardMaterial(),
      geometry = new T.BoxGeometry();
    const mesh = new T.Mesh(geometry, original),
      root = new T.Group();
    root.add(mesh);
    const occlusion = new Occlusion();
    let freed = false;
    try {
      occlusion.patch(root);
      expect(mesh.material).not.toBe(original);
      mesh.material.addEventListener("dispose", () => {
        freed = true;
      });
      original.dispose();
      expect(freed).toBe(true);
    } finally {
      occlusion.dispose();
      geometry.dispose();
      original.dispose();
    }
  });
  it("resets generation 2 once to arrival and preserves the new run", () => {
    const old = { ...newGame(1000, true), generation: 2 };
    old.progression.xp = 1234;
    old.inventory.wood = 9876;
    const reset = parseSave(JSON.stringify(old));
    expect(reset.generation).toBe(3);
    expect(reset.prologue.phase).toBe("arrival");
    expect(reset.progression.xp).toBe(0);
    expect(reset.inventory.wood).toBe(90);
    expect(reset.worlds.home.buildings).toHaveLength(1);
    reset.progression.xp = 55;
    expect(parseSave(JSON.stringify(reset))).toEqual(reset);
  });
  it("preserves current-generation progress and applies defaults to legacy ship designs", () => {
    const old = newGame(1000, true);
    old.progression.xp = 1234;
    const save = parseSave(JSON.stringify(old));
    expect(save.generation).toBe(WORLD_GENERATION);
    expect(save.prologue.phase).toBe("complete");
    expect(save.progression.xp).toBe(1234);
    expect(shipConfiguration(save.fleet[0])).toMatchObject({
      engine: "ion",
      module: "standard",
      finish: "ceramic",
    });
    expect(SHIP_STATS(starterShip())).toMatchObject({
      speed: 44,
      cargo: 30,
      armor: 60,
    });
  });
  it("saves manufactured engine/module/material choices, keeps test building free and uses actual engine stats in flight", () => {
    let s = newGame(1000, true);
    s.worlds.home.buildings.push({
      id: "yard",
      kind: "shipyard",
      x: 2,
      z: 3,
      rotation: 0,
    });
    const before = { ...s.inventory };
    s = applyAction(s, { type: "createShip", ship: design }, 1100);
    const created = s.fleet.at(-1)!;
    expect(s.inventory.iron).toBe(before.iron);
    expect(s.inventory[`ship:${created.id}`]).toBe(1);
    s = parseSave(JSON.stringify(s));
    expect(s.fleet.at(-1)).toMatchObject(design);
    s.position = { x: 8, z: 7 };
    s = applyAction(
      s,
      { type: "placeShip", id: created.id, ...s.position },
      1200,
    );
    s = applyAction(s, { type: "boardShip" }, 1300);
    expect(s.flight!.topSpeed).toBe(SHIP_STATS(created).speed);
    expect(s.flight!.topSpeed).toBeGreaterThan(
      SHIP_STATS({ ...created, engine: "ion" }).speed,
    );
    expect(
      ActionSchema.safeParse({
        type: "createShip",
        ship: { ...design, engine: "unbounded-engine" },
      }).success,
    ).toBe(false);
  });
  it("uses one detailed PBR configuration in ship and cockpit, with separate engineering LOD", () => {
    const kit = new Models();
    const d: Starship = { ...design, id: "atlas" },
      ship = kit.ship(d),
      cabin = kit.cockpit(d);
    try {
      expect(ship.userData.design).toEqual(cabin.userData.design);
      expect(ship.userData.design).toMatchObject(d);
      expect(ship.getObjectByName("engine")).toBeDefined();
      expect(ship.getObjectByName("module")).toBeDefined();
      const materials = new Set<T.MeshStandardMaterial>();
      let instances = 0,
        lod = 0;
      ship.traverse((o) => {
        if (o instanceof T.Mesh)
          materials.add(o.material as T.MeshStandardMaterial);
        if (o instanceof T.InstancedMesh) instances += o.count;
        if (o instanceof T.LOD) lod++;
      });
      expect(instances).toBeGreaterThan(100);
      expect(lod).toBe(1);
      expect([...materials].some((m) => m.metalness > 0.8 && m.normalMap)).toBe(
        true,
      );
      expect(
        [...materials].some((m) => m.transparent && m.roughness < 0.1),
      ).toBe(true);
    } finally {
      ship.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      cabin.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      kit.dispose();
    }
  });
  it("keeps instanced vegetation anchors fixed while composing wind with player occlusion shaders", () => {
    const kit = new Models(),
      nature = new SphereNature(kit, "home"),
      occlusion = new Occlusion();
    try {
      expect(nature.stats.trees).toBe(64);
      const mesh = nature.wind.batches[0],
        matrices = Array.from(mesh.instanceMatrix.array);
      nature.wind.update(12, "high");
      nature.wind.update(14, "balanced");
      expect(Array.from(mesh.instanceMatrix.array)).toEqual(matrices);
      expect(nature.wind.stats.time).toBe(14);
      expect(mesh.geometry.getAttribute("windAnchor").count).toBe(mesh.count);
      occlusion.patch(nature.root);
      const shader = {
        uniforms: {},
        vertexShader: "#include <begin_vertex>\n#include <project_vertex>",
        fragmentShader: "#include <alphatest_fragment>",
      };
      (mesh.material as T.Material).onBeforeCompile(
        shader as unknown as T.WebGLProgramParametersWithUniforms,
        {} as T.WebGLRenderer,
      );
      expect(shader.vertexShader).toContain("vegetationTime");
      expect(shader.vertexShader).toContain("occlusionWorld");
      expect(shader.uniforms).toHaveProperty("vegetationTime");
      expect(shader.uniforms).toHaveProperty("occlusionPlayer");
      nature.wind.update(15, "economy");
      expect(nature.wind.stats.strength).toBe(0);
    } finally {
      occlusion.dispose();
      nature.dispose();
      kit.dispose();
    }
  });
});
