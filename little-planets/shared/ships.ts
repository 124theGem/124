export const SHIP_CLASSES = ["exploration", "combat", "cargo"] as const;
export type ShipClass = (typeof SHIP_CLASSES)[number];
export const SHIP_CLASS_NAMES: Record<ShipClass, string> = {
  exploration: "Исследовательский",
  combat: "Боевой",
  cargo: "Грузовой",
};
export const SHIP_COLORS = {
  ivory: 0xe0dfcb,
  graphite: 0x3e4c60,
  cobalt: 0x477aa9,
  ember: 0xc67243,
  emerald: 0x438d7b,
};
export const SHIP_ENGINES = {
  ion: {
    name: "ION · Ионный",
    description: "Надёжная двухконтурная тяга",
    speed: 0,
    range: 900,
    color: 0x7edaff,
  },
  plasma: {
    name: "PLASMA · Плазменный",
    description: "Ускоренный разгон, форсажные сопла",
    speed: 12,
    range: 720,
    color: 0xffb66e,
  },
  fusion: {
    name: "FUSION · Термоядерный",
    description: "Дальние экспедиции и высокая тяга",
    speed: 20,
    range: 1500,
    color: 0xb29aff,
  },
};
export const SHIP_MODULES = {
  standard: {
    name: "Базовая авионика",
    description: "Сбалансированная компоновка",
    speed: 0,
    cargo: 0,
    armor: 0,
  },
  survey: {
    name: "Экспедиционная оптика",
    description: "Сенсорная мачта и облегчённая авионика",
    speed: 8,
    cargo: -5,
    armor: 0,
  },
  shield: {
    name: "Броневой контур",
    description: "Дополнительные защитные панели",
    speed: -4,
    cargo: 0,
    armor: 90,
  },
  hold: {
    name: "Грузовая кассета",
    description: "Внешние транспортные контейнеры",
    speed: -3,
    cargo: 80,
    armor: 0,
  },
};
export const SHIP_FINISHES = {
  ceramic: { name: "Керамическая эмаль", metalness: 0.42, roughness: 0.3 },
  titanium: { name: "Шлифованный титан", metalness: 0.88, roughness: 0.24 },
  carbon: { name: "Углеродный композит", metalness: 0.22, roughness: 0.48 },
};
export const SHIP_LIVERIES = {
  aurora: {
    name: "AURORA / Экспедиция",
    corporation: "AURORA EXPEDITION",
    accent: 0x497c80,
    stripe: 0xd4b57b,
  },
  helix: {
    name: "HELIX / Грузовой флот",
    corporation: "HELIX FREIGHT SYSTEMS",
    accent: 0xba793c,
    stripe: 0xe5d9b8,
  },
  polar: {
    name: "POLAR / Спасательная служба",
    corporation: "POLAR RESCUE DIVISION",
    accent: 0x9d4b43,
    stripe: 0xc6d9d7,
  },
  obsidian: {
    name: "ORION / Спецоперации",
    corporation: "ORION DEFENCE WORKS",
    accent: 0x4f5b67,
    stripe: 0xb2bac0,
  },
};
export function shipRegistration(
  s: Pick<Starship, "name" | "class" | "model">,
) {
  let hash = 2166136261;
  for (const c of s.name + s.class + s.model)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return `LP-${String(hash % 100000).padStart(5, "0")}`;
}
export interface Starship {
  id: string;
  name: string;
  class: ShipClass;
  model: 1 | 2 | 3;
  hull: "needle" | "armored" | "freighter";
  wings: "swept" | "delta" | "twin";
  color: keyof typeof SHIP_COLORS;
  livery?: keyof typeof SHIP_LIVERIES;
  engine?: keyof typeof SHIP_ENGINES;
  module?: keyof typeof SHIP_MODULES;
  finish?: keyof typeof SHIP_FINISHES;
}
export const shipConfiguration = (s: Starship) => ({
  ...s,
  livery: s.livery ?? "aurora",
  engine: s.engine ?? "ion",
  module: s.module ?? "standard",
  finish: s.finish ?? "ceramic",
});
export const SHIP_STATS = (s: Starship) => {
  const c = shipConfiguration(s),
    engine = SHIP_ENGINES[c.engine],
    module = SHIP_MODULES[c.module];
  return {
    speed:
      24 +
      s.model * 8 +
      (s.class === "exploration" ? 12 : 0) +
      engine.speed +
      module.speed,
    cargo: (s.class === "cargo" ? 120 : 30) * s.model + module.cargo,
    armor: (s.class === "combat" ? 150 : 60) * s.model + module.armor,
    range: engine.range + s.model * 150,
    mass: Math.round(
      (s.hull === "freighter" ? 28 : s.hull === "armored" ? 21 : 14) *
        (0.8 + s.model * 0.2) +
        (c.module === "hold" ? 4 : c.module === "shield" ? 6 : 0),
    ),
  };
};
export function shipCost(s: Pick<Starship, "class" | "model">) {
  return { iron: 20 * s.model, quartz: 15 * s.model, composite: 5 * s.model };
}
export const starterShip = (): Starship => ({
  id: "starter",
  name: "Пионер",
  class: "exploration",
  model: 1,
  hull: "needle",
  wings: "swept",
  color: "ivory",
});
