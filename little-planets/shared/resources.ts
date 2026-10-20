/** Thirty planetary feedstocks; refined materials are separate higher tiers. */
export const RAW_RESOURCES = {
  wood: "Древесина",
  stone: "Камень",
  spores: "Споры",
  crystal: "Кристалл",
  obsidian: "Обсидиан",
  thermal: "Термокристалл",
  iron: "Железо",
  quartz: "Кварц",
  copper: "Медь",
  silicon: "Кремний",
  carbon: "Углерод",
  titanium: "Титан",
  cobalt: "Кобальт",
  nickel: "Никель",
  aluminium: "Алюминий",
  lithium: "Литий",
  uranium: "Уран",
  gold: "Золото",
  silver: "Серебро",
  platinum: "Платина",
  ice: "Лёд",
  hydrogen: "Водород",
  helium: "Гелий",
  sulfur: "Сера",
  salt: "Соль",
  amber: "Янтарь",
  biomass: "Биомасса",
  iridium: "Иридий",
  osmium: "Осмий",
  xenon: "Ксенон",
} as const;
export type RawResource = keyof typeof RAW_RESOURCES;
export interface RefiningRecipe {
  name: string;
  input: Record<string, number>;
  output: number;
  seconds: number;
  tier: number;
}
export const INDUSTRIAL_RECIPES: Record<string, RefiningRecipe> = {
  composite: {
    name: "Композит",
    input: { wood: 3, stone: 3 },
    output: 1,
    seconds: 6,
    tier: 1,
  },
  alloy: {
    name: "Звёздный сплав",
    input: { composite: 3, crystal: 2 },
    output: 1,
    seconds: 9,
    tier: 2,
  },
};
const raw = Object.keys(RAW_RESOURCES);
let previous: string[] = [];
for (let i = 0; i < raw.length; i += 2) {
  const id = `refined-${i / 2 + 1}`;
  INDUSTRIAL_RECIPES[id] = {
    name: [
      "Биополимер",
      "Кристаллокерамика",
      "Термокарбид",
      "Феррокварц",
      "Микропроводник",
      "Титанокарбон",
      "Кобальтникель",
      "Литиевая матрица",
      "Энергоядро",
      "Аргентоплатина",
      "Гидрогель",
      "Гелиосульфид",
      "Соляной янтарь",
      "Иридобиом",
      "Осмоксенон",
    ][i / 2],
    input: { [raw[i]]: 3, [raw[i + 1]]: 3 },
    output: 1,
    seconds: 6,
    tier: 1,
  };
  previous.push(id);
}
for (let tier = 2; tier <= 4; tier++) {
  const next: string[] = [];
  for (let i = 0; i + 1 < previous.length; i += 2) {
    const id = `tier${tier}-${i / 2 + 1}`;
    INDUSTRIAL_RECIPES[id] = {
      name: `${["", "", "Фазовый", "Квантовый", "Сингулярный"][tier]} материал ${i / 2 + 1}`,
      input: { [previous[i]]: 2, [previous[i + 1]]: 2 },
      output: 1,
      seconds: 6 + tier * 3,
      tier,
    };
    next.push(id);
  }
  previous = next;
}
export const ALL_RESOURCE_LABELS: Record<string, string> = {
  ...RAW_RESOURCES,
  ...Object.fromEntries(
    Object.entries(INDUSTRIAL_RECIPES).map(([id, r]) => [id, r.name]),
  ),
};
export const resourceValid = (id: string) =>
  Object.hasOwn(ALL_RESOURCE_LABELS, id);
export function stableHash(text: string) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function composition(id: string, primary: string) {
  const pool = Object.keys(RAW_RESOURCES).filter((r) => r !== primary),
    seed = stableHash(id);
  const second = pool.splice(seed % pool.length, 1)[0],
    third = pool[(seed >>> 8) % pool.length];
  const a = 40 + (seed % 21),
    b = 15 + ((seed >>> 16) % 16);
  return [
    { resource: primary, percent: a },
    { resource: second, percent: b },
    { resource: third, percent: 100 - a - b },
  ];
}
