import type { GameMap, Mode, Obstacle } from '../core/types';
const pillars = (xs: number[], zs: number[]): Obstacle[] =>
  zs.flatMap((z) => xs.map((x) => ({ x, z, w: 1.8, d: 1.8, kind: 'pillar' })));
const wall = (x: number, z: number, w: number): Obstacle => ({ x, z, w, d: 1.8, kind: 'wall' });
const rock = (x: number, z: number, w = 3): Obstacle => ({ x, z, w, d: w, kind: 'rock' });
function layout(mode: Mode): GameMap {
  if (mode === 'raid')
    return {
      id: 'forgotten-ruins',
      name: 'Забытые руины',
      width: 52,
      depth: 108,
      spawns: { A: { x: 0, z: -45 }, B: { x: 0, z: 43 } },
      points: [],
      landmarks: [
        { name: 'Врата рассвета', kind: 'gate', position: { x: 0, z: -37 }, radius: 6 },
        { name: 'Сад забытых клятв', kind: 'garden', position: { x: -17, z: -22 }, radius: 5 },
        { name: 'Лунный источник', kind: 'fountain', position: { x: 18, z: 0 }, radius: 4 },
        { name: 'Зал древних стражей', kind: 'gate', position: { x: 0, z: 20 }, radius: 6 },
        { name: 'Престол Хранителя', kind: 'altar', position: { x: 0, z: 43 }, radius: 8 },
      ],
      obstacles: [
        ...pillars([-18, 18], [-40, -29, -10, 17, 38]),
        ...pillars([-4, 4], [-37, 20]),
        wall(-16, -13, 12),
        wall(16, -13, 12),
        wall(-19, 12, 10),
        wall(19, 12, 10),
        rock(-10, 5),
        rock(10, 5),
        rock(18, 0, 5),
        rock(-18, 27, 3),
        wall(-19, -31, 8),
        wall(19, 30, 8),
      ],
    };
  if (mode === 'siege')
    return {
      id: 'ash-fortress',
      name: 'Крепость Пепельного Ордена',
      width: 52,
      depth: 100,
      spawns: { A: { x: 0, z: -43 }, B: { x: 0, z: -10 } },
      points: [
        { x: 0, z: -24 },
        { x: 0, z: 3 },
        { x: 0, z: 34 },
      ],
      landmarks: [
        { name: 'Лагерь авангарда', kind: 'camp', position: { x: -17, z: -35 }, radius: 4 },
        { name: 'Внешний бастион', kind: 'gate', position: { x: 0, z: -24 }, radius: 7 },
        { name: 'Пепельный двор', kind: 'altar', position: { x: 0, z: 3 }, radius: 6 },
        { name: 'Знамя Ордена', kind: 'gate', position: { x: 0, z: 34 }, radius: 7 },
        { name: 'Оружейный двор', kind: 'camp', position: { x: 18, z: 18 }, radius: 4 },
      ],
      obstacles: [
        ...pillars([-19, 19], [-39, -20, 7, 38]),
        ...pillars([-5, 5], [-24, 34]),
        ...[-30, -3, 26].flatMap((z) => [wall(-16, z, 14), wall(16, z, 14)]),
        rock(-12, 15),
        rock(12, -15),
        wall(-20, 19, 7),
        wall(20, 12, 7),
      ],
    };
  return {
    id: 'titan-sanctuary',
    name: 'Святилище Титанов',
    width: 56,
    depth: 56,
    spawns: { A: { x: 0, z: -22 }, B: { x: 0, z: 22 } },
    points: [{ x: 0, z: 0 }],
    landmarks: [
      { name: 'Сердце Титана', kind: 'altar', position: { x: 0, z: 0 }, radius: 7 },
      { name: 'Серебряная роща', kind: 'garden', position: { x: -20, z: 0 }, radius: 5 },
      { name: 'Источник звёзд', kind: 'fountain', position: { x: 20, z: 0 }, radius: 4 },
      { name: 'Южная арка', kind: 'gate', position: { x: 0, z: -18 }, radius: 5 },
      { name: 'Северная арка', kind: 'gate', position: { x: 0, z: 18 }, radius: 5 },
    ],
    obstacles: [
      ...pillars([-19, 19], [-18, 18]),
      ...pillars([-4, 4], [-18, 18]),
      ...[-11, 11].flatMap((x) => [-9, 9].map((z) => rock(x, z))),
      wall(-21, -7, 7),
      wall(21, 7, 7),
      rock(20, 0, 5),
    ],
  };
}

export function createMap(mode: Mode): GameMap {
  const map = layout(mode);
  for (const landmark of map.landmarks ?? []) {
    const { x, z } = landmark.position,
      r = landmark.radius;
    const block = (bx: number, bz: number, size: number) =>
      map.obstacles.push({ x: bx, z: bz, w: size, d: size, kind: 'pillar', landmark: true });
    if (landmark.kind === 'garden')
      for (let i = 0; i < 5; i++) {
        const a = i * 2.399;
        block(x + Math.sin(a) * (r - 1), z + Math.cos(a) * (r - 1), 0.55);
      }
    if (landmark.kind === 'camp') for (const side of [-1, 1]) block(x + side * 2, z + 1, 1.1);
    if (landmark.kind === 'altar')
      for (const side of [-1, 1]) block(x + side * (r + 0.5), z + 1, 1.1);
  }
  return map;
}
