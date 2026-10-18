import * as T from "three";
import { PLANETS, type PlanetId } from "../../shared/catalog";
import { THEME_COLORS, terrainSeed } from "../../shared/surface";
import { sphereRadius } from "../../shared/sphere";
/** Independent, flat-colored quads on six normalized cube faces: square tiles remain legible at poles. */
export function tiledSphere(id: PlanetId, resolution?: number) {
  const radius = sphereRadius(id),
    steps = resolution ?? Math.max(26, Math.min(56, Math.round(radius * 2))),
    positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [],
    palette = THEME_COLORS[PLANETS[id].sphereTheme ?? "meadow"];
  const point = (face: number, u: number, v: number) => {
    const p = [
      new T.Vector3(1, v, -u),
      new T.Vector3(-1, v, u),
      new T.Vector3(u, 1, -v),
      new T.Vector3(u, -1, v),
      new T.Vector3(u, v, 1),
      new T.Vector3(-u, v, -1),
    ][face];
    return p.normalize().multiplyScalar(radius + 0.018);
  };
  for (let face = 0; face < 6; face++)
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const inset = 0.012,
          a = -1 + (2 * (i + inset)) / steps,
          b = -1 + (2 * (i + 1 - inset)) / steps,
          c = -1 + (2 * (j + inset)) / steps,
          d = -1 + (2 * (j + 1 - inset)) / steps,
          corners = [
            point(face, a, c),
            point(face, b, c),
            point(face, b, d),
            point(face, a, d),
          ],
          center = corners
            .reduce((a, b) => a.add(b), new T.Vector3())
            .multiplyScalar(0.25),
          n = center.clone().normalize(),
          seed = terrainSeed(
            face * 997 + i * 47 + j * 131 + (PLANETS[id].seed ?? 23),
          ),
          pattern =
            Math.sin(n.x * 9 + n.y * 5) * Math.cos(n.z * 7) +
            Math.sin(n.y * 12 + n.z * 3) * 0.5,
          index =
            Math.abs(Math.floor(pattern * 3 + (seed % 3))) % palette.length,
          color = new T.Color(palette[index]).multiplyScalar(
            0.95 + (seed % 11) * 0.01,
          ),
          base = positions.length / 3;
        for (const p of corners) {
          positions.push(p.x, p.y, p.z);
          normals.push(n.x, n.y, n.z);
          colors.push(color.r, color.g, color.b);
        }
        const cross = new T.Vector3().crossVectors(
          new T.Vector3().subVectors(corners[1], corners[0]),
          new T.Vector3().subVectors(corners[2], corners[0]),
        );
        if (cross.dot(n) > 0)
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, tiles: 6 * steps * steps };
}
