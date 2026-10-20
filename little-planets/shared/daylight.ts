import type { Vec } from "./sphere";
export const DAY_DURATION = 600000;
export function dayCycle(
  epoch: number,
  now: number,
  up: Vec = { x: 0, y: 0, z: 1 },
) {
  const phase = ((((now - epoch) / DAY_DURATION + 0.25) % 1) + 1) % 1,
    angle = phase * Math.PI * 2;
  const raw = { x: Math.cos(angle), y: 0.35, z: Math.sin(angle) },
    l = Math.hypot(raw.x, raw.y, raw.z),
    direction = { x: raw.x / l, y: raw.y / l, z: raw.z / l };
  const altitude = direction.x * up.x + direction.y * up.y + direction.z * up.z,
    daylight = Math.max(0, Math.min(1, (altitude + 0.15) / 0.65));
  const minutes = Math.floor(((phase + 0.25) % 1) * 1440);
  return {
    phase,
    daylight,
    direction,
    label: daylight < 0.18 ? "Ночь" : daylight < 0.7 ? "Сумерки" : "День",
    clock: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
  };
}
