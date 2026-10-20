import { planetSize, type PlanetId } from "./catalog";
export type Point = { x: number; z: number };
export type Vec = { x: number; y: number; z: number };
export const SPHERE_RADIUS = 19;
export function sphereRadius(p: PlanetId = "home") {
  return planetSize(p) / 2;
}
export function sphereNormal(p: Point, planet: PlanetId = "home"): Vec {
  const circumference = planetSize(planet),
    lon = (p.x / circumference) * Math.PI * 2,
    lat = (p.z / (circumference / 2)) * Math.PI;
  return {
    x: Math.cos(lon) * Math.sin(lat),
    y: Math.cos(lat),
    z: Math.sin(lon) * Math.sin(lat),
  };
}
export function sphereCoordinates(n: Vec, planet: PlanetId = "home"): Point {
  const len = Math.hypot(n.x, n.y, n.z),
    size = planetSize(planet);
  return {
    x: ((((Math.atan2(n.z, n.x) / (2 * Math.PI)) * size) % size) + size) % size,
    z: (Math.acos(Math.max(-1, Math.min(1, n.y / len))) / Math.PI) * (size / 2),
  };
}
export function surfaceDistance(
  a: Point,
  b: Point,
  sphere: boolean | PlanetId = false,
) {
  if (!sphere) return Math.hypot(a.x - b.x, a.z - b.z);
  const id = sphere === true ? "home" : sphere,
    n = sphereNormal(a, id),
    m = sphereNormal(b, id);
  return (
    Math.acos(Math.max(-1, Math.min(1, n.x * m.x + n.y * m.y + n.z * m.z))) *
    sphereRadius(id)
  );
}
export function sphereStep(
  p: Point,
  direction: Vec,
  distance: number,
  planet: PlanetId = "home",
): Point {
  const n = sphereNormal(p, planet),
    up = cubeUp(n),
    r = sphereRadius(planet);
  const scale = r / Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
  const q = { x: n.x * scale, y: n.y * scale, z: n.z * scale };
  const d = direction.x * up.x + direction.y * up.y + direction.z * up.z;
  const t = {
    x: direction.x - d * up.x,
    y: direction.y - d * up.y,
    z: direction.z - d * up.z,
  };
  const l = Math.hypot(t.x, t.y, t.z);
  if (l < 1e-9) return { ...p };
  for (const k of ["x", "y", "z"] as const) q[k] += (t[k] * distance) / l;
  // Fold excess travel around the shared cube edge, preserving the distance.
  for (const k of ["x", "y", "z"] as const)
    if (Math.abs(q[k]) > r + 1e-9) {
      const excess = Math.abs(q[k]) - r;
      q[k] = Math.sign(q[k]) * r;
      for (const a of ["x", "y", "z"] as const)
        if (up[a]) q[a] = up[a] * (r - excess);
    }
  return sphereCoordinates(q, planet);
}
/** Physical gravity is perpendicular to a cube face, never radial. */
export function cubeUp(n: Vec): Vec {
  const a = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)],
    m = Math.max(...a);
  return a[0] === m
    ? { x: Math.sign(n.x), y: 0, z: 0 }
    : a[1] === m
      ? { x: 0, y: Math.sign(n.y), z: 0 }
      : { x: 0, y: 0, z: Math.sign(n.z) };
}

/** A position-dependent visual gravity field: an edge has two equal normals, a vertex three.
 * It stops exactly where the player stops instead of finishing a time-triggered 90° turn. */
export function cubeVisualUp(p: Point, id: PlanetId = "home", margin = 2): Vec {
  const n = sphereNormal(p, id),
    r = sphereRadius(id),
    scale = r / Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
  const weight = (v: number) => {
    const t = Math.max(
      0,
      Math.min(1, (Math.abs(v * scale) - (r - margin)) / margin),
    );
    return Math.sign(v) * t * t * (3 - 2 * t);
  };
  const q = { x: weight(n.x), y: weight(n.y), z: weight(n.z) },
    length = Math.hypot(q.x, q.y, q.z);
  return { x: q.x / length, y: q.y / length, z: q.z / length };
}

/** Route over adjacent cube faces; projecting a distant target directly can trap an actor on the opposite face. */
export function cubeRouteDirection(from: Point, to: Point, id: PlanetId): Vec {
  const a = sphereNormal(from, id),
    b = sphereNormal(to, id),
    up = cubeUp(a),
    goalUp = cubeUp(b),
    r = sphereRadius(id);
  const scaleA = r / Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z)),
    scaleB = r / Math.max(Math.abs(b.x), Math.abs(b.y), Math.abs(b.z));
  const q = { x: a.x * scaleA, y: a.y * scaleA, z: a.z * scaleA },
    target = { x: b.x * scaleB, y: b.y * scaleB, z: b.z * scaleB };
  const axes = ["x", "y", "z"] as const,
    axis = axes.find((k) => up[k])!,
    goalAxis = axes.find((k) => goalUp[k])!;
  if (axis !== goalAxis) target[goalAxis] = goalUp[goalAxis] * r * 1.05;
  else if (up[axis] !== goalUp[axis]) {
    const choices = axes
        .filter((k) => k !== axis)
        .sort((i, j) => Math.abs(target[j]) - Math.abs(target[i])),
      edge = choices[0];
    target[edge] = (Math.sign(target[edge]) || 1) * r * 1.05;
  }
  return { x: target.x - q.x, y: target.y - q.y, z: target.z - q.z };
}
