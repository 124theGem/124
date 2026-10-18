import { planetSize, type PlanetId } from "./catalog";
export type Point = { x: number; z: number };
export type Vec = { x: number; y: number; z: number };
export const SPHERE_RADIUS = 120 / (2 * Math.PI);
export function sphereRadius(p: PlanetId = "orbis") {
  return planetSize(p) / (2 * Math.PI);
}
export function sphereNormal(p: Point, planet: PlanetId = "orbis"): Vec {
  const circumference = planetSize(planet),
    lon = (p.x / circumference) * Math.PI * 2,
    lat = (p.z / (circumference / 2)) * Math.PI;
  return {
    x: Math.cos(lon) * Math.sin(lat),
    y: Math.cos(lat),
    z: Math.sin(lon) * Math.sin(lat),
  };
}
export function sphereCoordinates(n: Vec, planet: PlanetId = "orbis"): Point {
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
  const id = sphere === true ? "orbis" : sphere,
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
  planet: PlanetId = "orbis",
): Point {
  const n = sphereNormal(p, planet),
    dot = n.x * direction.x + n.y * direction.y + n.z * direction.z,
    t = {
      x: direction.x - dot * n.x,
      y: direction.y - dot * n.y,
      z: direction.z - dot * n.z,
    },
    len = Math.hypot(t.x, t.y, t.z);
  if (len < 1e-10) return { ...p };
  const a = distance / sphereRadius(planet),
    c = Math.cos(a),
    s = Math.sin(a) / len;
  return sphereCoordinates(
    { x: n.x * c + t.x * s, y: n.y * c + t.y * s, z: n.z * c + t.z * s },
    planet,
  );
}
