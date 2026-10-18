import { planetSize } from "./catalog";
export type Point = { x: number; z: number };
export type Vec = { x: number; y: number; z: number };
export const SPHERE_RADIUS = 120 / (2 * Math.PI);
export function sphereNormal(p: Point): Vec {
  const lon = (p.x / 120) * Math.PI * 2,
    lat = (p.z / 60) * Math.PI;
  return {
    x: Math.cos(lon) * Math.sin(lat),
    y: Math.cos(lat),
    z: Math.sin(lon) * Math.sin(lat),
  };
}
export function sphereCoordinates(n: Vec): Point {
  const len = Math.hypot(n.x, n.y, n.z);
  return {
    x: ((((Math.atan2(n.z, n.x) / (2 * Math.PI)) * 120) % 120) + 120) % 120,
    z: (Math.acos(Math.max(-1, Math.min(1, n.y / len))) / Math.PI) * 60,
  };
}
export function surfaceDistance(a: Point, b: Point, sphere = false) {
  if (!sphere) return Math.hypot(a.x - b.x, a.z - b.z);
  const n = sphereNormal(a),
    m = sphereNormal(b);
  return (
    Math.acos(Math.max(-1, Math.min(1, n.x * m.x + n.y * m.y + n.z * m.z))) *
    SPHERE_RADIUS
  );
}
/** Exact geodesic step; no seam clamp or pole singularity. Direction is projected onto the tangent plane. */
export function sphereStep(p: Point, direction: Vec, distance: number): Point {
  const n = sphereNormal(p),
    dot = n.x * direction.x + n.y * direction.y + n.z * direction.z;
  const t = {
      x: direction.x - dot * n.x,
      y: direction.y - dot * n.y,
      z: direction.z - dot * n.z,
    },
    len = Math.hypot(t.x, t.y, t.z);
  if (len < 1e-10) return { ...p };
  const angle = distance / SPHERE_RADIUS,
    c = Math.cos(angle),
    s = Math.sin(angle) / len;
  return sphereCoordinates({
    x: n.x * c + t.x * s,
    y: n.y * c + t.y * s,
    z: n.z * c + t.z * s,
  });
}
