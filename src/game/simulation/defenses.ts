import type { MatchState, Team, Vec2 } from '../core/types';
import { distance } from '../core/math';
/** Arena boundaries block exit; shield walls block attacks arriving from their front. */
export function arenaAllowsMove(state: MatchState, from: Vec2, to: Vec2) {
  return !state.zones.some(
    (z) =>
      z.arena &&
      z.delay <= 0 &&
      z.remaining > 0 &&
      distance(from, z.position) <= z.radius + 0.05 &&
      distance(to, z.position) > z.radius - 0.45 &&
      distance(to, z.position) > distance(from, z.position) + 0.00001,
  );
}
export function barrierBlocks(state: MatchState, team: Team, from: Vec2, to: Vec2) {
  return state.zones.some((z) => {
    if (!z.barrier || z.team === team || z.delay > 0 || z.remaining <= 0) return false;
    const nx = Math.sin(z.barrier.facing),
      nz = Math.cos(z.barrier.facing);
    const front = (from.x - z.position.x) * nx + (from.z - z.position.z) * nz;
    const back = (to.x - z.position.x) * nx + (to.z - z.position.z) * nz;
    if (front <= 0.01 || back > 0.01) return false;
    const t = front / (front - back),
      x = from.x + (to.x - from.x) * t - z.position.x,
      zp = from.z + (to.z - from.z) * t - z.position.z;
    return Math.abs(x * nz - zp * nx) <= z.barrier.width / 2;
  });
}
