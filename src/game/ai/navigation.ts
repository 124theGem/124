import { direction, distance, inObstacle, lineClear } from '../core/math';
import type { GameMap, Vec2, Obstacle } from '../core/types';
export function navigable(map: GameMap, p: Vec2, pad = 0.5) {
  return (
    Math.abs(p.x) < map.width / 2 - pad &&
    Math.abs(p.z) < map.depth / 2 - pad &&
    !map.obstacles.some((o) => inObstacle(p, o, pad))
  );
}
export function waypoint(map: GameMap, from: Vec2, to: Vec2): Vec2 {
  const blockers: Obstacle[] = map.obstacles.map((o) => ({
    ...o,
    kind: o.kind === 'river' ? 'wall' : o.kind,
    w: o.w + 1,
    d: o.d + 1,
  }));
  if (lineClear(from, to, blockers)) return to;
  const size = 2,
    key = (p: Vec2) => `${p.x},${p.z}`;
  const start = { x: Math.round(from.x / size), z: Math.round(from.z / size) },
    end = { x: Math.round(to.x / size), z: Math.round(to.z / size) };
  const open = [start],
    came = new Map<string, Vec2>(),
    cost = new Map([[key(start), 0]]),
    closed = new Set<string>();
  let last = start;
  for (let count = 0; open.length && count < 450; count++) {
    open.sort(
      (a, b) => cost.get(key(a))! + distance(a, end) - (cost.get(key(b))! + distance(b, end)),
    );
    const current = open.shift()!;
    last = current;
    if (distance(current, end) < 1.1) break;
    closed.add(key(current));
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const next = { x: current.x + dx, z: current.z + dz },
        world = { x: next.x * size, z: next.z * size },
        curWorld = { x: current.x * size, z: current.z * size };
      if (
        closed.has(key(next)) ||
        !navigable(map, world, 0.75) ||
        !lineClear(curWorld, world, blockers)
      )
        continue;
      const n = cost.get(key(current))! + Math.hypot(dx, dz);
      if (n < (cost.get(key(next)) ?? Infinity)) {
        cost.set(key(next), n);
        came.set(key(next), current);
        if (!open.some((p) => key(p) === key(next))) open.push(next);
      }
    }
  }
  while (came.has(key(last)) && key(came.get(key(last))!) !== key(start))
    last = came.get(key(last))!;
  return { x: last.x * size, z: last.z * size };
}
export function navigate(map: GameMap, from: Vec2, to: Vec2) {
  return direction(from, waypoint(map, from, to));
}
