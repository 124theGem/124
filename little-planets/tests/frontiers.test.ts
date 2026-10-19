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
  s.position = { x: e.x, z: e.z };
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
  it("starts with peaceful and hostile cubic destinations", () => {
    const s = newGame(0);
    expect(s.discovered).toEqual(INITIAL_PLANETS);
    expect(PLANETS.ferra.hostile).toBe(true);
    expect(s.worlds.ferra.enemies).toHaveLength(6);
    expect(s.worlds.home.enemies).toHaveLength(0);
    expect(Object.hasOwn(PLANETS, "orbis")).toBe(false);
  });
  it("discovers random unused worlds, gates travel and exhausts the 24-world pool", () => {
    let s = newGame(0);
    s.position = { ...ship("home") };
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
    expect(first).toHaveLength(50);
    expect(new Set(first.map((n) => `${n.x},${n.z}`)).size).toBe(50);
    expect(first).toEqual(nodes("wild-1"));
    expect(first).not.toEqual(other);
    for (const n of first) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(planetSize("wild-1"));
    }
  });
  it("only scans near a ship and never repeats a discovery", () => {
    const s = newGame(0);
    expect(() => applyAction(s, { type: "scan" }, 1000)).toThrow(/поближе/);
    s.position = { ...ship("home") };
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
describe("retired spherical destinations", () => {
  it("rejects travel to deleted round planets without spending resources", () => {
    const s = newGame(0);
    s.position = { ...ship("home") };
    for (const planet of [
      "orbis",
      "verdia",
      "cryonia",
      "duna",
      "vulcanis",
      "aquaria",
      "mycelion",
      "granit",
    ])
      expect(() => applyAction(s, { type: "travel", planet }, 1000)).toThrow();
    expect(s.flight).toBeNull();
    expect(s.inventory.wood).toBe(90);
  });
});
