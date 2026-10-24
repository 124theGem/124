import type { GameMap, Mode, Obstacle } from '../core/types';
const pillars = (zs: number[]): Obstacle[] =>
  zs.flatMap((z) => [-12, 12].map((x) => ({ x, z, w: 1.8, d: 1.8, kind: 'pillar' as const })));
export function createMap(mode: Mode): GameMap {
  if (mode === 'raid')
    return {
      id: 'forgotten-ruins',
      name: 'Забытые руины',
      width: 36,
      depth: 72,
      spawns: { A: { x: 0, z: -29 }, B: { x: 0, z: 28 } },
      points: [],
      obstacles: [
        ...pillars([-25, -15, -3, 12, 25]),
        { x: -11, z: -8, w: 14, d: 2.2, kind: 'wall' },
        { x: 11, z: -8, w: 14, d: 2.2, kind: 'wall' },
        { x: -7, z: 5, w: 3, d: 3, kind: 'rock' },
        { x: 7, z: 5, w: 3, d: 3, kind: 'rock' },
      ],
    };
  if (mode === 'siege')
    return {
      id: 'ash-fortress',
      name: 'Крепость Пепельного Ордена',
      width: 36,
      depth: 66,
      spawns: { A: { x: 0, z: -27 }, B: { x: 0, z: -1 } },
      points: [
        { x: 0, z: -13 },
        { x: 0, z: 5 },
        { x: 0, z: 23 },
      ],
      obstacles: [
        ...pillars([-24, -5, 15, 28]),
        ...[-17, 1, 19].flatMap((z) =>
          [-11, 11].map((x) => ({ x, z, w: 13, d: 1.6, kind: 'wall' as const })),
        ),
      ],
    };
  return {
    id: 'titan-sanctuary',
    name: 'Святилище Титанов',
    width: 40,
    depth: 40,
    spawns: { A: { x: 0, z: -15 }, B: { x: 0, z: 15 } },
    points: [{ x: 0, z: 0 }],
    obstacles: [
      ...pillars([-12, 12]),
      ...[-8, 8].flatMap((x) => [-6, 6].map((z) => ({ x, z, w: 3, d: 3, kind: 'rock' as const }))),
    ],
  };
}
