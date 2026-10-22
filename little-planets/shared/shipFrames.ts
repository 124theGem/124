import type { Starship } from "./ships";

/** Stable class/model identities: existing ships keep their saves and performance. */
export const SHIP_FRAMES = {
  exploration: [
    {
      name: "KESTREL · Геологический шаттл",
      family: "shuttle",
      length: 3.5,
      width: 1.65,
      height: 1.15,
      cockpit: 0.95,
      legs: 4,
    },
    {
      name: "NOMAD · Планетарный экспедиционный",
      family: "walker",
      length: 5.3,
      width: 1.45,
      height: 1.25,
      cockpit: 1.55,
      legs: 6,
    },
    {
      name: "PARALLAX · Дальний разведчик",
      family: "outrigger",
      length: 4.2,
      width: 1.1,
      height: 0.85,
      cockpit: 1.2,
      legs: 3,
    },
  ],
  cargo: [
    {
      name: "MULE · Орбитальный буксир",
      family: "tug",
      length: 3.7,
      width: 1.25,
      height: 1.15,
      cockpit: -0.65,
      legs: 4,
    },
    {
      name: "BASTION · Контейнеровоз",
      family: "hauler",
      length: 4.4,
      width: 2.5,
      height: 1.6,
      cockpit: 1.45,
      legs: 4,
    },
    {
      name: "ATLAS · Палубный транспорт",
      family: "carrier",
      length: 5.2,
      width: 3.15,
      height: 0.8,
      cockpit: -0.9,
      legs: 6,
    },
  ],
  combat: [
    {
      name: "SHRIKE · Перехватчик",
      family: "interceptor",
      length: 4.6,
      width: 0.95,
      height: 0.7,
      cockpit: 0.85,
      legs: 3,
    },
    {
      name: "WARDEN · Штурмовой корабль",
      family: "gunship",
      length: 3.9,
      width: 2.2,
      height: 1.05,
      cockpit: 1.0,
      legs: 4,
    },
    {
      name: "VALKYRIE · Тяжёлый фрегат",
      family: "frigate",
      length: 5.5,
      width: 1.5,
      height: 1.05,
      cockpit: 1.45,
      legs: 6,
    },
  ],
} as const;
export const shipFrame = (s: Pick<Starship, "class" | "model">) =>
  SHIP_FRAMES[s.class][s.model - 1];
