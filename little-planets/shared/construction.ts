import type { PlanetId } from "./catalog";
import { resourceNodes as nodes } from "./forestry";
import { sphereNormal, sphereCoordinates } from "./sphere";
import {
  cubeNormal,
  voxelCell,
  voxelResolution,
  voxelLevel,
  naturalVoxelLevel,
  VOXEL_STEP,
  cellKey,
  type TerrainEdits,
} from "./voxel";
export function foundationCells(
  point: { x: number; z: number },
  id: PlanetId,
  width: number,
) {
  const c = voxelCell(sphereNormal(point, id), id),
    n = voxelResolution(id),
    half = Math.ceil(width / 2),
    result: { key: string; normal: { x: number; y: number; z: number } }[] = [];
  for (let di = -half; di <= half; di++)
    for (let dj = -half; dj <= half; dj++) {
      const normal = cubeNormal(
        c.face,
        -1 + ((Math.max(0, Math.min(n - 1, c.i + di)) + 0.5) * 2) / n,
        -1 + ((Math.max(0, Math.min(n - 1, c.j + dj)) + 0.5) * 2) / n,
      );
      const key = cellKey(normal, id);
      if (!result.some((r) => r.key === key)) result.push({ key, normal });
    }
  return result;
}
export function prepareFoundation(
  world: { terrain: TerrainEdits; cleared: string[]; clearedNodes: string[] },
  point: { x: number; z: number },
  id: PlanetId,
  width: number,
) {
  const n = voxelCell(sphereNormal(point, id), id).normal,
    level = Math.max(
      0,
      Math.round(voxelLevel(n, id, world.terrain) / VOXEL_STEP),
    );
  for (const c of foundationCells(point, id, width)) {
    const natural = Math.round(naturalVoxelLevel(c.normal, id) / VOXEL_STEP),
      removed: number[] = [],
      blocks: Record<string, string> = {};
    for (let y = natural + 1; y <= level; y++) blocks[String(y)] = "stone";
    for (let y = level + 1; y <= Math.max(natural, 28); y++)
      if (y <= natural) removed.push(y);
    blocks[String(level)] = "stone";
    world.terrain[c.key] = {
      height: Math.round(level * VOXEL_STEP * 100) / 100,
      material: "stone",
      removed,
      blocks,
    };
    if (!world.cleared.includes(c.key)) world.cleared.push(c.key);
  }
  for (const node of nodes(id))
    if (
      world.cleared.includes(cellKey(sphereNormal(node, id), id)) &&
      !world.clearedNodes.includes(node.id)
    )
      world.clearedNodes.push(node.id);
  return level * VOXEL_STEP;
}
