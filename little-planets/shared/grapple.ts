// Read-only legacy save shape. Grapple gameplay and rendering were retired in Outpost 0.15.
import type { PlanetId } from "./catalog";
import type { Point, Vec } from "./sphere";
export interface GrappleState {
  origin: PlanetId;
  target: PlanetId;
  originPosition: Point;
  route: Vec[];
  startedAt: number;
  endsAt: number;
  duration: number;
}
