import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
export type GraphicsQuality = "high" | "balanced" | "economy";
export function graphicsQuality(): GraphicsQuality {
  try {
    const q = localStorage.getItem("little-planets-quality");
    if (q === "high" || q === "balanced" || q === "economy") return q;
  } catch {}
  return typeof innerWidth === "number" && innerWidth < 900
    ? "balanced"
    : "high";
}
export function studioEnvironment(renderer: T.WebGLRenderer) {
  const generator = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const map = generator.fromScene(room, 0.045);
  room.dispose();
  generator.dispose();
  return map;
}
