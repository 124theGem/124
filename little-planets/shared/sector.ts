import { PLANETS, type PlanetId } from "./catalog";
import { bodyCenter, len, sub } from "./space";
import type { Save, Building } from "./model";
const NAMES = [
  "Орион",
  "Лира",
  "Кассиопея",
  "Андромеда",
  "Персей",
  "Дракон",
  "Феникс",
  "Лебедь",
  "Вега",
  "Альтаир",
  "Кентавр",
  "Пегас",
];
export const constellationIndex = (id: PlanetId) =>
  id.startsWith("wild-") ? Math.floor((Number(id.slice(5)) - 1) / 20) + 1 : 0;
export const constellationName = (id: PlanetId) => {
  const i = constellationIndex(id);
  return i === 0
    ? "Колыбель"
    : `${NAMES[(i - 1) % 12]} ${Math.floor((i - 1) / 12) + 1}`;
};
export const planetDistance = (a: PlanetId, b: PlanetId) =>
  len(sub(bodyCenter(a), bodyCenter(b)));
export const scannerRange = (level: number) => 500 + 180 * level * level;
export function scannerBuilding(s: Save) {
  return s.worlds.home.buildings.find((b) => b.kind === "scanner");
}
export function inScannerRange(s: Save, p: PlanetId) {
  const b = scannerBuilding(s);
  return !!b && planetDistance("home", p) <= scannerRange(b.level ?? 1);
}
export function upgradeCost(b: Building) {
  const l = b.level ?? 1;
  return { iron: 15 * l * l, quartz: 10 * l * l, crystal: 5 * l };
}
export function drillSize(level: number, side: number) {
  return [0, 4, side * 0.25, side * 0.42, side * 0.62, side * 0.84][level];
}
export function recordVisit(s: Save, p: PlanetId, now: number) {
  const row = s.profile.visits[p] ?? { seconds: 0, arrivals: 0 };
  row.arrivals++;
  s.profile.visits[p] = row;
  s.profile.lastAt = now;
}
export const SECTOR_PLANETS = Object.keys(PLANETS) as PlanetId[];
