import type { MatchState, Team, Vec2 } from '../core/types';
import { clamp, distance } from '../core/math';
import { getClass } from '../classes/catalog';
export const MODE_NAMES = { raid: 'Рейд', siege: 'Осада', hill: 'Царь горы' };
export function finish(s: MatchState, winner: Team | 'draw') {
  if (s.status === 'finished') return;
  s.status = 'finished';
  s.winner = winner;
  for (const e of s.entities)
    if (e.alive) {
      e.animation = 'victory';
      e.animationSerial++;
    }
  if (s.mode === 'raid' && winner === 'A') s.chest = { ...s.map.spawns.B };
}
export function safeSpawn(s: MatchState, team: 'A' | 'B'): Vec2 {
  let base = s.map.spawns[team];
  if (s.mode === 'siege') {
    const index = s.points.findIndex((p) => p.owner !== 'A');
    const z = s.points[Math.max(0, index)]?.position.z ?? 23;
    base = { x: team === 'A' ? -4 : 4, z: z + (team === 'A' ? -11 : 10) };
  }
  if (s.mode === 'hill' && s.points[0].owner === team) base = { x: 0, z: team === 'A' ? -10 : 10 };
  const unsafe = s.entities.some(
    (e) => e.alive && e.team !== team && distance(e.position, base) < 6,
  );
  return unsafe ? s.map.spawns[team] : base;
}
export function updateRules(s: MatchState, dt: number) {
  if (s.mode === 'raid') {
    const heroes = s.entities.filter((e) => e.kind === 'hero');
    if (heroes.every((e) => !e.alive)) {
      finish(s, 'PVE');
      return;
    }
    const boss = s.entities.find((e) => e.kind === 'boss');
    if (boss && !boss.alive) finish(s, 'A');
    if (s.time >= s.timeLimit) finish(s, 'PVE');
    return;
  }
  for (const e of s.entities.filter(
    (e) => !e.alive && e.kind === 'hero' && e.respawnAt <= s.time,
  )) {
    const spawn = safeSpawn(s, e.team as 'A' | 'B');
    e.position = { x: spawn.x + (Number(e.id.slice(-1)) || 0) * 1.4 - 1.4, z: spawn.z };
    e.previous = { ...e.position };
    e.hp = e.maxHp;
    e.resource = 100;
    e.shield = 0;
    e.alive = true;
    e.ammo = getClass(e.classId).ammoCapacity;
    e.ammoReload = 0;
    e.attackCooldown = 0;
    e.statuses = [{ kind: 'invulnerable', power: 1, remaining: 2, source: e.id, tick: 0 }];
    e.animation = 'idle';
    e.animationUntil = s.time;
    e.revived = false;
  }
  for (const p of s.points) {
    if (p.locked) continue;
    const alive = s.entities.filter(
      (e) => e.kind === 'hero' && e.alive && distance(e.position, p.position) <= p.radius,
    );
    const a = alive.some((e) => e.team === 'A'),
      b = alive.some((e) => e.team === 'B');
    p.contested = a && b;
    if (p.contested) continue;
    const team = a ? 'A' : b ? 'B' : null;
    p.capturing = team;
    if (!team) continue;
    if (s.mode === 'siege' && p.owner === 'A') continue;
    if (s.mode === 'siege' && team === 'B') {
      p.progress = Math.max(0, p.progress - dt * 0.025);
      continue;
    }
    if (p.owner === team) continue;
    p.progress = clamp(p.progress + dt * (p.owner ? -0.16 : 0.13), 0, 1);
    for (const e of alive.filter((e) => e.team === team)) e.stats.capture += dt;
    if (p.owner && p.progress <= 0) {
      p.owner = null;
      p.progress = 0;
    } else if (!p.owner && p.progress >= 1) {
      p.owner = team;
      if (s.mode === 'siege') {
        const index = s.points.indexOf(p);
        s.score.A = index + 1;
        if (index === 2) {
          finish(s, 'A');
          return;
        }
        s.points[index + 1].locked = false;
      }
    }
  }
  if (s.mode === 'hill') {
    const p = s.points[0];
    if (p.owner === 'A' || p.owner === 'B') s.score[p.owner] += 2 * dt;
    if (s.score.A >= 300) {
      finish(s, 'A');
      return;
    }
    if (s.score.B >= 300) {
      finish(s, 'B');
      return;
    }
    if (s.time >= s.timeLimit) {
      if (Math.abs(s.score.A - s.score.B) > 0.01) finish(s, s.score.A > s.score.B ? 'A' : 'B');
      else if (!s.overtime) {
        s.overtime = true;
        s.timeLimit += 30;
      } else finish(s, 'draw');
    }
  } else if (s.time >= s.timeLimit) finish(s, 'B');
}
