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
export interface Starship {
  id: string;
  name: string;
  class: ShipClass;
  model: 1 | 2 | 3;
  hull: "needle" | "armored" | "freighter";
  wings: "swept" | "delta" | "twin";
  color: keyof typeof SHIP_COLORS;
}
export const SHIP_STATS = (s: Starship) => ({
  speed: 24 + s.model * 8 + (s.class === "exploration" ? 12 : 0),
  cargo: (s.class === "cargo" ? 120 : 30) * s.model,
  armor: (s.class === "combat" ? 150 : 60) * s.model,
});
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
