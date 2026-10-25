import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/game/simulation/Simulation';
import { CLASSES, getClass } from '../src/game/classes/catalog';
import { FIXED_DT } from '../src/game/core/types';
import { makeEntity } from '../src/game/teams/roster';
import { updateRules } from '../src/game/modes/rules';

function arena(classId = 'guardian') {
  const sim = new Simulation({ mode: 'hill', classId });
  sim.state.map.obstacles = [];
  sim.state.entities = [sim.player];
  sim.player.position = { x: 0, z: 0 };
  return sim;
}
function advance(sim: Simulation, seconds: number) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += FIXED_DT) sim.combat.update(FIXED_DT);
}
const fire = (sim: Simulation) => sim.combat.attack(sim.player, undefined, { x: 0, z: 8 });

describe('basic attack ammo', () => {
  for (const c of CLASSES) {
    it(`${c.id}: three-shot burst, recovery gate, sequential reload`, () => {
      const sim = arena(c.id),
        p = sim.player;
      for (let i = 0; i < 3; i++) {
        const previous = p.ammo;
        fire(sim);
        expect(p.ammo).toBe(previous - 1);
        fire(sim);
        expect(p.ammo).toBe(previous - 1);
        advance(sim, c.interval);
      }
      expect(p.ammo).toBe(0);
      const casts = sim.state.events.filter((e) => e.type === 'cast' && !e.abilityId).length;
      fire(sim);
      expect(sim.state.events.filter((e) => e.type === 'cast' && !e.abilityId)).toHaveLength(casts);
      advance(sim, c.reloadTime - 0.1);
      expect(p.ammo).toBe(0);
      advance(sim, 0.1);
      expect(p.ammo).toBe(1);
      advance(sim, c.reloadTime);
      expect(p.ammo).toBe(2);
      advance(sim, c.reloadTime);
      expect(p.ammo).toBe(3);
      expect(p.ammoReload).toBe(0);
    });
  }
  it('a shot interrupts the current reload, while moving and casting do not spend ammo', () => {
    const sim = arena(),
      p = sim.player,
      c = getClass(p.classId);
    fire(sim);
    advance(sim, c.interval + c.reloadTime / 2);
    expect(p.ammoReload).toBeGreaterThan(0);
    fire(sim);
    expect(p.ammoReload).toBe(0);
    const ammo = p.ammo;
    sim.combat.move(p, { x: 1, z: 0 }, FIXED_DT);
    sim.combat.cast(p, 1);
    expect(p.ammo).toBe(ammo);
    advance(sim, c.interval + c.reloadTime);
    expect(p.ammo).toBe(ammo + 1);
  });
  it('empty auto-aim and dead attacks spend nothing; monsters retain their attack timer', () => {
    const sim = arena();
    sim.combat.attack(sim.player);
    expect(sim.player.ammo).toBe(3);
    sim.player.alive = false;
    fire(sim);
    expect(sim.player.ammo).toBe(3);
    const monster = makeEntity('monster', 'guardian', 'PVE', { x: 2, z: 2 }, 'BOT');
    monster.kind = 'monster';
    monster.ammo = 0;
    sim.combat.attack(monster, undefined, { x: 2, z: 4 });
    expect(monster.attackCooldown).toBeGreaterThan(0);
  });
  it('respawn restores charges and clears attack recovery', () => {
    const sim = arena(),
      p = sim.player;
    p.ammo = 0;
    p.ammoReload = 0.8;
    p.attackCooldown = 0.4;
    p.alive = false;
    p.respawnAt = 0;
    updateRules(sim.state, FIXED_DT);
    expect(p.ammo).toBe(3);
    expect(p.ammoReload).toBe(0);
    expect(p.attackCooldown).toBe(0);
  });
  it('snapshots retain partial reload progress and migrate older heroes', () => {
    const sim = arena();
    fire(sim);
    advance(sim, 0.8);
    const restored = Simulation.restore(sim.snapshot());
    expect(restored.player.ammo).toBe(sim.player.ammo);
    expect(restored.player.ammoReload).toBe(sim.player.ammoReload);
    const old = JSON.parse(sim.snapshot());
    delete old.entities[0].ammo;
    delete old.entities[0].ammoReload;
    expect(Simulation.restore(JSON.stringify(old)).player.ammo).toBe(3);
  });
});
