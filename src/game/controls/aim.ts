import { getClass } from '../classes/catalog';
import { add, direction, distance, lineClear } from '../core/math';
import type { Entity, GameMap, Vec2 } from '../core/types';

export function aimSpec(actor: Entity, index: number) {
  const c = getClass(actor.classId),
    a = c.abilities[index];
  if (!a)
    return { range: actor.range, radius: actor.range > 5 ? 0.45 : 0.85, shape: 'line' as const };
  const self = a.target === 'self' || a.target === 'team' || a.range === 0;
  const area = a.target === 'ground' && a.radius > 0;
  return {
    range: self ? 0 : a.range,
    radius: a.radius || (self ? 2 : 0.6),
    shape: self ? ('self' as const) : area ? ('area' as const) : ('line' as const),
  };
}
export function clippedAim(from: Vec2, to: Vec2, map: GameMap): Vec2 {
  if (lineClear(from, to, map.obstacles)) return to;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const p = { x: from.x + (to.x - from.x) * mid, z: from.z + (to.z - from.z) * mid };
    if (lineClear(from, p, map.obstacles)) lo = mid;
    else hi = mid;
  }
  return add(from, direction(from, to), Math.max(0, distance(from, to) * lo - 0.04));
}
