import { nodes, PLANETS, planetSize, ship, type PlanetId } from "./catalog";
import { terrainSeed } from "./surface";
import { sphereNormal, surfaceDistance } from "./sphere";
import { offsetPoint, clearingCoordinates, noise3, cellKey } from "./voxel";
export interface ResourceNode {
  id: string;
  x: number;
  z: number;
  resource: string;
  variant: number;
  tree?: boolean;
  hits?: number;
  timber?: number;
}
const cache = new Map<PlanetId, ResourceNode[]>();
/** Stable IDs shared by rendering, player actions and collectors, including all cube faces. */
export function forestTrees(id: PlanetId): ResourceNode[] {
  if (cache.has(id)) return cache.get(id)!;
  const result: ResourceNode[] = [],
    size = planetSize(id),
    pad = ship(id),
    seed = PLANETS[id].seed ?? 71,
    theme = PLANETS[id].sphereTheme ?? "meadow";
  let eligible = 0;
  for (let i = 0; i < 170; i++) {
    const p =
      i < 22
        ? offsetPoint(pad, -13 + (i % 6) * 4, -15 + Math.floor(i / 6) * 3.5, id)
        : {
            x: (i * 43.7 + seed) % size,
            z: 2 + (terrainSeed(seed + i * 277) % (size / 2 - 4)),
          };
    const n = sphereNormal(p, id),
      uv = clearingCoordinates(n, id);
    if (
      surfaceDistance(p, pad, id) < 4.8 ||
      (uv.front > 0.55 && uv.x > -11 && uv.x < -1 && uv.z > -14 && uv.z < 0)
    )
      continue;
    if (noise3(n.x * 7, n.y * 7, n.z * 7, seed + 99) < 0.38 && i >= 22)
      continue;
    eligible++;
    if (id === "home" && eligible % 2 === 1) continue;
    if (theme === "desert" && i % 4) continue;
    if (theme === "volcanic" && i % 5) continue;
    const hits = 3 + (i % 4);
    result.push({
      id: `tree-${i}`,
      ...p,
      resource: "wood",
      variant: i,
      tree: true,
      hits,
      timber: 6 + (hits - 3) * 3,
    });
  }
  cache.set(id, result);
  return result;
}
export function resourceNodes(id: PlanetId): ResourceNode[] {
  return [...nodes(id), ...forestTrees(id)];
}
export function treeCleared(
  id: PlanetId,
  tree: ResourceNode,
  cleared: readonly string[],
  felled: readonly string[],
) {
  return (
    felled.includes(tree.id) ||
    cleared.includes(cellKey(sphereNormal(tree, id), id))
  );
}
export interface ForestryState {
  treeDamage: Record<string, number>;
  treeTimber: Record<string, number>;
  clearedNodes: string[];
  depleted: Record<string, number>;
}
/** A finite timber balance also handles a collector with less room than the tree's yield. */
export function cutTree(
  world: ForestryState,
  tree: ResourceNode,
  capacity = Infinity,
): number {
  if (world.clearedNodes.includes(tree.id)) return 0;
  const hits = tree.hits ?? 2;
  world.treeDamage[tree.id] = Math.min(
    hits,
    (world.treeDamage[tree.id] ?? 0) + 1,
  );
  if (world.treeDamage[tree.id] < hits) return 0;
  const remaining = world.treeTimber[tree.id] ?? tree.timber ?? 4;
  const amount = Math.min(remaining, capacity);
  if (amount <= 0) return 0;
  world.treeTimber[tree.id] = remaining - amount;
  if (world.treeTimber[tree.id] === 0) {
    world.clearedNodes.push(tree.id);
    delete world.treeDamage[tree.id];
    delete world.treeTimber[tree.id];
  }
  return amount;
}
