import * as T from "three";
import { PLANETS, type PlanetId } from "../../shared/catalog";
import { THEME_COLORS, terrainSeed } from "../../shared/surface";
import { cubeUp, sphereRadius } from "../../shared/sphere";
import {
  cubeNormal,
  voxelResolution,
  voxelCell,
  voxelLevel,
  naturalVoxelLevel,
  VOXEL_STEP,
  blockSolid,
  blockMaterial,
  clearingCoordinates,
  noise3,
} from "../../shared/voxel";
/** Six flat voxel grids. Only exposed faces are emitted; cavities and bridges have real sides/ceilings. */
export function tiledSphere(id: PlanetId, resolution?: number) {
  const radius = sphereRadius(id),
    steps = resolution ?? voxelResolution(id),
    positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    kinds: number[] = [],
    sides: number[] = [],
    levels: number[] = [],
    indices: number[] = [];
  const palette = THEME_COLORS[PLANETS[id].sphereTheme ?? "meadow"];
  let walls = 0,
    minHeight = Infinity,
    maxHeight = -Infinity;
  function quad(
    vertices: T.Vector3[],
    color: T.Color,
    outward: T.Vector3,
    face: number,
    level: number,
    kind = 0,
  ) {
    const base = positions.length / 3,
      cross = vertices[1]
        .clone()
        .sub(vertices[0])
        .cross(vertices[2].clone().sub(vertices[0])),
      n = cross.clone().normalize();
    if (n.dot(outward) < 0) n.negate();
    vertices.forEach((p, i) => {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      const c = color.clone().multiplyScalar(kind && i > 1 ? 0.88 : 1);
      colors.push(c.r, c.g, c.b);
      kinds.push(kind);
      sides.push(face);
      levels.push(level);
    });
    if (cross.dot(outward) >= 0)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  for (let face = 0; face < 6; face++)
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const u = -1 + ((i + 0.5) * 2) / steps,
          v = -1 + ((j + 0.5) * 2) / steps,
          cn = cubeNormal(face, u, v),
          sample = voxelCell(cn, id).normal,
          up = cubeUp(cn),
          n = new T.Vector3(up.x, up.y, up.z),
          height = voxelLevel(sample, id),
          natural = naturalVoxelLevel(sample, id),
          uv = clearingCoordinates(cn, id),
          seed = terrainSeed(
            face * 997 + i * 47 + j * 131 + (PLANETS[id].seed ?? 71),
          );
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
        const a = -1 + (i * 2) / steps,
          b = -1 + ((i + 1) * 2) / steps,
          c = -1 + (j * 2) / steps,
          d = -1 + ((j + 1) * 2) / steps;
        const dirs = [
          [a, c],
          [b, c],
          [b, d],
          [a, d],
        ].map(([u, v]) => {
          const p = cubeNormal(face, u, v);
          return new T.Vector3(p.x, p.y, p.z).multiplyScalar(
            radius / (p.x * up.x + p.y * up.y + p.z * up.z),
          );
        });
        const point = (index: number, h: number) =>
            dirs[index].clone().addScaledVector(n, h),
          neighbors = [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
          ].map(
            ([du, dv]) =>
              voxelCell(
                cubeNormal(face, u + (du * 2) / steps, v + (dv * 2) / steps),
                id,
              ).normal,
          );
        const pattern = noise3(
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
        const meadow = new T.Color(
            stone
              ? 0xd9ceb2
              : palette[
                  Math.min(
                    palette.length - 1,
                    Math.floor(pattern * palette.length),
                  )
                ],
          ).multiplyScalar(0.97 + (seed % 7) * 0.01),
          rock = new T.Color(
            PLANETS[id].sphereTheme === "volcanic" ? 0x7c7566 : 0xbeb394,
          );
        for (
          let level = -4;
          level <= Math.round(height / VOXEL_STEP);
          level++
        ) {
          if (!blockSolid(sample, id, level)) continue;
          const h = level * VOXEL_STEP,
            lo = (level - 1) * VOXEL_STEP,
            material = blockMaterial(sample, id, level),
            color =
              material === "wood"
                ? new T.Color(0xb18b5d)
                : material === "obsidian"
                  ? new T.Color(0x514c65)
                  : h === natural
                    ? meadow
                    : rock;
          if (!blockSolid(sample, id, level + 1))
            quad(
              [0, 1, 2, 3].map((k) => point(k, h)),
              color,
              n,
              face,
              level,
            );
          if (level > -4 && !blockSolid(sample, id, level - 1))
            quad(
              [3, 2, 1, 0].map((k) => point(k, lo)),
              rock,
              n.clone().negate(),
              face,
              level,
              1,
            );
          for (let edge = 0; edge < 4; edge++) {
            if (blockSolid(neighbors[edge], id, level)) continue;
            const end = (edge + 1) % 4,
              outer = dirs[edge]
                .clone()
                .add(dirs[end])
                .multiplyScalar(0.5)
                .sub(
                  new T.Vector3(cn.x, cn.y, cn.z).multiplyScalar(
                    radius /
                      Math.max(Math.abs(cn.x), Math.abs(cn.y), Math.abs(cn.z)),
                  ),
                )
                .normalize();
            quad(
              [point(edge, h), point(end, h), point(end, lo), point(edge, lo)],
              material === "stone" ? rock : color,
              outer,
              face,
              level,
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
  geometry.setAttribute("cubeSide", new T.Uint8BufferAttribute(sides, 1));
  geometry.setAttribute("blockLevel", new T.Int8BufferAttribute(levels, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData = { tiles: 6 * steps * steps, walls, minHeight, maxHeight };
  return { geometry, tiles: 6 * steps * steps, walls, minHeight, maxHeight };
}
