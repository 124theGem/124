import { describe, expect, it } from 'vitest';
import { CLASSES, getClass } from '../src/game/classes/catalog';
import { Simulation } from '../src/game/simulation/Simulation';
import { FIXED_DT, type Entity } from '../src/game/core/types';
import { addHero, makeEntity, replaceController } from '../src/game/teams/roster';
import { BotController } from '../src/game/ai/BotController';
import { createProfile, equip, equipmentStats, rewardMatch } from '../src/game/storage/profile';
import { ITEMS, rollLoot } from '../src/game/inventory/items';
import { seeded, lineClear } from '../src/game/core/math';
import { finish, updateRules } from '../src/game/modes/rules';
import { navigate } from '../src/game/ai/navigation';
function fixture(classId = 'guardian') {
  const sim = new Simulation({ mode: 'hill', classId });
  sim.state.map.obstacles = [];
  const p = sim.player;
  p.position = { x: 0, z: 0 };
  p.previous = { ...p.position };
  p.hp = p.maxHp / 2;
  p.ultimate = 100;
  sim.state.entities
    .filter((e) => e.team === 'A' && e.id !== p.id)
    .forEach((e, i) => {
      e.position = { x: i + 1, z: 1 };
      e.hp = e.maxHp / 3;
    });
  sim.state.entities
    .filter((e) => e.team === 'B')
    .forEach((e, i) => {
      e.position = { x: i - 1, z: 3 };
      e.hp = e.maxHp = 5000;
    });
  return sim;
}
const ticks = (s: Simulation, n: number) => {
  for (let i = 0; i < n; i++) s.step([]);
};
describe('class and ability catalogue', () => {
  it('has exactly 15 classes, 60 active abilities and 15 fourth-slot ultimates', () => {
    expect(CLASSES).toHaveLength(15);
    const ids = new Set<string>();
    for (const c of CLASSES) {
      expect(c.abilities).toHaveLength(4);
      expect(c.abilities.filter((a) => a.ultimate)).toHaveLength(1);
      expect(c.abilities[3].ultimate).toBe(true);
      expect(c.passive.length).toBeGreaterThan(10);
      for (const a of c.abilities) {
        expect(ids.has(a.id)).toBe(false);
        ids.add(a.id);
        expect(a.effects.length).toBeGreaterThan(0);
        expect(a.description).not.toBe('');
      }
    }
    expect(ids.size).toBe(60);
  });
  for (const c of CLASSES)
    for (const [index, a] of c.abilities.entries())
      it(`${c.name}: ${a.name} produces its mechanical effects`, () => {
        const sim = fixture(c.id),
          p = sim.player,
          ally = sim.state.entities.find((e) => e.id === 'A1')!,
          enemy = sim.state.entities.find((e) => e.id === 'B1')!;
        const resource = p.resource,
          enemyHp = enemy.hp,
          allyHp = ally.hp;
        const target =
          a.target === 'ally' ? ally : a.target === 'self' || a.target === 'team' ? p : enemy;
        if (a.effects.some((f) => f.kind === 'reset')) p.cooldowns[0] = 5;
        const cast = sim.combat.cast(
          p,
          index,
          target.id,
          a.range === 0 ? p.position : enemy.position,
        );
        expect(cast).toBe(true);
        expect(p.cooldowns[index]).toBe(a.cooldown);
        expect(p.resource).toBe(resource - a.cost);
        if (a.ultimate) expect(p.ultimate).toBeLessThan(100);
        ticks(
          sim,
          Math.ceil(((a.delay ?? 0) + (a.type === 'projectile' ? 1 : 0) + 0.2) / FIXED_DT),
        );
        const kinds = a.effects.map((f) => f.kind);
        if (kinds.includes('damage') && a.target !== 'self') expect(enemy.hp).toBeLessThan(enemyHp);
        if (kinds.includes('heal') && (a.target === 'ally' || a.target === 'team'))
          expect(ally.hp).toBeGreaterThan(allyHp);
        if (kinds.includes('shield'))
          expect((a.target === 'ally' ? ally : p).shield).toBeGreaterThan(0);
        if (kinds.includes('summon'))
          expect(
            sim.state.entities.filter((e) => e.kind === 'summon' && e.alive).length,
          ).toBeGreaterThan(0);
        for (const kind of kinds.filter((k) =>
          ['stun', 'slow', 'root', 'poison', 'burn', 'weakness', 'taunt'].includes(k),
        ))
          expect(enemy.statuses.some((t) => t.kind === kind)).toBe(true);
        for (const kind of kinds.filter((k) =>
          ['defense', 'power', 'haste', 'stealth'].includes(k),
        ))
          expect((a.target === 'ally' ? ally : p).statuses.some((t) => t.kind === kind)).toBe(true);
        expect(sim.combat.cast(p, index, target.id, target.position)).toBe(false);
      });
});
describe('combat and simulation boundaries', () => {
  it('shaman passive increases totem radius and duration by 25%', () => {
    const sim = fixture('shaman');
    expect(sim.combat.cast(sim.player, 1, 'B1', { x: 0, z: 3 })).toBe(true);
    expect(sim.state.zones[0].radius).toBe(6.25);
    expect(sim.state.zones[0].remaining).toBe(12.5);
  });
  it('cone telegraphs damage only the forward sector', () => {
    const sim = fixture(),
      enemy = sim.state.entities.find((e) => e.id === 'B1')!;
    enemy.position = { x: 0, z: 3 };
    const other = sim.state.entities.find((e) => e.id === 'B2')!;
    other.position = { x: 0, z: -3 };
    const before = other.hp;
    sim.state.zones.push({
      id: 1,
      source: sim.player.id,
      team: 'A',
      position: { x: 0, z: 0 },
      radius: 5,
      remaining: 0.1,
      delay: 0,
      tick: 0,
      effects: [{ kind: 'damage', power: 100 }],
      friendly: false,
      color: '#f00',
      telegraph: true,
      shape: 'cone',
      facing: 0,
      arc: Math.PI / 2,
    });
    sim.step([]);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(other.hp).toBe(before);
  });
  it('keeps fixed timestep and replay deterministic, including serialized restoration', () => {
    const a = fixture('firemage'),
      b = fixture('firemage');
    for (let i = 0; i < 150; i++) {
      const cmd = [
        { actorId: 'A0', move: { x: 1, z: 0 }, attack: true, ability: i === 0 ? 0 : undefined },
      ];
      a.step(cmd);
      b.step(cmd);
    }
    expect(a.snapshot()).toBe(b.snapshot());
    const restored = Simulation.restore(a.snapshot());
    for (let i = 0; i < 100; i++) {
      a.step([]);
      restored.step([]);
    }
    expect(restored.state.entities).toEqual(a.state.entities);
    expect(restored.state.time).toBe(a.state.time);
    a.combat.cast(a.player, 2, undefined, { x: a.player.position.x, z: a.player.position.z + 1 });
    restored.combat.cast(restored.player, 2, undefined, {
      x: restored.player.position.x,
      z: restored.player.position.z + 1,
    });
    expect(restored.snapshot()).toBe(a.snapshot());
    expect(() => a.step([], 0.1)).toThrow('fixed timestep');
  });
  it('blocks attacks, aimed spells, movement and projectiles through walls', () => {
    const s = fixture('archer'),
      p = s.player,
      t = s.state.entities.find((e) => e.id === 'B1')!;
    s.state.entities = s.state.entities.filter((e) => e.id === p.id || e.id === t.id);
    p.position = { x: -3, z: 0 };
    t.position = { x: 3, z: 0 };
    s.state.map.obstacles = [{ x: 0, z: 0, w: 1, d: 8, kind: 'wall' }];
    const hp = t.hp;
    s.combat.attack(p, t.id);
    expect(t.hp).toBe(hp);
    expect(s.state.projectiles).toHaveLength(0);
    expect(s.combat.cast(p, 0, t.id)).toBe(false);
    for (let i = 0; i < 60; i++) s.combat.move(p, { x: 1, z: 0 }, FIXED_DT);
    expect(p.position.x).toBeLessThan(-0.9);
    expect(lineClear(p.position, t.position, s.state.map.obstacles)).toBe(false);
  });
  it('applies armor, shields, invulnerability and hostile-team validation', () => {
    const s = fixture(),
      p = s.player,
      t = s.state.entities.find((e) => e.id === 'B1')!,
      ally = s.state.entities[1];
    t.armor = 0;
    t.shield = 80;
    const before = t.hp;
    s.combat.damage(p, t, 100);
    expect(t.hp).toBe(before - 20);
    expect(t.shield).toBe(0);
    t.statuses.push({ kind: 'invulnerable', remaining: 1, power: 1, source: t.id, tick: 0 });
    s.combat.damage(p, t, 500);
    expect(t.hp).toBe(before - 20);
    const hp = ally.hp;
    s.combat.damage(p, ally, 200);
    expect(ally.hp).toBe(hp);
  });
  it('poison and burn tick and expire; cleanse removes hostile effects', () => {
    const s = fixture('priest'),
      p = s.player,
      t = s.state.entities[1],
      enemy = s.state.entities[3];
    s.combat.effects(enemy, t, [{ kind: 'poison', power: 20, duration: 3 }]);
    const hp = t.hp;
    ticks(s, 35);
    expect(t.hp).toBeLessThan(hp);
    s.combat.effects(p, t, [{ kind: 'cleanse', power: 1 }]);
    expect(t.statuses).toHaveLength(0);
  });
  it('revives only one fallen teammate per ultimate', () => {
    const s = fixture('priest');
    for (const e of s.state.entities.filter((e) => e.team === 'A' && e.id !== 'A0')) {
      e.alive = false;
      e.hp = 0;
    }
    s.combat.cast(s.player, 3);
    expect(s.state.entities.filter((e) => e.team === 'A' && e.alive)).toHaveLength(2);
    s.player.cooldowns[3] = 0;
    s.player.ultimate = 100;
    s.combat.cast(s.player, 3);
    expect(s.state.entities.filter((e) => e.team === 'A' && e.alive)).toHaveLength(3);
  });
  it('caps summoned creatures at four without consuming hero slots', () => {
    const s = fixture('necromancer');
    for (let i = 0; i < 4; i++)
      s.combat.effects(s.player, s.player, [{ kind: 'summon', power: 3, duration: 2 }]);
    expect(s.state.entities.filter((e) => e.kind === 'summon' && e.alive)).toHaveLength(4);
    expect(s.state.entities.filter((e) => e.kind === 'hero' && e.team === 'A')).toHaveLength(3);
    ticks(s, 65);
    expect(s.state.entities.filter((e) => e.kind === 'summon' && e.alive)).toHaveLength(0);
  });
  it('does not allow resource, cooldown or ultimate bypass', () => {
    const s = fixture('firemage'),
      p = s.player;
    p.resource = 0;
    expect(s.combat.cast(p, 0, 'B1')).toBe(false);
    p.resource = 100;
    p.ultimate = 99;
    expect(s.combat.cast(p, 3, 'B1')).toBe(false);
    p.ultimate = 100;
    expect(s.combat.cast(p, 3, 'B1')).toBe(true);
    expect(s.combat.cast(p, 3, 'B1')).toBe(false);
  });
  it('stun and root prevent movement; dodge cannot tunnel through a wall', () => {
    const s = fixture(),
      p = s.player;
    p.position = { x: -2, z: 0 };
    s.state.map.obstacles = [{ x: 0, z: 0, w: 0.5, d: 10, kind: 'wall' }];
    s.step([{ actorId: p.id, move: { x: 1, z: 0 }, dodge: true }]);
    expect(p.position.x).toBeLessThan(-0.5);
    p.statuses = [{ kind: 'stun', power: 1, remaining: 2, source: 'B0', tick: 0 }];
    const pos = { ...p.position };
    s.step([{ actorId: p.id, move: { x: 1, z: 1 } }]);
    expect(p.position).toEqual(pos);
  });
});
describe('team slots and controller contracts', () => {
  it('enforces max three slots even when an existing hero is dead', () => {
    const s = fixture();
    s.state.entities[1].alive = false;
    expect(() =>
      addHero(s.state, makeEntity('fourth', 'priest', 'A', { x: 0, z: 0 }, 'BOT')),
    ).toThrow('максимум 3');
  });
  it('allows remote replacement only between matches and serializes the slot', () => {
    const s = fixture();
    replaceController(s.state, 'A1', 'HUMAN_REMOTE', 'user-42');
    expect(JSON.parse(s.snapshot()).entities[1].participantId).toBe('user-42');
    s.step([]);
    expect(() => replaceController(s.state, 'A1', 'BOT', 'bot')).toThrow('between matches');
  });
  it('PvP normalizes equipped stats while raids use equipment', () => {
    const equipment = { hp: 200, attack: 100, armor: 20 };
    const raid = new Simulation({ mode: 'raid', classId: 'guardian', equipment }),
      hill = new Simulation({ mode: 'hill', classId: 'guardian', equipment });
    expect(raid.player.maxHp).toBe(getClass('guardian').hp + 200);
    expect(hill.player.attack).toBe(getClass('guardian').attack);
  });
});
describe('mode objectives and respawns', () => {
  it('siege unlocks A, B, C sequentially, freezes contests, and wins on C', () => {
    const s = new Simulation({ mode: 'siege', classId: 'guardian' }).state;
    expect(s.points.map((p) => p.locked)).toEqual([false, true, true]);
    for (const enemy of s.entities.filter((e) => e.team === 'B')) enemy.position = { x: 15, z: 30 };
    for (let index = 0; index < 3; index++) {
      const p = s.points[index];
      for (const e of s.entities.filter((e) => e.team === 'A')) e.position = { ...p.position };
      if (index === 0) {
        s.entities[3].position = { ...p.position };
        for (let i = 0; i < 30; i++) updateRules(s, FIXED_DT);
        expect(p.progress).toBe(0);
        s.entities[3].position = { x: 15, z: 30 };
      }
      for (let i = 0; i < 240; i++) updateRules(s, FIXED_DT);
      expect(p.owner).toBe('A');
    }
    expect(s.winner).toBe('A');
  });
  it('hill neutralizes enemy ownership before capture, switches respawns and scores exactly 2/sec', () => {
    const s = fixture().state,
      p = s.points[0];
    for (const e of s.entities) e.position = e.team === 'B' ? { x: 15, z: 15 } : { x: 0, z: 0 };
    for (let i = 0; i < 240; i++) updateRules(s, FIXED_DT);
    expect(p.owner).toBe('A');
    const before = s.score.A;
    for (let i = 0; i < 300; i++) updateRules(s, FIXED_DT);
    expect(s.score.A - before).toBeCloseTo(20, 5);
    for (const e of s.entities) e.position = e.team === 'A' ? { x: -15, z: -15 } : { x: 0, z: 0 };
    for (let i = 0; i < 190; i++) updateRules(s, FIXED_DT);
    expect(p.owner).toBe(null);
    for (let i = 0; i < 240; i++) updateRules(s, FIXED_DT);
    expect(p.owner).toBe('B');
  });
  it('draws only after bounded overtime; siege timeout awards defenders', () => {
    const s = fixture().state;
    s.time = 300;
    for (const e of s.entities) e.position = { x: 15, z: 15 };
    updateRules(s, FIXED_DT);
    expect(s.overtime).toBe(true);
    expect(s.status).toBe('playing');
    s.time = 330;
    updateRules(s, FIXED_DT);
    expect(s.winner).toBe('draw');
    const siege = new Simulation({ mode: 'siege', classId: 'guardian' }).state;
    siege.time = 420;
    updateRules(siege, FIXED_DT);
    expect(siege.winner).toBe('B');
  });
  it('PvP heroes respawn in waves with protection; raid heroes do not auto-respawn', () => {
    const sim = fixture(),
      p = sim.player;
    p.alive = false;
    p.hp = 0;
    p.respawnAt = 10;
    sim.state.time = 9;
    updateRules(sim.state, FIXED_DT);
    expect(p.alive).toBe(false);
    sim.state.time = 10;
    updateRules(sim.state, FIXED_DT);
    expect(p.alive).toBe(true);
    expect(p.statuses[0].kind).toBe('invulnerable');
    const raid = new Simulation({ mode: 'raid', classId: 'guardian' });
    raid.player.alive = false;
    raid.state.time = 100;
    updateRules(raid.state, FIXED_DT);
    expect(raid.player.alive).toBe(false);
  });
  it('boss transitions through three phases and creates avoidable telegraphs', () => {
    const s = new Simulation({ mode: 'raid', classId: 'guardian' });
    for (let stage = 0; stage < 4; stage++) {
      for (const e of s.state.entities.filter((e) => e.kind === 'monster')) {
        e.alive = false;
        e.hp = 0;
      }
      s.step([]);
    }
    const boss = s.state.entities.find((e) => e.kind === 'boss')!;
    expect(boss).toBeDefined();
    s.player.position = { x: 0, z: 23 };
    boss.hp = boss.maxHp * 0.6;
    s.step([]);
    expect(s.state.bossPhase).toBe(2);
    boss.hp = boss.maxHp * 0.2;
    s.state.tick = 94;
    s.step([]);
    expect(s.state.bossPhase).toBe(3);
    expect(s.state.zones.some((z) => z.telegraph && z.delay > 0)).toBe(true);
    boss.alive = false;
    s.step([]);
    expect(s.state.winner).toBe('A');
    expect(s.state.chest).not.toBe(null);
  });
});
describe('AI behavior', () => {
  it('avoids telegraphs and cannot see stealthed enemies', () => {
    const s = fixture(),
      me = s.state.entities[1],
      bot = new BotController(me.id);
    s.state.zones.push({
      id: 1,
      source: 'B1',
      team: 'B',
      position: { ...me.position },
      radius: 4,
      remaining: 0.1,
      delay: 1,
      tick: 0,
      effects: [],
      friendly: false,
      color: '#f00',
      telegraph: true,
    });
    expect(bot.sample(s.state).dodge).toBe(true);
    expect(me.aiState).toBe('AvoidDanger');
    s.state.zones = [];
    s.state.time += 1;
    for (const e of s.state.entities.filter((e) => e.team === 'B'))
      e.statuses = [{ kind: 'stealth', power: 1, remaining: 5, source: e.id, tick: 0 }];
    expect(bot.sample(s.state).targetId).toBeUndefined();
  });
  it('heals an injured ally using the same ability system', () => {
    const s = fixture('berserker'),
      priest = s.state.entities.find((e) => e.classId === 'priest')!,
      bot = new BotController(priest.id);
    s.player.hp = 100;
    const cmd = bot.sample(s.state);
    expect(cmd.ability).toBe(0);
    const hp = s.player.hp;
    s.step([cmd]);
    expect(s.player.hp).toBeGreaterThan(hp);
    expect(priest.stats.healing).toBeGreaterThan(0);
  });
  it('finds a route around an obstacle instead of walking into it', () => {
    const s = fixture();
    s.state.map.obstacles = [{ x: 0, z: 0, w: 4, d: 8, kind: 'wall' }];
    const v = navigate(s.state.map, { x: -5, z: 0 }, { x: 5, z: 0 });
    expect(Math.abs(v.z)).toBeGreaterThan(0);
  });
  it('raid can be won with the shared hero/bot combat and no invulnerability', () => {
    const sim = new Simulation({ mode: 'raid', classId: 'archer' }),
      bots = new Map<string, BotController>();
    for (let i = 0; i < 12610 && sim.state.status === 'playing'; i++) {
      const commands = sim.state.entities.map((e) => {
        let bot = bots.get(e.id);
        if (!bot) {
          bot = new BotController(e.id);
          bots.set(e.id, bot);
        }
        return bot.sample(sim.state);
      });
      sim.step(commands);
    }
    expect(sim.state.stage).toBe(4);
    expect(sim.state.winner).toBe('A');
    expect(sim.state.time).toBeGreaterThanOrEqual(90);
    expect(sim.state.time).toBeLessThanOrEqual(420);
  }, 30000);
  it('both PvP modes finish with autonomous bots and legal rosters', () => {
    for (const mode of ['hill', 'siege'] as const) {
      const sim = new Simulation({ mode, classId: 'berserker' }),
        bots = sim.state.entities.map((e) => new BotController(e.id));
      for (let i = 0; i < 13000 && sim.state.status === 'playing'; i++)
        sim.step(bots.map((b) => b.sample(sim.state)));
      expect(sim.state.status).toBe('finished');
      expect(sim.state.entities.filter((e) => e.team === 'A' && e.kind === 'hero')).toHaveLength(3);
      expect(sim.state.entities.reduce((sum, e) => sum + e.stats.damage, 0)).toBeGreaterThan(1000);
    }
  }, 30000);
});
describe('progression and inventory', () => {
  it('provides 30 valid items and weighted loot of all rarities', () => {
    expect(ITEMS).toHaveLength(30);
    const random = seeded(100),
      rarities = new Set<string>();
    for (let i = 0; i < 1000; i++) rarities.add(rollLoot(random).rarity);
    expect(rarities.size).toBe(5);
  });
  it('only equips owned items and grants each match reward once', () => {
    const p = createProfile(),
      sim = fixture();
    expect(equip(p, 'item-29')).toBe(false);
    expect(equip(p, 'item-0')).toBe(true);
    expect(equipmentStats(p).attack).toBeGreaterThan(0);
    finish(sim.state, 'A');
    const reward = rewardMatch(p, sim.state);
    expect(reward?.xp).toBe(400);
    expect(p.gold).toBe(630);
    expect(rewardMatch(p, sim.state)).toBe(null);
  });
});
