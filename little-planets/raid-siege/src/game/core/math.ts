import type { Vec2, Obstacle } from './types';
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export const normalize = (v: Vec2): Vec2 => {
  const d = Math.hypot(v.x, v.z);
  return d ? { x: v.x / d, z: v.z / d } : { x: 0, z: 0 };
};
export const direction = (a: Vec2, b: Vec2) => normalize({ x: b.x - a.x, z: b.z - a.z });
export const add = (a: Vec2, b: Vec2, scale = 1) => ({
  x: a.x + b.x * scale,
  z: a.z + b.z * scale,
});
export const inObstacle = (p: Vec2, o: Obstacle, pad = 0) =>
  Math.abs(p.x - o.x) < o.w / 2 + pad && Math.abs(p.z - o.z) < o.d / 2 + pad;
export function lineClear(a: Vec2, b: Vec2, obstacles: Obstacle[]): boolean {
  // Segment/AABB slabs: continuous checks also block fast projectiles through thin walls.
  return !obstacles.some((o) => {
    let lo = 0,
      hi = 1;
    for (const [v, d, c, half] of [
      [a.x, b.x - a.x, o.x, o.w / 2],
      [a.z, b.z - a.z, o.z, o.d / 2],
    ]) {
      if (Math.abs(d) < 1e-8) {
        if (v < c - half || v > c + half) return false;
      } else {
        const t1 = (c - half - v) / d,
          t2 = (c + half - v) / d;
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
        if (lo > hi) return false;
      }
    }
    return true;
  });
}
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
