import { ALL_RESOURCE_LABELS, composition, RAW_RESOURCES } from "./resources";
export const SIZE = 17;
export const HOME_SIZE = 38;
export type PlanetId =
  | "home"
  | "listoria"
  | "mycelia"
  | "pyros"
  | "ferra"
  | "nox"
  | "orbis"
  | "verdia"
  | "cryonia"
  | "duna"
  | "vulcanis"
  | "aquaria"
  | "mycelion"
  | "granit"
  | `wild-${number}`;
export type Biome = "listoria" | "mycelia" | "pyros";
export type SphereTheme =
  | "meadow"
  | "forest"
  | "ice"
  | "desert"
  | "volcanic"
  | "tropical"
  | "fungal"
  | "alpine";
export interface PlanetDefinition {
  id: PlanetId;
  name: string;
  tag: string;
  description: string;
  color: string;
  soil: number;
  side: number;
  rock: number;
  sky: number;
  accent: number;
  resource: readonly string[];
  plants: readonly string[];
  icon: string;
  biome?: Biome;
  size?: number;
  hostile?: boolean;
  seed?: number;
  sphereTheme?: SphereTheme;
}
export type GearKind =
  | "sword"
  | "spear"
  | "blaster"
  | "scout"
  | "guardian"
  | "aegis";
export const GEAR: Record<
  GearKind,
  {
    name: string;
    description: string;
    icon: string;
    slot: "weapon" | "armor";
    cost: Record<string, number>;
    damage?: number;
    range?: number;
    cooldown?: number;
    defense?: number;
    lab?: boolean;
    color: number;
  }
> = {
  sword: {
    name: "Клинок разведчика",
    description: "Надёжный клинок для ближнего боя. 14 урона, дистанция 2.7 м.",
    icon: "⚔️",
    slot: "weapon",
    cost: { wood: 8, stone: 10 },
    damage: 14,
    range: 2.7,
    cooldown: 520,
    color: 0xc9dce0,
  },
  spear: {
    name: "Кристальное копьё",
    description:
      "Длинное копьё с кристальным остриём. 23 урона, дистанция 3.8 м.",
    icon: "🔱",
    slot: "weapon",
    cost: { wood: 12, crystal: 8 },
    damage: 23,
    range: 3.8,
    cooldown: 700,
    color: 0x83eff1,
  },
  blaster: {
    name: "Импульсный бластер",
    description:
      "Стреляет энергетическими импульсами без расхода боеприпасов. 20 урона, дистанция 8 м.",
    icon: "🔫",
    slot: "weapon",
    cost: { stone: 12, crystal: 12, obsidian: 5 },
    damage: 20,
    range: 8,
    cooldown: 650,
    lab: true,
    color: 0x8be6d0,
  },
  scout: {
    name: "Броня разведчика",
    description: "Лёгкий защитный жилет. Поглощает 2 урона каждого удара.",
    icon: "🦺",
    slot: "armor",
    cost: { wood: 10, spores: 4 },
    defense: 2,
    color: 0xb8a273,
  },
  guardian: {
    name: "Броня стража",
    description:
      "Пластины из камня и обсидиана. Поглощает 5 урона каждого удара.",
    icon: "🛡️",
    slot: "armor",
    cost: { stone: 18, obsidian: 6 },
    defense: 5,
    color: 0x819ba8,
  },
  aegis: {
    name: "Кристальная эгида",
    description:
      "Защитный костюм лаборатории. Поглощает 8 урона каждого удара.",
    icon: "💠",
    slot: "armor",
    cost: { crystal: 14, obsidian: 10, thermal: 4 },
    defense: 8,
    lab: true,
    color: 0xa09ee2,
  },
};
export type BuildingKind =
  | "headquarters"
  | "house"
  | "greenhouse"
  | "warehouse"
  | "laboratory"
  | "extractor"
  | "bioextractor"
  | "planetdrill"
  | "scanner"
  | "shipyard"
  | "telescope";
export type FurnitureKind =
  | "chair"
  | "table"
  | "bed"
  | "sofa"
  | "cabinet"
  | "fireplace"
  | "rug";
export const RESOURCE_LABELS = ALL_RESOURCE_LABELS;
export const RESOURCE_ICONS: Record<string, string> = {
  wood: "🪵",
  stone: "🪨",
  spores: "🍄",
  crystal: "💎",
  obsidian: "🌑",
  thermal: "🔥",
};
export const PLANETS: Record<PlanetId, PlanetDefinition> = {
  home: {
    id: "home",
    name: "Родная",
    tag: "Сердце вашей колонии",
    description:
      "Большой зелёный мир: главная база, лаборатория и ваш уютный дом.",
    color: "#cce89a",
    soil: 0x80b35b,
    side: 0x9c7656,
    rock: 0x687c86,
    sky: 0x081a2b,
    accent: 0xffd18a,
    resource: ["wood", "stone"],
    plants: ["sunflower", "carrot", "glowbush"],
    icon: "🏡",
  },
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
} as unknown as Record<PlanetId, PlanetDefinition>;
PLANETS.ferra = {
  ...PLANETS.pyros,
  id: "ferra",
  name: "Ферра",
  tag: "Враждебный мир",
  description: "Ржавые пустоши, панцирные хищники и древние дроны.",
  hostile: true,
  size: 23,
  soil: 0x9c775a,
  sky: 0x1d1e31,
  icon: "🦂",
  biome: "pyros",
};
PLANETS.nox = {
  ...PLANETS.mycelia,
  id: "nox",
  name: "Нокс",
  tag: "Враждебный мир",
  description: "Ночная чаща с кристальными стражами. Подготовьте броню.",
  hostile: true,
  size: 25,
  icon: "👾",
  biome: "mycelia",
};
for (const id of ["home", "listoria"] as const) {
  PLANETS[id].soil = 0x7c8c54;
  PLANETS[id].rock = 0xc4b99c;
  PLANETS[id].side = 0x92956c;
}
// Round experimental worlds were retired. All playable worlds are cubes.
export const SPHERE_PLANETS: PlanetId[] = [];
for (let i = 1; i <= 1200; i++) {
  const biome = (["listoria", "mycelia", "pyros"] as const)[(i * 7) % 3],
    base = PLANETS[biome],
    id = `wild-${i}` as PlanetId;
  const name = [
    "Виридия",
    "Астра",
    "Туманность",
    "Эмбер",
    "Селена",
    "Люмен",
    "Кварц",
    "Ветра",
  ][i % 8];
  PLANETS[id] = {
    ...base,
    id,
    name: `${name} ${100 + i * 13}`,
    tag: "Экспедиция",
    description:
      i % 3
        ? "Неизвестные существа охраняют богатые источники ресурсов."
        : "Тихий затерянный мир с новыми месторождениями.",
    hostile: i % 3 !== 0,
    size: 19 + (i % 4) * 2,
    seed: i * 7919,
    biome,
  };
}
for (const p of Object.values(PLANETS))
  p.sphereTheme = p.id.startsWith("wild-")
    ? (
        [
          "forest",
          "fungal",
          "ice",
          "desert",
          "volcanic",
          "tropical",
          "alpine",
          "meadow",
        ] as const
      )[Number(p.id.slice(5)) % 8]
    : p.id === "home"
      ? "meadow"
      : (p.biome ?? p.id) === "mycelia"
        ? "fungal"
        : (p.biome ?? p.id) === "pyros"
          ? "volcanic"
          : "forest";
export const PLANET_COMPOSITION = Object.fromEntries(
  Object.values(PLANETS).map((p) => {
    const primary =
      p.sphereTheme === "fungal"
        ? "spores"
        : p.sphereTheme === "volcanic"
          ? "obsidian"
          : p.sphereTheme === "ice"
            ? "ice"
            : p.sphereTheme === "desert"
              ? "silicon"
              : "wood";
    const parts = composition(p.id, primary);
    p.resource = parts.map((r) => r.resource);
    return [p.id, parts];
  }),
) as Record<PlanetId, ReturnType<typeof composition>>;
export const INITIAL_PLANETS: PlanetId[] = [
  "home",
  "listoria",
  "mycelia",
  "pyros",
  "ferra",
  "nox",
  ...SPHERE_PLANETS,
];
export function biomeOf(p: PlanetId): Biome {
  return PLANETS[p].biome ?? (p === "home" ? "listoria" : (p as Biome));
}
export function isSphere(p: PlanetId) {
  return !!PLANETS[p];
}
export function planetDepth(p: PlanetId) {
  return isSphere(p) ? planetSize(p) / 2 : planetSize(p);
}
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
export interface BuildingRecipe {
  name: string;
  description: string;
  cost: Record<string, number>;
  icon: string;
  size: number;
  zone: "home" | "outpost" | "any";
  rate?: number;
  resources?: readonly string[];
}
export const BUILDINGS: Record<BuildingKind, BuildingRecipe> = {
  telescope: {
    name: "Орбитальный телескоп",
    description:
      "Оптическая обсерватория. Рассматривайте открытые планеты, вращайте и приближайте изображение.",
    cost: { stone: 15, iron: 10, quartz: 8 },
    icon: "⌕",
    size: 3,
    zone: "any",
  },
  planetdrill: {
    name: "Планетарный поглотитель",
    description:
      "Извлекает три ресурса в пропорции скана. Пять уровней. Выход — на местный склад.",
    cost: { iron: 30, quartz: 20 },
    icon: "⬡",
    size: 4,
    zone: "any",
  },
  scanner: {
    name: "Дальний сканер",
    description:
      "Антенная станция на Родной. Десять уровней дальности, ресурсы и окружающие звёздные системы.",
    cost: { iron: 20, quartz: 15 },
    icon: "◉",
    size: 3,
    zone: "home",
  },
  shipyard: {
    name: "Орбитальная верфь",
    description:
      "Исследовательские, боевые и грузовые корабли. Модульная сборка корпуса и крыльев.",
    cost: { iron: 30, stone: 20 },
    icon: "✧",
    size: 4,
    zone: "home",
  },
  headquarters: {
    name: "Главный дом",
    description:
      "Войдите внутрь: здесь можно поставить созданную мебель и камин.",
    cost: { wood: 24, stone: 18 },
    icon: "🏠",
    size: 3,
    zone: "home",
  },
  house: {
    name: "Жилой дом",
    description: "Новый дом для вашего растущего поселения.",
    cost: { wood: 18, stone: 12 },
    icon: "🏘️",
    size: 2,
    zone: "home",
  },
  greenhouse: {
    name: "Теплица",
    description: "Сад под стеклянной крышей.",
    cost: { wood: 14, stone: 14, crystal: 4 },
    icon: "🌱",
    size: 2,
    zone: "home",
  },
  warehouse: {
    name: "Склад",
    description:
      "Каждый склад увеличивает буфер каждого добывающего модуля на 40 единиц.",
    cost: { wood: 12, stone: 8 },
    icon: "📦",
    size: 2,
    zone: "home",
  },
  laboratory: {
    name: "Лаборатория",
    description: "Открывает рецепты продвинутых модулей и каминов.",
    cost: { wood: 18, stone: 12, crystal: 4 },
    icon: "🔬",
    size: 3,
    zone: "home",
  },
  extractor: {
    name: "Буровой модуль",
    description:
      "Добывает выбранный минерал каждые 20 секунд, даже пока вас нет.",
    cost: { wood: 10, stone: 12, crystal: 3 },
    icon: "⛏️",
    size: 2,
    zone: "outpost",
    rate: 3,
    resources: Object.keys(RAW_RESOURCES).filter(
      (r) => !["wood", "spores", "biomass"].includes(r),
    ),
  },
  bioextractor: {
    name: "Биомодуль",
    description: "Автоматически собирает древесину или споры каждые 20 секунд.",
    cost: { wood: 12, stone: 8, spores: 2 },
    icon: "🌿",
    size: 2,
    zone: "outpost",
    rate: 3,
    resources: ["wood", "spores"],
  },
};
export const FURNITURE: Record<
  FurnitureKind,
  {
    name: string;
    description: string;
    icon: string;
    cost: Record<string, number>;
    w: number;
    d: number;
    walkable?: boolean;
    lab?: boolean;
  }
> = {
  chair: {
    name: "Стул",
    description: "Деревянный стул для тихого вечера.",
    icon: "🪑",
    cost: { wood: 4 },
    w: 1,
    d: 1,
  },
  table: {
    name: "Стол",
    description: "Большой стол для планов и находок.",
    icon: "🪵",
    cost: { wood: 8, stone: 2 },
    w: 2,
    d: 2,
  },
  bed: {
    name: "Кровать",
    description: "Мягкая постель после дальних перелётов.",
    icon: "🛏️",
    cost: { wood: 10, spores: 2 },
    w: 2,
    d: 3,
  },
  sofa: {
    name: "Диван",
    description: "Уютный диван у окна.",
    icon: "🛋️",
    cost: { wood: 9, spores: 3 },
    w: 2,
    d: 1,
  },
  cabinet: {
    name: "Шкаф",
    description: "Место для вещей путешественника.",
    icon: "🗄️",
    cost: { wood: 7, stone: 2 },
    w: 1,
    d: 1,
  },
  fireplace: {
    name: "Камин",
    description: "Живой огонь и тёплый свет в главном доме.",
    icon: "🔥",
    cost: { stone: 12, wood: 5, thermal: 2 },
    w: 2,
    d: 1,
    lab: true,
  },
  rug: {
    name: "Ковёр",
    description: "Цветной ковёр, по которому можно ходить.",
    icon: "🧶",
    cost: { spores: 4 },
    w: 3,
    d: 2,
    walkable: true,
  },
};
export const ROOM = {
  width: 12,
  depth: 10,
  door: { x: 6, z: 8.6 },
  spawn: { x: 6, z: 7.5 },
};
export const HOME_HQ = {
  x: Math.round((12 * 46) / 38),
  z: Math.round((15 * 46) / 38),
};
export function basePlanetSize(p: PlanetId) {
  return p === "home" ? HOME_SIZE : (PLANETS[p]?.size ?? SIZE);
}
export function planetSize(p: PlanetId) {
  return Math.round(basePlanetSize(p) * 1.2);
}
export function beds(p: PlanetId) {
  return BEDS.map((b) => ({
    x: Math.round(
      ((b.x + (p === "home" ? 10 : 0)) * planetSize(p)) / basePlanetSize(p),
    ),
    z: Math.round(
      ((b.z + (p === "home" ? 2 : -2)) * planetSize(p)) / basePlanetSize(p),
    ),
  }));
}
export function ship(p: PlanetId) {
  if (isSphere(p)) return { x: planetSize(p) / 4, z: planetSize(p) / 4 };
  return {
    x: SHIP.x + (p === "home" ? 10 : 0),
    z: SHIP.z + (p === "home" ? 10 : 0),
  };
}
export function allowedBuildings(p: PlanetId) {
  return (Object.keys(BUILDINGS) as BuildingKind[]).filter(
    (k) =>
      (BUILDINGS[k].zone === "any" ||
        BUILDINGS[k].zone === (p === "home" ? "home" : "outpost")) &&
      (!BUILDINGS[k].resources ||
        BUILDINGS[k].resources!.some((r) =>
          (PLANETS[p].resource as readonly string[]).includes(r),
        )),
  );
}
export function moduleResources(p: PlanetId, kind: BuildingKind) {
  return PLANETS[p].resource.filter((r) =>
    BUILDINGS[kind].resources?.includes(r),
  );
}
export function itemInfo(id: string): {
  name: string;
  icon: string;
  group: string;
} {
  if (id === "tool:cultivator")
    return { name: "Культиватор", icon: "⚒", group: "Инструменты" };
  if (id === "engine:fiber")
    return { name: "Биоволокно двигателя", icon: "🌱", group: "Ресурсы" };
  if (id.startsWith("device:")) {
    const names: Record<string, string> = {
      collector: "Робот-сборщик",
      drone: "Грузовой дрон",
      hunter: "Тяжёлый охотник",
      crawler: "Гусеничный логист",
      warehouse: "Местный склад",
      refinery: "Станция переработки",
    };
    return {
      name: names[id.slice(7)] ?? "Устройство",
      icon: "⚙",
      group: "Машины",
    };
  }
  if (id.startsWith("ship:"))
    return { name: "Корабль с площадкой", icon: "🚀", group: "Корабли" };
  if (id === "tool:grapple")
    return { name: "Гарпун", icon: "↗", group: "Инструменты" };
  if (id === "tool:pickaxe")
    return { name: "Кирка", icon: "⛏", group: "Инструменты" };
  const [prefix, value] = id.split(":");
  if (prefix === "seed" || prefix === "crop") {
    const p = PLANTS[value];
    return {
      name: p?.name ?? value,
      icon: p?.icon ?? "🌱",
      group: prefix === "seed" ? "Семена" : "Урожай",
    };
  }
  if (prefix === "gear") {
    const g = GEAR[value as GearKind];
    return {
      name: g?.name ?? value,
      icon: g?.icon ?? "⚔️",
      group: "Экипировка",
    };
  }
  if (prefix === "kit") {
    const b = BUILDINGS[value as BuildingKind];
    return {
      name: b?.name ?? value,
      icon: b?.icon ?? "📦",
      group: "Постройки",
    };
  }
  if (prefix === "furniture") {
    const f = FURNITURE[value as FurnitureKind];
    return { name: f?.name ?? value, icon: f?.icon ?? "🪑", group: "Мебель" };
  }
  return {
    name: RESOURCE_LABELS[id] ?? id,
    icon: RESOURCE_ICONS[id] ?? "📦",
    group: "Ресурсы",
  };
}
export function recipes() {
  return [
    ...Object.entries(GEAR).map(([id, g]) => ({
      id: `gear:${id}`,
      name: g.name,
      icon: g.icon,
      cost: g.cost,
      group: g.slot === "weapon" ? "Оружие" : "Броня",
      lab: !!g.lab,
      description: g.description,
    })),
    ...Object.entries(BUILDINGS).map(([id, b]) => ({
      id: `kit:${id}`,
      name: b.name,
      icon: b.icon,
      cost: b.cost,
      group: b.zone === "home" ? "База" : "Модули",
      lab: id === "bioextractor",
      description: b.description,
    })),
    ...Object.entries(FURNITURE).map(([id, f]) => ({
      id: `furniture:${id}`,
      name: f.name,
      icon: f.icon,
      cost: f.cost,
      group: "Мебель",
      lab: !!f.lab,
      description: f.description,
    })),
    ...Object.entries(PLANTS).map(([id, p]) => ({
      id: `seed:${id}`,
      name: `Семена: ${p.name}`,
      icon: p.icon,
      cost: { [`crop:${id}`]: 2 },
      group: "Семена",
      lab: false,
      description: "Получите семя из двух единиц урожая этого растения.",
    })),
  ];
}
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
  const coords: number[][] = [
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
  ];
  if (isSphere(planet))
    return Array.from({ length: 50 }, (_, i) => ({
      id: `node-${i}`,
      x:
        (((i * 29 + 8 + ((PLANETS[planet].seed ?? 0) % 113)) % 120) / 120) *
        planetSize(planet),
      z:
        ((5 + ((i * 13 + ((PLANETS[planet].seed ?? 0) % 47)) % 50)) / 60) *
        planetDepth(planet),
      resource: PLANETS[planet].resource[i % 3],
      variant: i,
    }));
  if (planet === "home") {
    coords.length = 0;
    for (let x = 2; x < HOME_SIZE - 2; x += 4)
      for (let z = 2; z < HOME_SIZE - 2; z += 4)
        if (!(x >= 10 && x <= 26 && z >= 10 && z <= 26) && !waterCell(x, z))
          coords.push([x, z]);
    coords.push([11, 21], [21, 13], [26, 17], [18, 25], [9, 17], [27, 24]);
  }
  if (planet.startsWith("wild-")) {
    const seed = PLANETS[planet].seed ?? 1,
      size = planetSize(planet),
      generated: number[][] = [];
    const random = (n: number) => {
      n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
      return (n ^ (n >>> 16)) >>> 0;
    };
    for (let i = 0; i < 18; i++)
      for (let attempt = 0; attempt < 200; attempt++) {
        const x = 2 + (random(seed + i * 977 + attempt * 37) % (size - 4)),
          z = 2 + (random(seed + i * 631 + attempt * 71 + 13) % (size - 4)),
          pad = ship(planet);
        if (
          waterCell(x, z) ||
          beds(planet).some((b) => b.x === x && b.z === z) ||
          Math.hypot(x - pad.x, z - pad.z) <= 3 ||
          generated.some((p) => p[0] === x && p[1] === z)
        )
          continue;
        generated.push([x, z]);
        break;
      }
    coords.splice(0, coords.length, ...generated);
  }
  return coords.map(([x, z], i) => ({
    id: `node-${i}`,
    x,
    z,
    resource: PLANETS[planet].resource[i % 3],
    variant: i,
  }));
}
export const key = (x: number, z: number) => `${x},${z}`;
