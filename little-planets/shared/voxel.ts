import { PLANETS, ship, type PlanetId } from "./catalog";
import {
  sphereNormal,
  sphereCoordinates,
  sphereRadius,
  type Point,
  type Vec,
} from "./sphere";

export const VOXEL_STEP = 0.45;
export const MAX_TERRAIN_HEIGHT = 6.3;
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const normal = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
export function voxelResolution(id: PlanetId) {
  return Math.max(30, Math.min(52, Math.round(sphereRadius(id) * 1.8)));
}
export function cubeNormal(face: number, u: number, v: number): Vec {
  return normal(
    [
      { x: 1, y: v, z: -u },
      { x: -1, y: v, z: u },
      { x: u, y: 1, z: -v },
      { x: u, y: -1, z: v },
      { x: u, y: v, z: 1 },
      { x: -u, y: v, z: -1 },
    ][face],
  );
}
export function voxelCell(n: Vec, id: PlanetId) {
  const ax = Math.abs(n.x),
    ay = Math.abs(n.y),
    az = Math.abs(n.z),
    steps = voxelResolution(id);
  let face: number, u: number, v: number;
  if (ax >= ay && ax >= az) {
    face = n.x >= 0 ? 0 : 1;
    u = (n.x >= 0 ? -n.z : n.z) / ax;
    v = n.y / ax;
  } else if (ay >= az) {
    face = n.y >= 0 ? 2 : 3;
    u = n.x / ay;
    v = (n.y >= 0 ? -n.z : n.z) / ay;
  } else {
    face = n.z >= 0 ? 4 : 5;
    u = (n.z >= 0 ? n.x : -n.x) / az;
    v = n.y / az;
  }
  const i = Math.max(0, Math.min(steps - 1, Math.floor(((u + 1) * steps) / 2))),
    j = Math.max(0, Math.min(steps - 1, Math.floor(((v + 1) * steps) / 2)));
  return {
    face,
    i,
    j,
    normal: cubeNormal(
      face,
      -1 + ((i + 0.5) * 2) / steps,
      -1 + ((j + 0.5) * 2) / steps,
    ),
  };
}
function hash(x: number, y: number, z: number, seed: number) {
  let n =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 2147483647) ^
    seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t),
  mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function noise3(x: number, y: number, z: number, seed = 0) {
  const a = Math.floor(x),
    b = Math.floor(y),
    c = Math.floor(z),
    u = smooth(x - a),
    v = smooth(y - b),
    w = smooth(z - c);
  return mix(
    mix(
      mix(hash(a, b, c, seed), hash(a + 1, b, c, seed), u),
      mix(hash(a, b + 1, c, seed), hash(a + 1, b + 1, c, seed), u),
      v,
    ),
    mix(
      mix(hash(a, b, c + 1, seed), hash(a + 1, b, c + 1, seed), u),
      mix(hash(a, b + 1, c + 1, seed), hash(a + 1, b + 1, c + 1, seed), u),
      v,
    ),
    w,
  );
}
/** Tangent coordinates around the landing clearing, continuous at longitude seams. */
export function clearingCoordinates(n: Vec, id: PlanetId) {
  const pad = sphereNormal(ship(id), id),
    lon = (ship(id).x / (sphereRadius(id) * 2 * Math.PI)) * Math.PI * 2,
    east = { x: -Math.sin(lon), y: 0, z: Math.cos(lon) },
    south = {
      x: pad.y * Math.cos(lon),
      y: -Math.hypot(pad.x, pad.z),
      z: pad.y * Math.sin(lon),
    },
    r = sphereRadius(id);
  return { x: dot(n, east) * r, z: dot(n, south) * r, front: dot(n, pad) };
}
export function offsetPoint(
  p: Point,
  x: number,
  z: number,
  id: PlanetId,
): Point {
  const n = sphereNormal(p, id),
    lon = (p.x / (sphereRadius(id) * 2 * Math.PI)) * Math.PI * 2,
    e = { x: -Math.sin(lon), y: 0, z: Math.cos(lon) },
    s = {
      x: n.y * Math.cos(lon),
      y: -Math.hypot(n.x, n.z),
      z: n.y * Math.sin(lon),
    },
    distance = Math.hypot(x, z);
  if (!distance) return { ...p };
  const a = distance / sphereRadius(id),
    f = Math.sin(a) / distance;
  return sphereCoordinates(
    {
      x: n.x * Math.cos(a) + (e.x * x + s.x * z) * f,
      y: n.y * Math.cos(a) + (e.y * x + s.y * z) * f,
      z: n.z * Math.cos(a) + (e.z * x + s.z * z) * f,
    },
    id,
  );
}
export function voxelLevel(n: Vec, id: PlanetId) {
  const r = sphereRadius(id),
    seed = PLANETS[id].seed ?? 71,
    p = { x: n.x * r, y: n.y * r, z: n.z * r },
    broad = noise3(p.x * 0.13, p.y * 0.13, p.z * 0.13, seed),
    detail = noise3(p.x * 0.38, p.y * 0.38, p.z * 0.38, seed + 13),
    ridge = noise3(p.x * 0.07 + 17, p.y * 0.07 - 9, p.z * 0.07, seed + 51);
  let height =
    0.45 +
    Math.max(0, broad - 0.22) * 6.4 +
    detail * 0.8 +
    Math.max(0, ridge - 0.58) * 7;
  const uv = clearingCoordinates(n, id);
  if (uv.front > 0.55) {
    const d = Math.hypot(uv.x, uv.z);
    if (d < 4.7) height = 1.35;
    else if (d < 8) height = mix(1.35, height, smooth((d - 4.7) / 3.3));
    // The sanctuary stands on an actual plateau. A broad staircase approaches its floor.
    if (uv.x > -10.8 && uv.x < -1.8 && uv.z > -13.2 && uv.z < -5.5)
      height = 4.05;
    if (uv.x > -7.4 && uv.x < -3.2 && uv.z >= -5.5 && uv.z < -0.8)
      height =
        1.35 +
        Math.max(0, Math.min(6, Math.floor((-uv.z - 0.8) / 0.78))) * VOXEL_STEP;
    // Exposed river gorge beside the plateau gives the diorama its vertical depth.
    if (uv.x > 5.5 && uv.x < 12 && uv.z > -9 && uv.z < 5) height = 0.45;
  }
  return Math.max(
    VOXEL_STEP,
    Math.min(MAX_TERRAIN_HEIGHT, Math.round(height / VOXEL_STEP) * VOXEL_STEP),
  );
}
export function terrainSurfaceHeight(p: Point, id: PlanetId) {
  const n = sphereNormal(p, id),
    cell = voxelCell(n, id),
    r = sphereRadius(id),
    level = voxelLevel(cell.normal, id);
  return (r + level) / dot(n, cell.normal) - r;
}
export function sanctuaryPoint(id: PlanetId) {
  return offsetPoint(ship(id), -6.2, -9, id);
}
const decks = new Map<
  PlanetId,
  { normal: Vec; right: Vec; forward: Vec; radius: number }
>();
/** Solid paving is a rigid tangent deck above the voxel terrace. Feet and picking share it. */
export function surfaceHeight(p: Point, id: PlanetId) {
  const base = terrainSurfaceHeight(p, id),
    n = sphereNormal(p, id),
    r = sphereRadius(id);
  let deck = decks.get(id);
  if (!deck) {
    const point = sanctuaryPoint(id),
      normal = sphereNormal(point, id),
      d = Math.sqrt(2 * (1 + normal.y)),
      qx = normal.z / d,
      qz = -normal.x / d,
      qw = d / 2;
    deck = {
      normal,
      right: { x: 1 - 2 * qz * qz, y: 2 * qw * qz, z: 2 * qx * qz },
      forward: { x: 2 * qx * qz, y: -2 * qw * qx, z: 1 - 2 * qx * qx },
      radius: r + terrainSurfaceHeight(point, id),
    };
    decks.set(id, deck);
  }
  const facing = dot(n, deck.normal);
  if (facing < 0.94) return base;
  const distance = (deck.radius + 0.2) / facing,
    delta = {
      x: n.x * distance - deck.normal.x * deck.radius,
      y: n.y * distance - deck.normal.y * deck.radius,
      z: n.z * distance - deck.normal.z * deck.radius,
    },
    x = dot(delta, deck.right),
    z = dot(delta, deck.forward);
  if (
    Math.abs(x) < 2.995 &&
    Math.abs(z) < 2.995 &&
    !(x < -2.15 && z > 2.15) &&
    !(x > 2.15 && z < -2.15)
  )
    return Math.max(base, distance - r);
  return base;
}
export function surfaceRadius(p: Point, id: PlanetId) {
  return sphereRadius(id) + surfaceHeight(p, id);
}
