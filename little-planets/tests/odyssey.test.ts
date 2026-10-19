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

describe("continuous spaceflight and server landing rules", () => {
  it("recovers when autopilot is enabled or a new course is chosen beside the opposite hemisphere", () => {
    for (const changeCourse of [false, true]) {
      let f = beginFlight("ferra", "home", INITIAL_PLANETS, 0);
      f.position = { x: 0, y: 0, z: -bodyRadius("ferra") - 1 };
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
    const known = [...INITIAL_PLANETS, "wild-1", "wild-13"] as PlanetId[];
    for (const origin of known)
      for (const target of known) {
        if (origin === target) continue;
        let f = beginFlight(origin, target, known, 0);
        for (let i = 0; i < 1800 && !landingInfo(f).allowed; i++) {
          f = stepFlight(f, autoInput, 0.1, known);
          for (const id of known) {
            const delta = sub(f.position, bodyCenter(id));
            assert(
              Math.max(
                Math.abs(delta.x),
                Math.abs(delta.y),
                Math.abs(delta.z),
              ) >=
                planetSize(id) / 2 - 0.001,
              "Flight never enters the solid cube core",
            );
          }
        }
        expect(landingInfo(f).allowed, `${origin} → ${target}`).toBe(true);
        expect(f.distance).toBeGreaterThan(50);
      }
  }, 45000);
  it("keeps origin until physical arrival, persists flight and preserves resources through landing", () => {
    let s = newGame(0);
    s.position = { ...ship("home") };
    const inventory = structuredClone(s.inventory);
    s = applyAction(s, { type: "travel", planet: "mycelia" }, 1000);
    expect(s.planet).toBe("home");
    expect(s.flight?.target).toBe("mycelia");
    expect(s.flight?.autopilot).toBe(false);
    expect(() => applyAction(s, { type: "land" }, 1000)).toThrow(/маяку/);
    expect(() => applyAction(s, { type: "move", x: 22, z: 23 }, 1000)).toThrow(
      /полёт/,
    );
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    s = finishFlight(s);
    expect(s.planet).toBe("mycelia");
    expect(s.flight).toBeNull();
    expect(s.inventory).toEqual(inventory);
    expect(
      surfaceDistance(s.position, ship("mycelia"), "mycelia"),
    ).toBeLessThan(3);
  });
  it("accepts manual thrust, yaw, pitch and braking while maintaining a stable orthogonal frame", () => {
    let f = beginFlight("home", "ferra", INITIAL_PLANETS, 0),
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
    s.position = { ...ship("home") };
    s = applyAction(s, { type: "travel", planet: "ferra" }, 1000);
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
      "ferra",
      INITIAL_PLANETS,
    );
    expect(route.length).toBeLessThan(20);
    expect(route.every((v) => Object.values(v).every(Number.isFinite))).toBe(
      true,
    );
  });
});
