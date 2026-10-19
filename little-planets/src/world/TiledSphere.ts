import * as T from "three";
import { PLANETS, type PlanetId } from "../../shared/catalog";
import { THEME_COLORS, terrainSeed } from "../../shared/surface";
import { sphereRadius } from "../../shared/sphere";
import {
  cubeNormal,
  voxelResolution,
  voxelLevel,
  voxelCell,
  clearingCoordinates,
  noise3,
} from "../../shared/voxel";
/** Solid terraced cube-sphere: planar square tops and only exposed, stratified voxel walls. */
export function tiledSphere(id: PlanetId, resolution?: number) {
  const radius = sphereRadius(id),
    steps = resolution ?? voxelResolution(id),
    positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    kinds: number[] = [],
    indices: number[] = [],
    palette = THEME_COLORS[PLANETS[id].sphereTheme ?? "meadow"];
  let walls = 0,
    minHeight = Infinity,
    maxHeight = -Infinity;
  const quad = (
    vertices: T.Vector3[],
    color: T.Color,
    outward: T.Vector3,
    bottomShade = 1,
    kind = 0,
  ) => {
    const base = positions.length / 3,
      n = new T.Vector3()
        .crossVectors(
          vertices[1].clone().sub(vertices[0]),
          vertices[2].clone().sub(vertices[0]),
        )
        .normalize();
    if (n.dot(outward) < 0) n.negate();
    vertices.forEach((p, i) => {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      const c = color.clone().multiplyScalar(i > 1 ? bottomShade : 1);
      colors.push(c.r, c.g, c.b);
      kinds.push(kind);
    });
    const cross = new T.Vector3().crossVectors(
      vertices[1].clone().sub(vertices[0]),
      vertices[2].clone().sub(vertices[0]),
    );
    if (cross.dot(outward) >= 0)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (let face = 0; face < 6; face++)
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const u = -1 + ((i + 0.5) * 2) / steps,
          v = -1 + ((j + 0.5) * 2) / steps,
          cn = cubeNormal(face, u, v),
          n = new T.Vector3(cn.x, cn.y, cn.z),
          sample = resolution ? voxelCell(cn, id).normal : cn,
          level = voxelLevel(sample, id),
          uv = clearingCoordinates(cn, id),
          seed = terrainSeed(
            face * 997 + i * 47 + j * 131 + (PLANETS[id].seed ?? 71),
          ),
          pattern = noise3(
            cn.x * radius * 0.32,
            cn.y * radius * 0.32,
            cn.z * radius * 0.32,
            PLANETS[id].seed ?? 71,
          ),
          stone =
            uv.front > 0.55 &&
            uv.x > -11 &&
            uv.x < -1.5 &&
            uv.z > -13.5 &&
            uv.z < -0.8;
        minHeight = Math.min(minHeight, level);
        maxHeight = Math.max(maxHeight, level);
        const a = -1 + (i * 2) / steps,
          b = -1 + ((i + 1) * 2) / steps,
          c = -1 + (j * 2) / steps,
          d = -1 + ((j + 1) * 2) / steps,
          dirs = [
            [a, c],
            [b, c],
            [b, d],
            [a, d],
          ].map(([u, v]) => {
            const q = cubeNormal(face, u, v);
            return new T.Vector3(q.x, q.y, q.z);
          }),
          point = (direction: T.Vector3, h: number) =>
            direction.clone().multiplyScalar((radius + h) / direction.dot(n)),
          top = dirs.map((q) => point(q, level)),
          color = new T.Color(
            stone
              ? pattern > 0.65
                ? 0xb1b58b
                : 0xd9ceb2
              : palette[
                  Math.min(
                    palette.length - 1,
                    Math.floor(pattern * palette.length),
                  )
                ],
          ).multiplyScalar(0.97 + (seed % 7) * 0.01);
        quad(top, color, n);
        const offsets = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ];
        for (let edge = 0; edge < 4; edge++) {
          const [du, dv] = offsets[edge],
            nextNormal = cubeNormal(
              face,
              u + (du * 2) / steps,
              v + (dv * 2) / steps,
            ),
            neighbor = voxelCell(nextNormal, id),
            lower = voxelLevel(neighbor.normal, id);
          if (lower >= level - 0.01) continue;
          const end = (edge + 1) % 4,
            outer = dirs[edge]
              .clone()
              .add(dirs[end])
              .normalize()
              .addScaledVector(n, -1)
              .normalize();
          for (let h = level; h > lower + 0.01; h -= 0.9) {
            const lo = Math.max(lower - 0.025, h - 0.9),
              rock = new T.Color(
                PLANETS[id].sphereTheme === "volcanic"
                  ? 0x7c7566
                  : PLANETS[id].sphereTheme === "ice"
                    ? 0xc3c8b4
                    : 0xbeb394,
              ).multiplyScalar(Math.floor(h / 0.9) % 2 === 0 ? 1 : 0.91);
            quad(
              [
                point(dirs[edge], h),
                point(dirs[end], h),
                point(dirs[end], lo),
                point(dirs[edge], lo),
              ],
              rock,
              outer,
              0.84,
              1,
            );
            walls++;
          }
        }
      }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("terrainFace", new T.Uint8BufferAttribute(kinds, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData = { tiles: 6 * steps * steps, walls, minHeight, maxHeight };
  return { geometry, tiles: 6 * steps * steps, walls, minHeight, maxHeight };
}
