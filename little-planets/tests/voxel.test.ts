import { describe, it, expect } from "vitest";
import * as T from "three";
import { INITIAL_PLANETS as CUBE_PLANETS, ship } from "../shared/catalog";
import {
  sphereRadius,
  sphereCoordinates,
  sphereNormal,
} from "../shared/sphere";
import {
  setTerrainEdits,
  voxelLevel,
  cubeNormal,
  terrainSurfaceHeight,
  surfaceHeight,
  sanctuaryPoint,
  offsetPoint,
  MAX_TERRAIN_HEIGHT,
  VOXEL_STEP,
} from "../shared/voxel";
import { tiledSphere } from "../src/world/TiledSphere";
import { padPoint, bodyCenter, sub, len } from "../shared/space";
import { Models } from "../src/world/Models";
import { SphereWorld, spherePoint, sphereUp } from "../src/world/SphereWorld";
import { newGame } from "../shared/model";
describe("shared three-dimensional voxel terrain", () => {
  it("has reproducible voxel terraces, a gentle home and rugged exploration worlds", () => {
    for (const id of CUBE_PLANETS) {
      setTerrainEdits(id, {});
      const levels = new Set<number>();
      for (let i = 0; i < 500; i++) {
        const n = cubeNormal(i % 6, Math.sin(i * 1.7), Math.cos(i * 2.3)),
          h = voxelLevel(n, id);
        levels.add(h);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(MAX_TERRAIN_HEIGHT);
        expect(h / VOXEL_STEP).toBeCloseTo(Math.round(h / VOXEL_STEP), 8);
        expect(voxelLevel(n, id)).toBe(h);
      }
      if (id === "home") {
        expect(levels.size).toBeGreaterThanOrEqual(3);
        expect(Math.max(...levels)).toBeLessThanOrEqual(1.35);
      } else expect(levels.size).toBeGreaterThan(7);
    }
  });
  it("samples the same planar tops that the rendered triangle mesh intersects, including every cube face", () => {
    for (const id of CUBE_PLANETS) {
      setTerrainEdits(id, {});
      const { geometry, walls, minHeight, maxHeight } = tiledSphere(id);
      expect(walls).toBeGreaterThan(200);
      expect(maxHeight - minHeight).toBeGreaterThan(1);
      const material = new T.MeshBasicMaterial(),
        mesh = new T.Mesh(geometry, material);
      mesh.updateMatrixWorld();
      for (let face = 0; face < 6; face++) {
        const normal = cubeNormal(face, 0.123, 0.275),
          n = new T.Vector3(normal.x, normal.y, normal.z),
          r = sphereRadius(id),
          feet = spherePoint(sphereCoordinates(normal, id), 0, id),
          raw = cubeNormal(face, 0, 0),
          raycaster = new T.Raycaster(
            feet
              .clone()
              .add(new T.Vector3(raw.x, raw.y, raw.z).multiplyScalar(20)),
            new T.Vector3(-raw.x, -raw.y, -raw.z),
          ),
          hit = raycaster.intersectObject(mesh)[0];
        expect(hit).toBeDefined();
        expect(hit.point.length()).toBeCloseTo(
          spherePoint(sphereCoordinates(normal, id), 0, id).length(),
          4,
        );
      }
      geometry.dispose();
      material.dispose();
    }
  });
  it("puts the ship and its flight approach over the exact surface of every landing clearing", () => {
    for (const id of CUBE_PLANETS) {
      setTerrainEdits(id, {});
      const local = spherePoint(ship(id), 0.14, id),
        global = sub(padPoint(id), bodyCenter(id));
      expect(
        len(sub(global, { x: local.x, y: local.y, z: local.z })),
      ).toBeLessThan(0.00001);
    }
  });
  it("supports a stone terrace with real discrete terrain heights", () => {
    for (const id of CUBE_PLANETS) {
      setTerrainEdits(id, {});
      const p = sanctuaryPoint(id);
      expect(surfaceHeight(p, id) - terrainSurfaceHeight(p, id)).toBeCloseTo(
        0,
        7,
      );
      const heights = Array.from({ length: 30 }, (_, i) =>
        surfaceHeight(offsetPoint(ship(id), -5, -i * 0.25, id), id),
      );
      if (id === "home")
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(
          0.45,
        );
      else
        expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(
          0.4,
        );
      expect(heights.every(Number.isFinite)).toBe(true);
    }
  });
  it("picks the raised surface from above, returns no coordinate for empty space and places resources on the ground", () => {
    const kit = new Models(),
      save = newGame(0);
    save.planet = "home";
    const view = new SphereWorld(kit, save, 0),
      p = offsetPoint(ship("home"), 8, 7, "home"),
      n = sphereNormal(p, "home"),
      direction = new T.Vector3(n.x, n.y, n.z),
      ray = new T.Ray(spherePoint(p, 20, "home"), sphereUp(p, "home").negate()),
      picked = view.pick(ray);
    expect(picked).not.toBeNull();
    expect(surfaceHeight(picked!, "home")).toBeCloseTo(
      surfaceHeight(p, "home"),
      3,
    );
    expect(
      view.pick(new T.Ray(new T.Vector3(0, 100, 0), new T.Vector3(0, 1, 0))),
    ).toBeNull();
    view.dispose();
    kit.dispose();
  });
});
