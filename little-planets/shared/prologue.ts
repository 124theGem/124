import type { PlanetId } from "./catalog";
export type StoryPhase =
  | "arrival"
  | "plants"
  | "meteor"
  | "repair"
  | "launch"
  | "reveal"
  | "complete";
export interface Prologue {
  phase: StoryPhase;
  plants: number[];
  meteor: boolean;
}
export const SYSTEM_PLANETS: PlanetId[] = [
  "home",
  "listoria",
  "mycelia",
  "pyros",
  "ferra",
];
export const STORY_PLANTS = [
  { x: 8, z: 13, plant: "sunflower" },
  { x: 7, z: 14, plant: "carrot" },
  { x: 9, z: 15, plant: "glowbush" },
];
export const STORY_METEOR = { x: 6.5, z: 11 };
export const STORY_ROBOT = { x: 10, z: 13 };
export function storyText(q: Prologue) {
  return {
    arrival: [
      "Первый сигнал",
      "Сканирование завершено. В системе обнаружено ещё 4 планеты. Но двигатель повреждён. Начнём с трёх растений: их биоволокно восстановит проводку.",
    ],
    plants: [
      `Соберите растения · ${q.plants.length}/3`,
      "Нажмите на три подсвеченных растения возле маленького робота. Биоволокно нужно для двигателя.",
    ],
    meteor: [
      "Добудьте железо из метеорита",
      "Возьмите кирку и нажмите упавший метеорит с оранжевыми жилами. Нужны 3 единицы железа.",
    ],
    repair: [
      "Восстановите двигатель",
      "Вернитесь к сломанному кораблю. Ремонт использует 3 биоволокна и 3 железа.",
    ],
    launch: [
      "Первый запуск",
      "Двигатель восстановлен. Нажмите корабль, затем ЗАПУСТИТЬ — и увидите всю систему.",
    ],
    reveal: [
      "Маленькая планета. Большое начало.",
      "Четыре новых мира ждут исследования. Ваша колония начинается здесь.",
    ],
    complete: ["", ""],
  }[q.phase];
}
