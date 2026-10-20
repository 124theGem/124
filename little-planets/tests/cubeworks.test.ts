import { describe, it, expect } from "vitest";
import * as T from "three";
import { newGame, applyAction, parseSave, type Save } from "../shared/model";
import {
  PLANETS,
  INITIAL_PLANETS,
  planetSize,
  nodes,
  ship,
  type PlanetId,
} from "../shared/catalog";
import {
  cubeNormal,
  voxelCell,
  voxelLevel,
  cellKey,
  VOXEL_STEP,
  setTerrainEdits,
  surfaceRadius,
} from "../shared/voxel";
import {
  cubeUp,
  sphereCoordinates,
  sphereNormal,
  sphereStep,
  sphereRadius,
  surfaceDistance,
} from "../shared/sphere";
import { tiledSphere } from "../src/world/TiledSphere";
import {
  defaultProgram,
  programSchema,
  cargoAmount,
  type ProgramNode,
} from "../shared/automation";
import { SphereWorld, spherePoint, sphereUp } from "../src/world/SphereWorld";
import { Models } from "../src/world/Models";
import { bodyCenter, padPoint, sub, len } from "../shared/space";
const tick = (s: Save, t: number) => applyAction(s, { type: "combatTick" }, t);
function deploy(s: Save, kind: string, t = 1000) {
  return applyAction(s, { type: "deploy", kind }, t);
}
function put(s: Save, p: PlanetId) {
  s.planet = p;
  s.position = { ...ship(p) };
  return s;
}
describe("six cube faces, shared rendering and physical surface", () => {
  it("removes the eight round worlds, keeps a home with 38 cells along every face", () => {
    expect(planetSize("home")).toBe(38);
    expect(INITIAL_PLANETS).toEqual([
      "home",
      "listoria",
      "mycelia",
      "pyros",
      "ferra",
      "nox",
    ]);
    for (const p of [
      "orbis",
      "verdia",
      "cryonia",
      "duna",
      "vulcanis",
      "aquaria",
      "mycelion",
      "granit",
    ])
      expect(Object.hasOwn(PLANETS, p)).toBe(false);
  });
  it("renders six planar cube faces with correct winding and ray hits matching feet on every side", () => {
    const id = "home",
      s = newGame(0);
    setTerrainEdits(id, s.worlds.home.terrain);
    const { geometry, tiles } = tiledSphere(id);
    expect(tiles).toBe(6 * 38 * 38);
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial());
    mesh.updateMatrixWorld();
    for (let f = 0; f < 6; f++) {
      const raw = cubeNormal(f, 0.13, 0.27),
        point = sphereCoordinates(raw, id),
        up = sphereUp(point, id),
        world = spherePoint(point, 0, id);
      expect(
        [Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)].filter((n) => n === 1),
      ).toHaveLength(1);
      const ray = new T.Raycaster(
        world.clone().addScaledVector(up, 15),
        up.clone().negate(),
      );
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(hit.point.distanceTo(world)).toBeLessThan(0.001);
    }
    const positions = geometry.getAttribute("position"),
      normals = geometry.getAttribute("normal"),
      index = geometry.index!;
    for (let i = 0; i < index.count; i += 6) {
      const a = new T.Vector3().fromBufferAttribute(positions, index.getX(i)),
        b = new T.Vector3().fromBufferAttribute(positions, index.getX(i + 1)),
        c = new T.Vector3().fromBufferAttribute(positions, index.getX(i + 2));
      expect(
        b
          .sub(a)
          .cross(c.sub(a))
          .dot(new T.Vector3().fromBufferAttribute(normals, index.getX(i))),
      ).toBeGreaterThan(0);
    }
    geometry.dispose();
    (mesh.material as T.Material).dispose();
  });
  it("crosses each of 24 directed edges continuously, turns gravity by 90°, and returns by reversing", () => {
    for (let f = 0; f < 6; f++)
      for (const [u, v] of [
        [0.9999, 0.2],
        [-0.9999, 0.2],
        [0.2, 0.9999],
        [0.2, -0.9999],
      ]) {
        const r = sphereRadius("home"),
          n = cubeNormal(f, u, v),
          p = sphereCoordinates(n, "home"),
          up = cubeUp(n),
          base = cubeNormal(f, 0, 0),
          edge = cubeNormal(
            f,
            u === 0.2 ? 0 : Math.sign(u),
            v === 0.2 ? 0 : Math.sign(v),
          );
        const dir = {
          x: edge.x - base.x,
          y: edge.y - base.y,
          z: edge.z - base.z,
        };
        const q = sphereStep(p, dir, 0.1, "home"),
          next = cubeUp(sphereNormal(q, "home"));
        expect(up.x * next.x + up.y * next.y + up.z * next.z).toBe(0);
        const cubePoint = (p: { x: number; z: number }) => {
          const n = sphereNormal(p, "home"),
            scale = r / Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
          return new T.Vector3(n.x * scale, n.y * scale, n.z * scale);
        };
        expect(cubePoint(p).distanceTo(cubePoint(q))).toBeLessThan(0.11);
        expect(
          spherePoint(p, 0, "home").distanceTo(spherePoint(q, 0, "home")),
        ).toBeLessThan(0.11);
        const back = sphereStep(q, up, 0.1, "home");
        expect(cubePoint(back).distanceTo(cubePoint(p))).toBeLessThan(0.001);
      }
  });
  it("places the ship and surface picking at identical coordinates used by flight", () => {
    const s = newGame(0),
      kit = new Models(),
      v = new SphereWorld(kit, s, 0),
      p = ship("home");
    const local = spherePoint(p, 0.14, "home"),
      global = sub(padPoint("home"), bodyCenter("home"));
    expect(len(sub(global, local))).toBeLessThan(0.00001);
    const up = sphereUp(p, "home"),
      ray = new T.Ray(spherePoint(p, 15, "home"), up.clone().negate());
    const picked = v.pick(ray);
    expect(picked).not.toBeNull();
    expect(surfaceDistance(p, picked!, "home")).toBeLessThan(0.01);
    v.dispose();
    kit.dispose();
  });
});
describe("authoritative destructible blocks, construction and save reset", () => {
  it("starts with a pickaxe, removes geometry, awards one material, builds and restores persistent material layers", () => {
    let s = newGame(0);
    expect(s.inventory["tool:pickaxe"]).toBe(1);
    const p = { ...s.position },
      n = sphereNormal(p, "home"),
      c = voxelCell(n, "home"),
      k = cellKey(n, "home"),
      h = voxelLevel(c.normal, "home", {}),
      stone = s.inventory.stone,
      wood = s.inventory.wood;
    s = applyAction(s, { type: "terrain", mode: "dig", ...p }, 1000);
    expect(s.worlds.home.terrain[k].height).toBeCloseTo(h - VOXEL_STEP);
    expect(s.inventory.stone).toBe(stone + 1);
    s = applyAction(
      s,
      { type: "terrain", mode: "place", material: "wood", ...p },
      1300,
    );
    s = applyAction(
      s,
      { type: "terrain", mode: "place", material: "obsidian", ...p },
      1600,
    );
    expect(s.inventory.wood).toBe(wood - 1);
    s = parseSave(JSON.stringify(s));
    s = applyAction(s, { type: "terrain", mode: "dig", ...p }, 1900);
    expect(s.inventory.obsidian).toBe(12);
    s = applyAction(s, { type: "terrain", mode: "dig", ...p }, 2200);
    expect(s.inventory.wood).toBe(wood);
    expect(s.worlds.home.terrain[k].height).toBeCloseTo(h - VOXEL_STEP);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
  it("destroys an individual buried block without removing its roof and saves a real cavity", () => {
    let s = newGame(0);
    const p = s.position,
      n = sphereNormal(p, "home"),
      c = voxelCell(n, "home"),
      top = Math.round(voxelLevel(c.normal, "home", {}) / VOXEL_STEP),
      k = cellKey(n, "home");
    s = applyAction(
      s,
      { type: "terrain", mode: "dig", ...p, level: top - 1 },
      1000,
    );
    expect(s.worlds.home.terrain[k].height).toBeCloseTo(top * VOXEL_STEP);
    expect(s.worlds.home.terrain[k].removed).toContain(top - 1);
    setTerrainEdits("home", s.worlds.home.terrain);
    const tile = tiledSphere("home");
    const kinds = tile.geometry.getAttribute("blockLevel"),
      normals = tile.geometry.getAttribute("normal"),
      up = sphereUp(p, "home");
    let roof = false;
    for (let i = 0; i < kinds.count; i++)
      if (
        kinds.getX(i) === top &&
        new T.Vector3().fromBufferAttribute(normals, i).dot(up) < -0.9
      ) {
        roof = true;
        break;
      }
    expect(roof).toBe(true);
    tile.geometry.dispose();
    expect(
      parseSave(JSON.stringify(s)).worlds.home.terrain[k].removed,
    ).toContain(top - 1);
  });
  it("rejects distant edits, missing materials/tools, spam and digging through bedrock without mutating input", () => {
    let s = newGame(0);
    const p = { ...s.position };
    expect(() =>
      applyAction(s, { type: "terrain", mode: "dig", x: 0, z: 0 }, 1000),
    ).toThrow(/поближе/);
    const clone = structuredClone(s);
    s.inventory.wood = 0;
    expect(() =>
      applyAction(
        s,
        { type: "terrain", mode: "place", material: "wood", ...p },
        1000,
      ),
    ).toThrow(/материала/);
    s = clone;
    s = applyAction(s, { type: "terrain", mode: "dig", ...p }, 1000);
    expect(() =>
      applyAction(s, { type: "terrain", mode: "dig", ...p }, 1100),
    ).toThrow(/взмаха/);
    for (let t = 1300; t < 20000; t += 300) {
      try {
        s = applyAction(s, { type: "terrain", mode: "dig", ...p }, t);
      } catch (e) {
        expect((e as Error).message).toMatch(/ядро/);
        break;
      }
    }
    const c = voxelCell(sphereNormal(p, "home"), "home");
    expect(voxelLevel(c.normal, "home", s.worlds.home.terrain)).toBeCloseTo(
      -1.8,
    );
    expect(clone.worlds.home.terrain).toEqual({});
  });
  it("starts fresh for versions 1–5, validates current saved graphs, and rejects malformed edits", () => {
    for (const version of [1, 2, 3, 4, 5])
      expect(parseSave(JSON.stringify({ version })).version).toBe(6);
    const s = newGame(0);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    (s.worlds.home.terrain as any).bad = { height: 999, material: "stone" };
    expect(() => parseSave(JSON.stringify(s))).toThrow();
    expect(
      programSchema.safeParse({
        entry: "missing",
        nodes: defaultProgram("collector", "home").nodes,
      }).success,
    ).toBe(false);
  });
});
describe("programs control real actors and conserved resources", () => {
  it("runs a collector graph: mine chosen wood, test 80%, walk to warehouse, unload and resume", () => {
    let s = newGame(0);
    const resource = nodes("home").find((n) => n.resource === "wood")!;
    s.position = { x: resource.x, z: resource.z };
    s = deploy(s, "warehouse");
    s = deploy(s, "collector");
    const robot = s.automation.devices.find((d) => d.kind === "collector")!,
      id = robot.id;
    robot.capacity = 30;
    const before = s.inventory.wood;
    let unloaded = false;
    for (let t = 1200; t < 240000; t += 200) {
      s = tick(s, t);
      if ((s.worlds.home.stock.wood ?? 0) >= 24) {
        unloaded = true;
        break;
      }
    }
    expect(unloaded).toBe(true);
    expect(s.worlds.home.stock.wood).toBe(24);
    expect(s.inventory.wood).toBe(before);
    expect(Object.keys(s.worlds.home.depleted).length).toBeGreaterThan(0);
    const d = s.automation.devices.find((d) => d.id === id)!;
    expect(cargoAmount(d)).toBe(0);
    expect(d.pc).toBe("mine");
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
  it("supports pause, graph branching and rejects dangling wires and undiscovered destinations", () => {
    let s = deploy(newGame(0), "collector"),
      d = s.automation.devices[0];
    s = applyAction(
      s,
      { type: "toggleDevice", id: d.id, enabled: false },
      1200,
    );
    const pos = { x: s.automation.devices[0].x, z: s.automation.devices[0].z };
    s = tick(s, 3000);
    expect({
      x: s.automation.devices[0].x,
      z: s.automation.devices[0].z,
    }).toEqual(pos);
    const p = defaultProgram("collector", "home");
    p.nodes[0].next = "bad";
    expect(() =>
      applyAction(s, { type: "program", id: d.id, program: p }, 4000),
    ).toThrow();
    p.nodes[0].next = "full";
    p.nodes[0].planet = "wild-1";
    expect(() =>
      applyAction(s, { type: "program", id: d.id, program: p }, 4000),
    ).toThrow(/Неизвестная/);
  });
  it("moves real cargo from A to B, refines 3 wood + 3 stone, ships composite to home and preserves in-flight saves", () => {
    let s = newGame(0);
    s.inventory.wood = 300;
    s.inventory.stone = 300;
    s.inventory.crystal = 100;
    for (const p of ["home", "listoria", "mycelia"] as const) {
      put(s, p);
      s = deploy(s, "warehouse");
    }
    put(s, "mycelia");
    s = deploy(s, "refinery");
    const factory = s.automation.devices.at(-1)!;
    s.inventory.iron = 20;
    s = deploy(s, "crawler");
    s = applyAction(
      s,
      {
        type: "logisticsRoute",
        id: s.automation.devices.at(-1)!.id,
        from: "mycelia",
        to: "mycelia",
        resource: "wood",
        refineryId: factory.id,
      },
      1000,
    );
    put(s, "listoria");
    s = deploy(s, "drone");
    const source = s.automation.devices.at(-1)!.id;
    // Deposit the actual initial raw materials into A's local warehouse.
    s = applyAction(
      s,
      { type: "stock", resource: "wood", amount: 3, direction: "deposit" },
      1000,
    );
    s = applyAction(
      s,
      { type: "stock", resource: "stone", amount: 3, direction: "deposit" },
      1000,
    );
    const node = (
      id: string,
      op: ProgramNode["op"],
      next: string,
      resource: ProgramNode["resource"],
      planet: PlanetId,
      x = 0,
    ): ProgramNode => ({
      id,
      op,
      next,
      otherwise: next,
      resource,
      planet,
      threshold: 10,
      x,
      y: 40,
    });
    const raw = {
      entry: "wood",
      nodes: [
        node("wood", "load", "stone", "wood", "listoria"),
        node("stone", "load", "fly", "stone", "listoria"),
        node("fly", "travel", "out", "wood", "mycelia"),
        node("out", "unload", "back", "wood", "mycelia"),
        node("back", "travel", "wood", "wood", "listoria"),
      ],
    };
    s = applyAction(s, { type: "program", id: source, program: raw }, 1000);
    put(s, "mycelia");
    s = deploy(s, "drone");
    const refined = s.automation.devices.at(-1)!.id;
    const route = {
      entry: "load",
      nodes: [
        node("load", "load", "fly", "composite", "mycelia"),
        node("fly", "travel", "out", "composite", "home"),
        node("out", "unload", "back", "composite", "home"),
        node("back", "travel", "load", "composite", "mycelia"),
      ],
    };
    s = applyAction(s, { type: "program", id: refined, program: route }, 1000);
    s.automation.devices.find((d) => d.id === refined)!.capacity = 1;
    let sawFlight = false,
      sawRefining = false;
    for (let t = 1200; t < 90000; t += 200) {
      s = tick(s, t);
      if (s.automation.devices.some((d) => d.transit)) {
        sawFlight = true;
        s = parseSave(JSON.stringify(s));
      }
      if (s.automation.devices.some((d) => d.job)) sawRefining = true;
      if ((s.worlds.home.stock.composite ?? 0) >= 1) break;
    }
    expect(sawFlight).toBe(true);
    expect(sawRefining).toBe(true);
    expect(s.worlds.home.stock.composite).toBe(1);
    expect(s.worlds.listoria.stock.wood).toBe(0);
    expect(s.worlds.listoria.stock.stone).toBe(0);
    expect(s.worlds.mycelia.stock.wood).toBe(0);
    expect(s.worlds.mycelia.stock.stone).toBe(0);
    expect(
      s.automation.devices.reduce((n, d) => n + (d.cargo.composite ?? 0), 0),
    ).toBe(0);
  });
  it("continues the second refining chain and does not duplicate output on repeated timestamps", () => {
    let s = deploy(newGame(0), "warehouse");
    s = deploy(s, "refinery");
    const d = s.automation.devices.at(-1)!;
    s.inventory.iron = 20;
    s = deploy(s, "crawler");
    s = applyAction(
      s,
      {
        type: "logisticsRoute",
        id: s.automation.devices.at(-1)!.id,
        from: "home",
        to: "home",
        resource: "wood",
        refineryId: d.id,
      },
      1000,
    );
    s.worlds.home.stock = { composite: 3, crystal: 2 };
    s = applyAction(
      s,
      { type: "refineryRecipe", id: d.id, recipe: "alloy" },
      1000,
    );
    for (let t = 1200; t < 13000; t += 200) s = tick(s, t);
    expect(s.worlds.home.stock.alloy).toBe(1);
    expect(s.worlds.home.stock.composite).toBe(0);
    const again = tick(s, 12800);
    expect(again.worlds.home.stock.alloy).toBe(1);
  });
  it("hunters find and destroy actual enemies; enemies respawn 30 seconds after a kill", () => {
    let s = newGame(0);
    put(s, "ferra");
    const e = s.worlds.ferra.enemies[0];
    s.position = { x: e.x, z: e.z };
    s = deploy(s, "hunter");
    const hunter = s.automation.devices[0];
    hunter.x = e.x;
    hunter.z = e.z;
    s.position = { ...ship("ferra") };
    let defeated = 0;
    for (let t = 1200; t < 30000; t += 200) {
      s = tick(s, t);
      if (s.worlds.ferra.enemies[0].hp === 0) {
        defeated = s.worlds.ferra.enemies[0].defeatedAt!;
        break;
      }
    }
    expect(defeated).toBeGreaterThan(0);
    expect(s.kills).toBeGreaterThan(0);
    s = applyAction(
      s,
      { type: "toggleDevice", id: hunter.id, enabled: false },
      defeated + 1000,
    );
    s = tick(s, defeated + 31000);
    expect(s.worlds.ferra.enemies[0].hp).toBe(s.worlds.ferra.enemies[0].maxHp);
  });
});
