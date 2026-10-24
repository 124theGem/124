import type { Simulation } from '../game/simulation/Simulation';
import { add } from '../game/core/math';
import { addHero, makeEntity } from '../game/teams/roster';
import { finish } from '../game/modes/rules';
// Referenced exclusively behind import.meta.env.DEV. Rollup omits this module in production.
const immortal = new WeakSet<Simulation>();
export const isInvulnerable = (sim: Simulation) => immortal.has(sim);
export function debugTick(sim: Simulation) {
  if (immortal.has(sim)) {
    const e = sim.player;
    e.hp = e.maxHp;
    const status = e.statuses.find((t) => t.kind === 'invulnerable');
    if (status) status.remaining = 1;
    else e.statuses.push({ kind: 'invulnerable', remaining: 1, power: 1, source: e.id, tick: 0 });
  }
}
export function debugAction(sim: Simulation, action: string) {
  if (action === 'heal') {
    sim.player.hp = sim.player.maxHp;
    sim.player.resource = 100;
  }
  if (action === 'cooldowns') sim.player.cooldowns = [0, 0, 0, 0];
  if (action === 'ultimate') sim.player.ultimate = 100;
  if (action === 'invulnerable') {
    if (immortal.has(sim)) {
      immortal.delete(sim);
      sim.player.statuses = sim.player.statuses.filter((t) => t.kind !== 'invulnerable');
    } else immortal.add(sim);
  }
  if (action === 'victory') finish(sim.state, 'A');
  if (action === 'enemy') {
    const e = makeEntity(
      `dev-${sim.state.spawnSerial++}`,
      'berserker',
      'PVE',
      add(sim.player.position, { x: 0, z: 1 }, 5),
      'BOT',
      'Тестовый враг',
    );
    e.kind = 'monster';
    sim.state.entities.push(e);
  }
  if (action === 'ally')
    addHero(
      sim.state,
      makeEntity(
        `dev-${sim.state.spawnSerial++}`,
        'priest',
        'A',
        add(sim.player.position, { x: 1, z: 0 }, 2),
        'BOT',
      ),
    );
}
