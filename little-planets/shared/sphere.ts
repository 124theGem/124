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
