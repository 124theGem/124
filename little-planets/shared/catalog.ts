export const SIZE = 17;
export type PlanetId = "listoria" | "mycelia" | "pyros";
export type BuildingKind = "house" | "greenhouse" | "warehouse";
export const RESOURCE_LABELS: Record<string, string> = {
  wood: "Древесина",
  stone: "Камень",
  spores: "Споры",
  crystal: "Кристаллы",
  obsidian: "Обсидиан",
  thermal: "Термокристаллы",
};
export const RESOURCE_ICONS: Record<string, string> = {
  wood: "▰",
  stone: "◆",
  spores: "◉",
  crystal: "✧",
  obsidian: "⬟",
  thermal: "✦",
};
export const PLANETS = {
  listoria: {
    id: "listoria",
    name: "Листория",
    tag: "Там, где всё начинается",
    description: "Тёплый дом среди зелёных крон, цветов и водопадов.",
    color: "#87cf69",
    soil: 0x87bb57,
    side: 0x9d7953,
    rock: 0x677a83,
    sky: 0x06162b,
    accent: 0xffd47f,
    resource: ["wood", "stone"],
    plants: ["sunflower", "carrot", "glowbush"],
    icon: "🌿",
  },
  mycelia: {
    id: "mycelia",
    name: "Мицелия",
    tag: "Мир тихого свечения",
    description: "Светящиеся грибы, лунные цветы и синие кристаллы.",
    color: "#c290ff",
    soil: 0x66558e,
    side: 0x584866,
    rock: 0x393b61,
    sky: 0x100c2a,
    accent: 0xad8cff,
    resource: ["spores", "crystal"],
    plants: ["moonshroom", "lightflower", "sporebush"],
    icon: "🍄",
  },
  pyros: {
    id: "pyros",
    name: "Пирос",
    tag: "Согретый сердцем звезды",
    description: "Тёплые камни, огненные цветы и ручейки магмы.",
    color: "#ffac67",
    soil: 0x78615c,
    side: 0x5e4447,
    rock: 0x3b3a45,
    sky: 0x211324,
    accent: 0xff8b4f,
    resource: ["obsidian", "thermal"],
    plants: ["fireflower", "ashcactus", "lavalily"],
    icon: "🔥",
  },
} as const;
export const PLANTS: Record<
  string,
  {
    name: string;
    planet: PlanetId;
    seconds: number;
    color: number;
    icon: string;
    shape: "flower" | "carrot" | "bush" | "mushroom" | "cactus";
  }
> = {
  sunflower: {
    name: "Солнечник",
    planet: "listoria",
    seconds: 15,
    color: 0xffcb4d,
    icon: "🌻",
    shape: "flower",
  },
  carrot: {
    name: "Космическая морковь",
    planet: "listoria",
    seconds: 15,
    color: 0xff9448,
    icon: "🥕",
    shape: "carrot",
  },
  glowbush: {
    name: "Светящийся куст",
    planet: "listoria",
    seconds: 30,
    color: 0x83efd2,
    icon: "🌱",
    shape: "bush",
  },
  moonshroom: {
    name: "Лунный гриб",
    planet: "mycelia",
    seconds: 15,
    color: 0xba77ff,
    icon: "🍄",
    shape: "mushroom",
  },
  lightflower: {
    name: "Светоцвет",
    planet: "mycelia",
    seconds: 15,
    color: 0x7de5ff,
    icon: "❀",
    shape: "flower",
  },
  sporebush: {
    name: "Споровый куст",
    planet: "mycelia",
    seconds: 30,
    color: 0xe898ee,
    icon: "🌸",
    shape: "bush",
  },
  fireflower: {
    name: "Огненный цветок",
    planet: "pyros",
    seconds: 15,
    color: 0xff723f,
    icon: "🌺",
    shape: "flower",
  },
  ashcactus: {
    name: "Пепельный кактус",
    planet: "pyros",
    seconds: 15,
    color: 0xc5d295,
    icon: "🌵",
    shape: "cactus",
  },
  lavalily: {
    name: "Лавовая лилия",
    planet: "pyros",
    seconds: 30,
    color: 0xffd27f,
    icon: "✿",
    shape: "flower",
  },
};
export const BUILDINGS: Record<
  BuildingKind,
  {
    name: string;
    description: string;
    cost: Record<string, number>;
    icon: string;
  }
> = {
  house: {
    name: "Домик",
    description:
      "Уютный дом для путешественника. Внутренние помещения появятся позже.",
    cost: { wood: 18, stone: 12 },
    icon: "⌂",
  },
  greenhouse: {
    name: "Теплица",
    description:
      "Стеклянный сад для ваших любимых растений. Пока декоративная постройка.",
    cost: { wood: 14, stone: 14, crystal: 4 },
    icon: "♧",
  },
  warehouse: {
    name: "Склад",
    description:
      "Место для ящиков и инструментов. Инвентарь в MVP общий и не ограничен.",
    cost: { wood: 12, stone: 8 },
    icon: "▣",
  },
};
export const BEDS = Array.from({ length: 8 }, (_, i) => ({
  x: 6 + (i % 4),
  z: 8 + Math.floor(i / 4),
}));
export const SHIP = { x: 13, z: 13 };
export function terrainHeight(x: number, z: number) {
  return (
    0.15 * (Math.floor(x / 5) + Math.floor(z / 6)) +
    0.045 * Math.sin(x * 1.4 + z)
  );
}
export function waterCell(x: number, z: number) {
  return (x === 5 && z >= 12) || (x >= 11 && x <= 13 && z >= 4 && z <= 5);
}
export function nodes(planet: PlanetId) {
  return [
    [2, 7],
    [3, 11],
    [5, 4],
    [9, 3],
    [12, 8],
    [14, 5],
    [14, 10],
    [10, 14],
    [7, 13],
    [2, 13],
    [7, 2],
    [12, 2],
    [2, 2],
    [15, 14],
    [5, 14],
    [15, 2],
    [3, 5],
    [10, 6],
  ].map(([x, z], i) => ({
    id: `node-${i}`,
    x,
    z,
    resource: PLANETS[planet].resource[i % 2],
    variant: i,
  }));
}
export const key = (x: number, z: number) => `${x},${z}`;
