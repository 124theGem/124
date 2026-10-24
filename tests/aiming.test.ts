import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/game/simulation/Simulation';
import { HumanController } from '../src/game/controls/HumanController';
import { aimSpec, clippedAim } from '../src/game/controls/aim';
import { CLASSES } from '../src/game/classes/catalog';
import { skillVisual } from '../src/game/rendering/skillVisuals';

function arena(classId = 'archer') {
  const sim = new Simulation({ mode: 'hill', classId });
  sim.state.map.obstacles = [];
  sim.player.position = { x: 0, z: 0 };
  const enemies = sim.state.entities.filter((e) => e.team === 'B');
  enemies.forEach((e, i) => {
    e.position = { x: i ? 15 : 0, z: i ? 15 : 5 };
    e.hp = e.maxHp = 5000;
  });
  return { sim, hero: sim.player, enemy: enemies[0] };
}
describe('directional action controls', () => {
  it('fires a manual projectile into empty space without snapping to the nearby enemy', () => {
    const { sim, hero, enemy } = arena();
    sim.combat.attack(hero, undefined, { x: 10, z: 0 });
    expect(sim.state.projectiles[0].targetId).toBeUndefined();
    expect(sim.state.projectiles[0].direction).toEqual({ x: 1, z: 0 });
    for (let i = 0; i < 20; i++) sim.step([]);
    expect(enemy.hp).toBe(enemy.maxHp);
  });
  it('hits along the dragged direction and quick tap still selects a target', () => {
    const { sim, hero, enemy } = arena();
    sim.combat.attack(hero, undefined, { x: 0, z: 11 });
    for (let i = 0; i < 12; i++) sim.step([]);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    hero.attackCooldown = 0;
    sim.combat.attack(hero);
    expect(sim.state.projectiles[0].targetId).toBe(enemy.id);
  });
  it('aims projectile skills without a target and keeps the projectile on that trajectory', () => {
    const { sim, hero, enemy } = arena('firemage');
    expect(sim.combat.cast(hero, 0, undefined, { x: 10, z: 0 })).toBe(true);
    enemy.position = { x: 0, z: 3 };
    sim.step([]);
    expect(sim.state.projectiles[0].direction).toEqual({ x: 1, z: 0 });
    expect(hero.cooldowns[0]).toBeGreaterThan(0);
  });
  it('aimed melee misses enemies outside its lane', () => {
    const { sim, hero, enemy } = arena('guardian');
    enemy.position = { x: 0, z: 2 };
    sim.combat.attack(hero, undefined, { x: 3, z: 0 });
    expect(enemy.hp).toBe(enemy.maxHp);
    hero.attackCooldown = 0;
    sim.combat.attack(hero, undefined, { x: 0, z: 3 });
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });
  it('aimed line ultimate damages its lane, not the nearest enemy to the side', () => {
    const { sim, hero, enemy } = arena('crossbow');
    hero.ultimate = 100;
    enemy.position = { x: 0, z: 2 };
    const lined = sim.state.entities.find((e) => e.id === 'B1')!;
    lined.position = { x: 8, z: 0 };
    sim.combat.cast(hero, 3, undefined, { x: 18, z: 0 });
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(lined.hp).toBeLessThan(lined.maxHp);
  });
  it('consumes a released shot once and cancellation clears pending aim', () => {
    const human = new HumanController(),
      { sim } = arena();
    human.fire({ x: 8, z: 0 });
    expect(human.sample(sim.state)).toMatchObject({ attack: true, aim: { x: 8, z: 0 } });
    expect(human.sample(sim.state).attack).toBe(false);
    human.preview = { index: 3, aim: { x: 3, z: 5 } };
    human.fire({ x: 8, z: 0 });
    human.reset();
    expect(human.preview).toBeUndefined();
    expect(human.sample(sim.state).attack).toBe(false);
  });
  it('clips preview at walls and gives self-centered ultimates an area instead of a false firing lane', () => {
    const { sim, hero } = arena('guardian');
    sim.state.map.obstacles = [{ x: 0, z: 4, w: 4, d: 1, kind: 'wall' }];
    const end = clippedAim(hero.position, { x: 0, z: 10 }, sim.state.map);
    expect(end.z).toBeLessThan(3.5);
    expect(end.z).toBeGreaterThan(3.4);
    expect(aimSpec(hero, 3)).toMatchObject({ shape: 'self', range: 0, radius: 12 });
  });
  it('assigns an explicit non-ring visual to all 60 abilities', () => {
    const styles = CLASSES.flatMap((c) => c.abilities.map((_, i) => skillVisual(c.id, i)));
    expect(styles).toHaveLength(60);
    expect(styles.every(Boolean)).toBe(true);
    expect(new Set(styles).size).toBe(60);
  });
  it('ice basic attacks apply their passive slow on impact, not when the projectile is fired', () => {
    const { sim, hero, enemy } = arena('icemage');
    sim.combat.attack(hero, undefined, { x: 0, z: 8 });
    expect(enemy.statuses.some((s) => s.kind === 'slow')).toBe(false);
    for (let i = 0; i < 8; i++) sim.step([]);
    expect(enemy.statuses.some((s) => s.kind === 'slow' && s.power === 0.15)).toBe(true);
  });
  it('continuous collision hits a target even when a fast bolt crosses it between ticks', () => {
    const { sim, hero, enemy } = arena();
    enemy.position = { x: 0, z: 5 };
    sim.combat.attack(hero, undefined, { x: 0, z: 11 });
    sim.state.projectiles[0].speed = 300;
    sim.state.projectiles[0].remaining = 1;
    sim.step([]);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });
});
