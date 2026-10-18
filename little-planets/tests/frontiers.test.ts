import { describe, it, expect } from "vitest";
import {
  newGame,
  applyAction,
  parseSave,
  worldEvent,
  walkable,
  ActionSchema,
  type Save,
} from "../shared/model";
import {
  nodes,
  GEAR,
  PLANETS,
  INITIAL_PLANETS,
  ship,
  planetSize,
  type GearKind,
  type PlanetId,
} from "../shared/catalog";
import {
  sphereNormal,
  sphereCoordinates,
  sphereStep,
  surfaceDistance,
  SPHERE_RADIUS,
} from "../shared/sphere";
function equip(s: Save, kind: GearKind) {
  s = applyAction(s, { type: "craft", recipe: `gear:${kind}`, count: 1 }, 1000);
  return applyAction(
    s,
    { type: "equip", slot: GEAR[kind].slot, item: kind },
    1000,
  );
}
function battle() {
  let s = equip(newGame(0), "sword");
  s = equip(s, "guardian");
  s.planet = "ferra";
  const e = s.worlds.ferra.enemies[0];
  s.position = { x: e.x - 1, z: e.z };
  s.worlds.ferra.lastSimAt = 1000;
  return s;
}
describe("weapons, armor and server combat", () => {
  it("requires crafted equipment, validates slots and permits taking it off", () => {
    let s = newGame(0);
    expect(() =>
      applyAction(s, { type: "equip", slot: "weapon", item: "sword" }, 1000),
    ).toThrow(/создайте/);
    s = equip(s, "sword");
    expect(s.equipment.weapon).toBe("sword");
    expect(s.inventory["gear:sword"]).toBe(1);
    expect(() =>
      applyAction(s, { type: "equip", slot: "armor", item: "sword" }, 1000),
    ).toThrow();
    s = applyAction(s, { type: "equip", slot: "weapon", item: null }, 1000);
    expect(s.equipment.weapon).toBeNull();
    expect(s.inventory["gear:sword"]).toBe(1);
  });
  it("requires laboratory for advanced weapon and armor recipes", () => {
    const s = newGame(0);
    for (const kind of ["blaster", "aegis"])
      expect(() =>
        applyAction(
          s,
          { type: "craft", recipe: `gear:${kind}`, count: 1 },
          1000,
        ),
      ).toThrow(/лабораторию/);
  });
  it("attacks in range, enforces cooldown and only rewards each kill once", () => {
    let s = battle();
    const id = s.worlds.ferra.enemies[0].id,
      resource = PLANETS.ferra.resource[0],
      before = s.inventory[resource],
      crystals = s.inventory.crystal;
    s = applyAction(s, { type: "attack", id }, 2000);
    expect(s.worlds.ferra.enemies[0].hp).toBe(21);
    expect(() => applyAction(s, { type: "attack", id }, 2200)).toThrow(
      /готово/,
    );
    s = applyAction(s, { type: "attack", id }, 2600);
    s = applyAction(s, { type: "attack", id }, 3200);
    expect(s.kills).toBe(1);
    expect(s.inventory[resource]).toBe(before + 5);
    expect(s.inventory.crystal).toBe(crystals + 2);
    expect(() => applyAction(s, { type: "attack", id }, 4000)).toThrow(
      /повержен/,
    );
    expect(s.kills).toBe(1);
  });
  it("rejects out-of-range attacks and attacks in peaceful worlds", () => {
    const s = battle(),
      id = s.worlds.ferra.enemies[0].id;
    s.position = { x: 18, z: 20 };
    expect(() => applyAction(s, { type: "attack", id }, 2000)).toThrow();
    const home = newGame(0);
    expect(() => applyAction(home, { type: "attack", id }, 2000)).toThrow();
  });
  it("armor reduces incoming damage and defeated players return home with equipment", () => {
    const armored = battle(),
      bare = structuredClone(armored);
    bare.equipment.armor = null;
    const a = applyAction(armored, { type: "combatTick" }, 2500),
      b = applyAction(bare, { type: "combatTick" }, 2500);
    expect(a.health).toBeGreaterThan(b.health);
    let s = battle();
    s.health = 1;
    s = applyAction(s, { type: "combatTick" }, 2500);
    expect(s.planet).toBe("home");
    expect(s.health).toBe(100);
    expect(s.deaths).toBe(1);
    expect(s.equipment.weapon).toBe("sword");
  });
  it("simulates bounded connected time instead of applying hours of offline attacks", () => {
    const s = battle(),
      e = s.worlds.ferra.enemies[0];
    s.position = { x: e.x + 6, z: e.z };
    const next = applyAction(s, { type: "combatTick" }, 100000000);
    expect(next.health).toBeGreaterThan(0);
    expect(
      Math.hypot(
        next.worlds.ferra.enemies[0].x - e.x,
        next.worlds.ferra.enemies[0].z - e.z,
      ),
    ).toBeLessThanOrEqual(1.9);
  });
  it("serializes health, equipment, defeated enemies and discovered worlds", () => {
    const s = applyAction(battle(), { type: "attack", id: "enemy-0" }, 2000);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
});
describe("planet scanner and weather", () => {
  it("starts with peaceful, hostile and spherical destinations", () => {
    const s = newGame(0);
    expect(s.discovered).toEqual(INITIAL_PLANETS);
    expect(PLANETS.ferra.hostile).toBe(true);
    expect(s.worlds.ferra.enemies).toHaveLength(6);
    expect(s.worlds.home.enemies).toHaveLength(0);
    expect(planetSize("orbis")).toBe(120);
  });
  it("discovers random unused worlds, gates travel and exhausts the 24-world pool", () => {
    let s = newGame(0);
    s.position = { x: 21, z: 23 };
    expect(() =>
      applyAction(s, { type: "travel", planet: "wild-1" }, 1000),
    ).toThrow(/найдите/);
    for (let i = 0; i < 24; i++) {
      s = applyAction(s, { type: "scan" }, 1000 + i);
      expect(s.lastDiscovery?.startsWith("wild-")).toBe(true);
    }
    expect(new Set(s.discovered).size).toBe(INITIAL_PLANETS.length + 24);
    expect(() => applyAction(s, { type: "scan" }, 2000)).toThrow(/24/);
    expect(
      ActionSchema.safeParse({ type: "travel", planet: "wild-99" }).success,
    ).toBe(false);
    const id = s.lastDiscovery!;
    s = applyAction(s, { type: "travel", planet: id }, 3000);
    expect(s.planet).toBe("home");
    expect(s.flight?.target).toBe(id);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
  it("generates stable, distinct resource layouts even for matching expedition sizes and biomes", () => {
    const first = nodes("wild-1"),
      other = nodes("wild-13");
    expect(first).toHaveLength(18);
    expect(new Set(first.map((n) => `${n.x},${n.z}`)).size).toBe(18);
    expect(first).toEqual(nodes("wild-1"));
    expect(first).not.toEqual(other);
    for (const n of first) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(planetSize("wild-1") - 1);
    }
  });
  it("only scans near a ship and never repeats a discovery", () => {
    const s = newGame(0);
    expect(() => applyAction(s, { type: "scan" }, 1000)).toThrow(/поближе/);
    s.position = { x: 21, z: 23 };
    const first = applyAction(s, { type: "scan" }, 1000),
      second = applyAction(first, { type: "scan" }, 1000);
    expect(first.lastDiscovery).not.toBe(second.lastDiscovery);
  });
  it("produces meteor, wind, rain, storm and hurricane on synchronized saved timelines", () => {
    const s = newGame(0),
      types = [];
    for (let i = 0; i < 5; i++) {
      const e = worldEvent(s, "home", 45000 + i * 85000)!;
      expect(e).not.toBeNull();
      types.push(e.type);
      expect(
        worldEvent(parseSave(JSON.stringify(s)), "home", 45000 + i * 85000),
      ).toEqual(e);
    }
    expect(types).toEqual(["meteor", "wind", "rain", "storm", "hurricane"]);
  });
});
describe("complete spherical surface", () => {
  it("round-trips normal coordinates and remains on a sphere", () => {
    for (const p of [
      { x: 0, z: 30 },
      { x: 119.9, z: 59.9 },
      { x: 35, z: 0.1 },
    ]) {
      const normal = sphereNormal(p);
      expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 12);
      expect(surfaceDistance(p, sphereCoordinates(normal), true)).toBeLessThan(
        0.00001,
      );
    }
  });
  it("wraps the longitude seam and permits both poles", () => {
    const p = { x: 119.9, z: 30 },
      lon = (p.x / 120) * Math.PI * 2,
      next = sphereStep(p, { x: -Math.sin(lon), y: 0, z: Math.cos(lon) }, 0.3);
    expect(next.x).toBeCloseTo(0.2, 5);
    const s = newGame(0);
    s.planet = "orbis";
    expect(walkable(s, "orbis", 30, 0)).toBe(true);
    expect(walkable(s, "orbis", 30, 60)).toBe(true);
    expect(
      surfaceDistance({ x: 0, z: 30 }, { x: 119, z: 30 }, true),
    ).toBeCloseTo(1, 6);
  });
  it("walks a complete great circle through both poles and returns to its start", () => {
    let p = { x: 30, z: 30 },
      t = { x: 0, y: -1, z: 0 };
    const start = { ...p };
    let maxY = -1,
      minY = 1;
    const count = 2400,
      step = 120 / count;
    for (let i = 0; i < count; i++) {
      const n = sphereNormal(p),
        next = sphereStep(p, t, step),
        m = sphereNormal(next),
        angle = step / SPHERE_RADIUS; // Parallel transport along the great circle: t_new = t*cos(a) - n*sin(a).
      t = {
        x: t.x * Math.cos(angle) - n.x * Math.sin(angle),
        y: t.y * Math.cos(angle) - n.y * Math.sin(angle),
        z: t.z * Math.cos(angle) - n.z * Math.sin(angle),
      };
      p = next;
      maxY = Math.max(maxY, m.y);
      minY = Math.min(minY, m.y);
      expect(Number.isFinite(p.x + p.z)).toBe(true);
    }
    expect(maxY).toBeGreaterThan(0.999);
    expect(minY).toBeLessThan(-0.999);
    expect(surfaceDistance(start, p, true)).toBeLessThan(0.0001);
  });
  it("checks ship proximity on the globe using surface distance rather than the flat chart", () => {
    let s = newGame(0);
    s.planet = "orbis";
    s.position = { x: 28, z: 30 };
    s = applyAction(s, { type: "travel", planet: "home" }, 1000);
    expect(s.planet).toBe("orbis");
    expect(s.flight?.target).toBe("home");
  });
});
