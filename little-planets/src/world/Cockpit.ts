import type { Models } from "./Models";
import type { Starship } from "../../shared/ships";
export function cockpit(k: Models, design?: Starship) {
  return k.cockpit(design);
}
