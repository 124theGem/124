import { PLANETS, ship, type PlanetId } from "./catalog";
import {
  cubeUp,
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
  return Math.round(sphereRadius(id) * 2);
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
export function naturalVoxelLevel(n: Vec, id: PlanetId) {
  // A level perimeter joins all six face grids at the exact same physical edge.
  // Without this, independently extruded faces leave a gap and teleport feet at seams.
  const cell = voxelCell(n, id),
    steps = voxelResolution(id),
    edge = Math.min(cell.i, cell.j, steps - 1 - cell.i, steps - 1 - cell.j);
  if (edge === 0) return 0;

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
    Math.min(
      MAX_TERRAIN_HEIGHT,
      edge * VOXEL_STEP * 2,
      Math.round(height / VOXEL_STEP) * VOXEL_STEP,
    ),
  );
}
// Runtime surface data is scoped by planet; server rules always pass explicit edits.
export type TerrainEdits = Record<
  string,
  {
    height: number;
    material: string;
    blocks?: Record<string, string>;
    removed?: number[];
  }
>;
const activeEdits = new Map<PlanetId, TerrainEdits>();
export function setTerrainEdits(id: PlanetId, edits: TerrainEdits) {
  activeEdits.set(id, edits);
}
export function cellKey(n: Vec, id: PlanetId) {
  const c = voxelCell(n, id);
  return `${c.face}:${c.i}:${c.j}`;
}
export function voxelLevel(n: Vec, id: PlanetId, edits = activeEdits.get(id)) {
  return edits?.[cellKey(n, id)]?.height ?? naturalVoxelLevel(n, id);
}
export function terrainSurfaceHeight(p: Point, id: PlanetId) {
  return voxelLevel(voxelCell(sphereNormal(p, id), id).normal, id);
}
export function surfacePoint(p: Point, id: PlanetId): Vec {
  const n = sphereNormal(p, id),
    up = cubeUp(n),
    r = sphereRadius(id),
    scale = r / Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)),
    h = terrainSurfaceHeight(p, id);
  return {
    x: n.x * scale + up.x * h,
    y: n.y * scale + up.y * h,
    z: n.z * scale + up.z * h,
  };
}
/** Convert a physical point on a known face back to the face's base-grid coordinates. */
export function surfaceCoordinates(
  q: Vec,
  id: PlanetId,
  faceUp = cubeUp(q),
): Point {
  const r = sphereRadius(id),
    p = { ...q };
  for (const axis of ["x", "y", "z"] as const)
    if (faceUp[axis]) p[axis] = faceUp[axis] * r;
  return sphereCoordinates(p, id);
}
export function sanctuaryPoint(id: PlanetId) {
  return offsetPoint(ship(id), -6.2, -9, id);
}
export function surfaceHeight(p: Point, id: PlanetId) {
  return terrainSurfaceHeight(p, id);
}
export function surfaceRadius(p: Point, id: PlanetId) {
  const q = surfacePoint(p, id);
  return Math.hypot(q.x, q.y, q.z);
}

export function terrainMaterial(n: Vec, id: PlanetId) {
  return activeEdits.get(id)?.[cellKey(n, id)]?.material;
}

export function blockSolid(
  n: Vec,
  id: PlanetId,
  level: number,
  edits = activeEdits.get(id),
): boolean {
  const edit = edits?.[cellKey(n, id)],
    natural = Math.round(naturalVoxelLevel(n, id) / VOXEL_STEP);
  if (level <= -4) return true;
  if (edit?.removed?.includes(level)) return false;
  return level <= natural || !!edit?.blocks?.[String(level)];
}
export function blockMaterial(
  n: Vec,
  id: PlanetId,
  level: number,
  edits = activeEdits.get(id),
) {
  return edits?.[cellKey(n, id)]?.blocks?.[String(level)] ?? "stone";
}
export function columnEdits(id: PlanetId) {
  return activeEdits.get(id);
}
