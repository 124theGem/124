import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  PLANETS,
  SPHERE_PLANETS,
  INITIAL_PLANETS,
  planetSize,
  ship,
  type PlanetId,
} from "../shared/catalog";
import { newGame, applyAction, parseSave, ActionSchema } from "../shared/model";
import {
  sphereRadius,
  sphereStep,
  sphereNormal,
  surfaceDistance,
} from "../shared/sphere";
import {
  bodyCenter,
  bodyRadius,
  beginFlight,
  landingInfo,
  stepFlight,
  sub,
  len,
  dot,
  flightRoute,
  redirectFlight,
  padPoint,
} from "../shared/space";
import { landmarks } from "../shared/surface";
import { tiledSphere } from "../src/world/TiledSphere";
import { SphereNature } from "../src/world/SphereNature";
import { Models } from "../src/world/Models";
import { autoInput, finishFlight } from "./fly";

describe("eight tiled spherical biomes", () => {
  it("provides eight distinct biomes, varied radii, useful landmarks and complete round trips", () => {
    expect(SPHERE_PLANETS).toHaveLength(8);
    expect(
      new Set(SPHERE_PLANETS.map((id) => PLANETS[id].sphereTheme)).size,
    ).toBe(8);
    expect(new Set(SPHERE_PLANETS.map(sphereRadius)).size).toBeGreaterThan(5);
    for (const id of SPHERE_PLANETS) {
      let p = ship(id),
        direction = { x: 0, y: 1, z: 0 };
      const start = sphereNormal(p, id),
        step = planetSize(id) / 240;
      for (let i = 0; i < 240; i++) {
        const n = sphereNormal(p, id),
          angle = step / sphereRadius(id);
        p = sphereStep(p, direction, step, id);
        direction = {
          x: direction.x * Math.cos(angle) - n.x * Math.sin(angle),
          y: direction.y * Math.cos(angle) - n.y * Math.sin(angle),
          z: direction.z * Math.cos(angle) - n.z * Math.sin(angle),
        };
      }
      expect(surfaceDistance(p, ship(id), id)).toBeLessThan(0.00001);
      expect(dot(start, sphereNormal(p, id))).toBeCloseTo(1, 9);
      const features = landmarks(id);
      expect(features.some((f) => f.kind === "cave")).toBe(true);
      expect(features.some((f) => f.kind === "cliff")).toBe(true);
      expect(
        features.every(
          (f) =>
            f.x >= 0 &&
            f.x < planetSize(id) &&
            f.z >= 0 &&
            f.z <= planetSize(id) / 2,
        ),
      ).toBe(true);
    }
  });
  it("builds planar voxel tops, shaded cliff walls and correctly wound triangles across poles", () => {
    for (const id of SPHERE_PLANETS) {
      const { geometry, tiles } = tiledSphere(id);
      expect(tiles).toBeGreaterThan(4000);
      const p = geometry.getAttribute("position"),
        c = geometry.getAttribute("color"),
        kinds = geometry.getAttribute("terrainFace"),
        normals = geometry.getAttribute("normal"),
        index = geometry.index!;
      for (let i = 0; i < p.count; i += 4) {
        for (let j = 1; j < (kinds.getX(i) === 0 ? 4 : 2); j++)
          assert.deepEqual(
            [c.getX(i + j), c.getY(i + j), c.getZ(i + j)],
            [c.getX(i), c.getY(i), c.getZ(i)],
          );
      }
      for (let i = 0; i < index.count; i += 6) {
        const a = new T.Vector3().fromBufferAttribute(p, index.getX(i)),
          b = new T.Vector3().fromBufferAttribute(p, index.getX(i + 1)),
          d = new T.Vector3().fromBufferAttribute(p, index.getX(i + 2));
        assert(
          new T.Vector3()
            .crossVectors(b.sub(a), d.sub(a))
            .dot(new T.Vector3().fromBufferAttribute(normals, index.getX(i))) >
            0,
        );
      }
      geometry.dispose();
    }
  });
  it("builds rye fields, bushes, caves, animated falls and smoking volcanoes without invalid matrices", () => {
    const kit = new Models();
    for (const id of SPHERE_PLANETS) {
      const n = new SphereNature(kit, id);
      expect(n.stats.bushes).toBeGreaterThan(250);
      expect(n.stats.caves).toBeGreaterThan(0);
      if (id === "orbis") {
        expect(n.stats.stalks).toBeGreaterThan(650);
        expect(n.stats.trees).toBeGreaterThan(80);
      }
      if (id === "vulcanis") expect(n.stats.volcanoes).toBeGreaterThan(2);
      else expect(n.stats.waterfalls).toBeGreaterThan(0);
      n.animate(1);
      n.animate(17);
      n.root.updateMatrixWorld(true);
      n.root.traverse((o) =>
        expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true),
      );
      n.dispose();
    }
    kit.dispose();
  });
});
describe("continuous spaceflight and server landing rules", () => {
  it("recovers when autopilot is enabled or a new course is chosen beside the opposite hemisphere", () => {
    for (const changeCourse of [false, true]) {
      let f = beginFlight("orbis", "home", INITIAL_PLANETS, 0);
      f.position = { x: 0, y: 0, z: -bodyRadius("orbis") - 1 };
      if (changeCourse) {
        f.autopilot = true;
        f = redirectFlight(f, "home", INITIAL_PLANETS);
      }
      for (let i = 0; i < 1800 && !landingInfo(f).allowed; i++)
        f = stepFlight(f, autoInput, 0.1, INITIAL_PLANETS);
      expect(landingInfo(f).allowed).toBe(true);
    }
  });
  it("flies every initial and discovered world pair, avoiding solid bodies and slowing at the target", () => {
    const known = Object.keys(PLANETS) as PlanetId[];
    for (const origin of known)
      for (const target of known) {
        if (origin === target) continue;
        let f = beginFlight(origin, target, known, 0);
        for (let i = 0; i < 1800 && !landingInfo(f).allowed; i++) {
          f = stepFlight(f, autoInput, 0.1, known);
          for (const id of known)
            assert(
              len(sub(f.position, bodyCenter(id))) >= bodyRadius(id) + 0.79999,
            );
        }
        expect(landingInfo(f).allowed, `${origin} → ${target}`).toBe(true);
        expect(f.distance).toBeGreaterThan(50);
      }
  }, 45000);
  it("keeps origin until physical arrival, persists flight and preserves resources through landing", () => {
    let s = newGame(0);
    s.position = { x: 21, z: 23 };
    const inventory = structuredClone(s.inventory);
    s = applyAction(s, { type: "travel", planet: "aquaria" }, 1000);
    expect(s.planet).toBe("home");
    expect(s.flight?.target).toBe("aquaria");
    expect(s.flight?.autopilot).toBe(false);
    expect(() => applyAction(s, { type: "land" }, 1000)).toThrow(/маяку/);
    expect(() => applyAction(s, { type: "move", x: 22, z: 23 }, 1000)).toThrow(
      /полёт/,
    );
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    s = finishFlight(s);
    expect(s.planet).toBe("aquaria");
    expect(s.flight).toBeNull();
    expect(s.inventory).toEqual(inventory);
    expect(
      surfaceDistance(s.position, ship("aquaria"), "aquaria"),
    ).toBeLessThan(3);
  });
  it("accepts manual thrust, yaw, pitch and braking while maintaining a stable orthogonal frame", () => {
    let f = beginFlight("home", "orbis", INITIAL_PLANETS, 0),
      manual = { ...autoInput, autopilot: false, throttle: 1 };
    const first = { ...f.position };
    for (let i = 0; i < 30; i++)
      f = stepFlight(
        f,
        { ...manual, turn: 0.4, pitch: 0.3 },
        0.1,
        INITIAL_PLANETS,
      );
    expect(len(sub(f.position, first))).toBeGreaterThan(20);
    expect(Math.abs(dot(f.forward, f.up))).toBeLessThan(0.0001);
    expect(len(f.forward)).toBeCloseTo(1);
    const speed = len(f.velocity);
    for (let i = 0; i < 15; i++)
      f = stepFlight(
        f,
        { ...manual, throttle: 0, brake: true },
        0.1,
        INITIAL_PLANETS,
      );
    expect(len(f.velocity)).toBeLessThan(speed * 0.05);
  });
  it("changes course in space, permits return to origin and rejects injected positions or accelerated command clocks", () => {
    let s = newGame(0);
    s.position = { x: 21, z: 23 };
    s = applyAction(s, { type: "travel", planet: "orbis" }, 1000);
    s = applyAction(s, { type: "course", planet: "home" }, 1000);
    expect(s.flight?.target).toBe("home");
    expect(() =>
      applyAction(s, { type: "course", planet: "wild-1" }, 1000),
    ).toThrow();
    expect(
      ActionSchema.safeParse({
        type: "pilot",
        position: padPoint("home"),
        commands: [],
      }).success,
    ).toBe(false);
    const action = { type: "pilot", commands: [{ input: autoInput, dt: 0.2 }] };
    s = applyAction(s, action, 1000);
    expect(() => applyAction(s, action, 1000)).toThrow(/время/);
    expect(() =>
      applyAction(
        s,
        {
          type: "pilot",
          commands: Array.from({ length: 10 }, () => ({
            input: autoInput,
            dt: 0.2,
          })),
        },
        100000,
      ),
    ).toThrow(/время/);
  });
  it("detours even when the direct course passes exactly through a planet center", () => {
    const route = flightRoute(
      { x: 0, y: 0, z: -100 },
      "orbis",
      INITIAL_PLANETS,
    );
    expect(route.length).toBeLessThan(20);
    expect(route.every((v) => Object.values(v).every(Number.isFinite))).toBe(
      true,
    );
  });
});
