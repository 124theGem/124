import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLASSES,
  Dungeon,
  RPG,
  SAVE_KEY,
  TILE,
  decodeSave,
  makeItem,
  newSave,
  stats,
} from "../src/rpg/model";

describe("Emberfall RPG gameplay and persistence", () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("every floor connects the spawn, all enemies, chests, merchant and exit", () => {
    for (let floor = 1; floor <= 3; floor++) {
      const d = new Dungeon(floor),
        start = 19 * d.width + 14,
        queue = [start],
        visited = new Set(queue);
      for (let i = 0; i < queue.length; i++) {
        const n = queue[i],
          x = n % d.width,
          y = Math.floor(n / d.width);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            key = ny * d.width + nx;
          if (d.tile(nx, ny) && !visited.has(key)) {
            visited.add(key);
            queue.push(key);
          }
        }
      }
      for (const p of [
        ...d.enemies,
        ...d.props.filter((p) =>
          ["merchant", "chest", "stairs", "crystal"].includes(p.type),
        ),
      ])
        expect(
          visited.has(
            Math.floor(p.y / TILE) * d.width + Math.floor(p.x / TILE),
          ),
          JSON.stringify(p),
        ).toBe(true);
    }
  });
  it("moves continuously at the same speed across frame rates and slides along solid walls", () => {
    const a = new RPG(),
      b = new RPG();
    for (const g of [a, b]) g.dungeon.enemies.forEach((e) => (e.dead = true));
    for (let i = 0; i < 30; i++) a.update(1 / 30, 1, 0);
    for (let i = 0; i < 120; i++) b.update(1 / 120, 1, 0);
    expect(a.save.x).toBeCloseTo(b.save.x, 5);
    const d = a.dungeon;
    const body = { x: 5 * TILE + 9, y: 18 * TILE };
    d.move(body, -100, 5);
    expect(body.x).toBe(5 * TILE + 9);
    expect(body.y).toBe(18 * TILE + 5);
  });
  it("equips an item, returns the old item to the bag and restores the exact configuration", () => {
    const g = new RPG(),
      item = g.save.inventory[0],
      old = g.save.equipment.weapon!;
    const attack = stats(g.save).attack;
    g.equip(item.id);
    expect(g.save.equipment.weapon?.id).toBe(item.id);
    expect(g.save.inventory.some((i) => i.id === old.id)).toBe(true);
    expect(stats(g.save).attack).toBeGreaterThan(attack);
    const reloaded = new RPG(decodeSave(storage.get(SAVE_KEY)!)!);
    expect(reloaded.save.equipment).toEqual(g.save.equipment);
    expect(reloaded.save.inventory).toEqual(g.save.inventory);
  });
  it("attacks and drops an enemy reward only once, including after reload", () => {
    const g = new RPG(),
      e = g.dungeon.enemies[0];
    g.hitEnemy(e, 10000);
    const xp = g.save.xp,
      gold = g.save.drops.length,
      kills = g.save.kills;
    g.hitEnemy(e, 10000);
    expect(g.save.xp).toBe(xp);
    expect(g.save.drops).toHaveLength(gold);
    expect(g.save.kills).toBe(kills);
    const restored = new RPG(decodeSave(storage.get(SAVE_KEY)!)!);
    expect(restored.dungeon.enemies[0].dead).toBe(true);
    expect(restored.save.drops).toEqual(g.save.drops);
  });
  it("collects and sells an item atomically, preventing repeated gold rewards", () => {
    const g = new RPG(),
      item = makeItem("weapon", "legendary", 3);
    g.save.drops = [
      { id: "unique", x: g.save.x, y: g.save.y, kind: "item", amount: 1, item },
    ];
    expect(g.collect("unique")).toBe(true);
    expect(g.collect("unique")).toBe(false);
    expect(g.save.inventory.filter((i) => i.id === item.id)).toHaveLength(1);
    const gold = g.save.gold;
    g.sell(item.id);
    g.sell(item.id);
    expect(g.save.gold).toBe(gold + item.value);
  });
  it("opens a chest once and persists both the opened chest and uncollected loot", () => {
    const g = new RPG(),
      p = g.dungeon.props.find((p) => p.type === "chest")!;
    Object.assign(g.save, { x: p.x, y: p.y });
    g.interact();
    const count = g.save.drops.length;
    g.interact();
    expect(g.save.drops).toHaveLength(count);
    expect(g.save.quests[1].progress).toBe(1);
    const next = new RPG(decodeSave(storage.get(SAVE_KEY)!)!);
    expect(next.save.opened).toContain(p.id);
    expect(next.save.drops).toHaveLength(count);
  });
  it("keeps a drop in the world when the inventory is full", () => {
    const g = new RPG();
    g.save.inventory = Array.from({ length: 40 }, () =>
      makeItem("ring", "common", 1),
    );
    g.save.drops = [
      {
        id: "overflow",
        x: g.save.x,
        y: g.save.y,
        kind: "item",
        amount: 1,
        item: makeItem("ring", "rare", 2),
      },
    ];
    expect(g.collect("overflow")).toBe(false);
    expect(g.save.drops).toHaveLength(1);
  });
  it("awards each completed quest only once and grants functional talent points", () => {
    const g = new RPG();
    const gold = g.save.gold;
    g.quest("bones", 6);
    g.claim("bones");
    g.claim("bones");
    expect(g.save.gold).toBe(gold + 120);
    g.addXP(250);
    const attack = stats(g.save).attack,
      points = stats(g.save).points;
    expect(points).toBeGreaterThan(0);
    g.talent("power");
    expect(stats(g.save).attack).toBe(attack + 3);
    expect(stats(g.save).points).toBe(points - 1);
  });
  it("all classes use real melee or projectile damage and pay for abilities", () => {
    for (const cls of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) {
      const g = new RPG(newSave(cls)),
        e = g.dungeon.enemies[0];
      g.save.x = e.x - 35;
      g.save.y = e.y;
      const hp = e.hp;
      g.attack();
      for (let i = 0; i < 25; i++) g.update(0.01, 0, 0);
      expect(e.hp).toBeLessThan(hp);
      const mana = g.save.mana;
      expect(g.skill()).toBe(true);
      expect(g.save.mana).toBeLessThan(mana);
      expect(g.skill()).toBe(false);
    }
  });
  it("locks the exit until the boss dies, then advances without resetting the hero", () => {
    const g = new RPG(),
      exit = g.dungeon.props.find((p) => p.type === "stairs")!;
    Object.assign(g.save, { x: exit.x, y: exit.y });
    g.interact();
    expect(g.save.floor).toBe(1);
    const boss = g.dungeon.enemies.find((e) => e.type === "warden")!;
    g.hitEnemy(boss, 10000);
    g.save.level = 5;
    g.interact();
    expect(g.save.floor).toBe(2);
    expect(g.save.level).toBe(5);
    expect(g.save.dead).toEqual([]);
    expect(g.save.bossDefeated).toBe(false);
    expect(g.dungeon.enemies.every((e) => !e.dead)).toBe(true);
  });
  it("potions, revival and merchant purchases update real balances", () => {
    const g = new RPG();
    g.save.hp = 1;
    g.potion();
    expect(g.save.hp).toBeGreaterThan(1);
    expect(g.save.potions).toBe(2);
    const gold = g.save.gold;
    g.buyPotion();
    expect(g.save.gold).toBe(gold - 35);
    expect(g.save.potions).toBe(3);
    g.save.gold = 0;
    g.buyPotion();
    expect(g.save.potions).toBe(3);
    g.dead = true;
    g.save.gold = 100;
    g.save.hp = 0;
    g.revive();
    expect(g.save.hp).toBe(stats(g.save).maxHp);
    expect(g.save.gold).toBe(90);
    expect(g.dead).toBe(false);
  });
  it("does not spend potions or mana while paused or dead", () => {
    const g = new RPG();
    g.save.hp = 1;
    g.paused = true;
    g.potion();
    g.skill();
    g.attack();
    expect(g.save.potions).toBe(3);
    expect(g.save.mana).toBe(100);
    expect(g.projectiles).toHaveLength(0);
  });
  it("smith upgrades spend gold once and preserve the upgraded item on reload", () => {
    const g = new RPG(),
      before = stats(g.save).attack;
    g.upgradeWeapon();
    expect(g.save.gold).toBe(20);
    expect(stats(g.save).attack).toBe(before + 3);
    expect(g.save.equipment.weapon?.level).toBe(2);
    g.upgradeWeapon();
    expect(g.save.gold).toBe(20);
    expect(stats(g.save).attack).toBe(before + 3);
    const next = new RPG(decodeSave(storage.get(SAVE_KEY)!)!);
    expect(stats(next.save).attack).toBe(before + 3);
  });
  it("completes the three-floor adventure using real abilities and claimed rewards", () => {
    const g = new RPG();
    g.equip(g.save.inventory[0].id);
    const events: string[] = [];
    g.onEvent = (m) => events.push(m);
    for (let floor = 1; floor <= 3; floor++) {
      for (const e of g.dungeon.enemies) {
        if (e.dead) continue;
        g.save.x = e.x - 33;
        g.save.y = e.y;
        for (let step = 0; step < 1600 && !e.dead; step++) {
          if (g.save.hp < stats(g.save).maxHp * 0.45) g.potion();
          g.attack();
          if (e.type === "warden") g.skill();
          g.update(0.025, 0, 0);
          expect(g.dead, `hero died on floor ${floor} against ${e.type}`).toBe(
            false,
          );
        }
        expect(e.dead).toBe(true);
      }
      for (const drop of [...g.save.drops]) g.collect(drop.id);
      for (const chest of g.dungeon.props
        .filter((p) => p.type === "chest")
        .slice(0, 3)) {
        g.save.x = chest.x;
        g.save.y = chest.y;
        g.interact();
      }
      for (const q of g.save.quests) g.claim(q.id);
      const exit = g.dungeon.props.find((p) => p.type === "stairs")!;
      g.save.x = exit.x;
      g.save.y = exit.y;
      g.interact();
    }
    expect(g.save.floor).toBe(3);
    expect(g.save.bossDefeated).toBe(true);
    expect(g.save.quests.every((q) => q.claimed)).toBe(true);
    expect(g.save.kills).toBe(36);
    expect(events).toContain("victory");
    const restored = new RPG(decodeSave(storage.get(SAVE_KEY)!)!);
    expect(restored.save.level).toBeGreaterThan(5);
    expect(restored.save.bossDefeated).toBe(true);
  });
  it("rejects invalid saves without overwriting legacy games and reports storage failures", () => {
    expect(decodeSave("{}")).toBeNull();
    expect(decodeSave("broken")).toBeNull();
    const save = newSave();
    expect(decodeSave(JSON.stringify(save))).toEqual(save);
    save.gold = -1;
    expect(decodeSave(JSON.stringify(save))).toBeNull();
    storage.set("little-planets", "legacy-progress");
    const g = new RPG();
    g.persist();
    expect(storage.get("little-planets")).toBe("legacy-progress");
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    const messages: string[] = [];
    g.onEvent = (m) => messages.push(m);
    g.persist();
    g.persist();
    expect(g.saveError).toBe(true);
    expect(messages).toHaveLength(1);
  });
});
