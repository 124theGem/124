import { getClass } from '../classes/catalog';
import { add, direction, distance, lineClear } from '../core/math';
import type { Entity, GameMap, Vec2 } from '../core/types';

export interface AimSpec {
  range: number;
  radius: number;
  shape: 'line' | 'cone' | 'area' | 'self' | 'wall';
  lob: boolean;
  arc: number;
}
/** Shared dimensions for the damage resolver and its on-ground preview. */
export function basicAttackSpec(actor: Entity): AimSpec {
  if (actor.classId === 'demolitionist')
    return { range: actor.range, radius: 2.8, shape: 'area', lob: true, arc: 0 };
  const cone = actor.range <= 5 && getClass(actor.classId).weapon !== 'spear';
  return {
    range: actor.range,
    radius: actor.range > 5 ? 0.75 : 0.85,
    shape: cone ? 'cone' : 'line',
    lob: false,
    arc: Math.PI * 0.65,
  };
}
export function inCone(from: Vec2, facing: Vec2, target: Vec2, range: number, arc: number) {
  const length = distance(from, target);
  if (length > range) return false;
  if (length < 0.001) return true;
  const dir = direction(from, target);
  return dir.x * facing.x + dir.z * facing.z >= Math.cos(arc / 2);
}
export function aimSpec(actor: Entity, index: number): AimSpec {
  const a = getClass(actor.classId).abilities[index];
  if (!a) return basicAttackSpec(actor);
  if (a.delivery === 'wall') return { range: 2.3, radius: 4.5, shape: 'wall', lob: false, arc: 0 };
  if (a.delivery === 'repulse') return { range: 0, radius: 4.5, shape: 'self', lob: false, arc: 0 };
  const self = a.target === 'self' || a.target === 'team' || a.range === 0;
  const area = a.target === 'ground' && a.radius > 0;
  return {
    range: self ? 0 : a.range,
    radius: a.radius || (self ? 1 : a.target === 'enemy' || a.target === 'ally' ? 0.85 : 0.6),
    lob: a.delivery === 'jump' || a.delivery === 'mines',
    arc: a.arc ?? Math.PI / 2,
    shape: a.shape === 'cone' ? 'cone' : self ? 'self' : area ? 'area' : 'line',
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
