import {
  TEAM_LIMIT,
  emptyStats,
  type ControllerType,
  type Entity,
  type MatchState,
  type Team,
  type Vec2,
} from '../core/types';
import { getClass } from '../classes/catalog';
export function makeEntity(
  id: string,
  classId: string,
  team: Team,
  position: Vec2,
  controller: ControllerType,
  name?: string,
): Entity {
  const c = getClass(classId);
  return {
    id,
    participantId: id,
    classId,
    name: name ?? c.name,
    team,
    controller,
    connected: true,
    kind: 'hero',
    position: { ...position },
    previous: { ...position },
    home: { ...position },
    facing: team === 'B' ? Math.PI : 0,
    hp: c.hp,
    maxHp: c.hp,
    resource: 100,
    maxResource: 100,
    shield: 0,
    attack: c.attack,
    armor: c.armor,
    resist: c.resist,
    speed: c.speed,
    range: c.range,
    interval: c.interval,
    cooldowns: [0, 0, 0],
    attackCooldown: 0,
    ammo: c.ammoCapacity,
    ammoReload: 0,
    dodgeCooldown: 0,
    ultimate: 30,
    statuses: [],
    animation: 'idle',
    animationUntil: 0,
    animationSerial: 0,
    alive: true,
    respawnAt: 0,
    lifetime: -1,
    revived: false,
    aiState: 'Idle',
    combo: 0,
    stats: emptyStats(),
  };
}
export function addHero(state: MatchState, hero: Entity): void {
  if (hero.kind !== 'hero' || hero.team === 'PVE') throw new Error('Invalid hero slot');
  if (state.entities.some((e) => e.id === hero.id)) throw new Error('Duplicate slot');
  if (state.entities.filter((e) => e.kind === 'hero' && e.team === hero.team).length >= TEAM_LIMIT)
    throw new Error('В команде максимум 3 героя');
  if (
    hero.controller === 'HUMAN_LOCAL' &&
    state.entities.some((e) => e.controller === 'HUMAN_LOCAL')
  )
    throw new Error('Only one local player');
  state.entities.push(hero);
}
export function replaceController(
  state: MatchState,
  id: string,
  controller: ControllerType,
  participantId: string,
) {
  if (state.time > 0 && state.status === 'playing')
    throw new Error('Controller changes are allowed between matches only');
  const entity = state.entities.find((e) => e.id === id && e.kind === 'hero');
  if (!entity) throw new Error('Unknown slot');
  if (
    controller === 'HUMAN_LOCAL' &&
    state.entities.some((e) => e.id !== id && e.controller === controller)
  )
    throw new Error('Only one local player');
  entity.controller = controller;
  entity.participantId = participantId;
}
