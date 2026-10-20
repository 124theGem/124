import {
  bodyCenter,
  padPoint,
  padNormal,
  flightRoute,
  add,
  mul,
  sub,
  len,
} from "./space";
import { surfacePoint } from "./voxel";
import { cubeUp, sphereNormal, type Point, type Vec } from "./sphere";
import type { PlanetId } from "./catalog";
export interface GrappleState {
  origin: PlanetId;
  target: PlanetId;
  originPosition: Point;
  route: Vec[];
  startedAt: number;
  endsAt: number;
  duration: number;
}
export function beginGrapple(
  origin: PlanetId,
  target: PlanetId,
  position: Point,
  known: PlanetId[],
  now: number,
): GrappleState {
  const up = cubeUp(sphereNormal(position, origin)),
    start = add(
      add(bodyCenter(origin), surfacePoint(position, origin)),
      mul(up, 1.9),
    );
  const departure = add(start, mul(up, 35));
  const transfer = flightRoute(departure, target, known),
    end = padPoint(target, 2.1),
    route = [start, departure, ...transfer, end];
  const distance = route
      .slice(1)
      .reduce((total, p, i) => total + len(sub(p, route[i])), 0),
    duration = Math.max(4500, Math.min(14000, (distance / 100) * 1000));
  return {
    origin,
    target,
    originPosition: { ...position },
    route,
    startedAt: now,
    endsAt: now + duration,
    duration,
  };
}
export function grapplePosition(g: GrappleState, now: number) {
  const t = Math.max(0, Math.min(1, (now - g.startedAt) / g.duration)),
    eased = t * t * (3 - 2 * t),
    lengths = g.route.slice(1).map((p, i) => len(sub(p, g.route[i]))),
    total = lengths.reduce((a, b) => a + b, 0);
  let distance = eased * total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const a = g.route[i],
        b = g.route[i + 1],
        f = Math.min(1, distance / Math.max(0.001, lengths[i]));
      return {
        position: add(a, mul(sub(b, a), f)),
        progress: t,
        direction: sub(b, a),
      };
    }
    distance -= lengths[i];
  }
  return {
    position: g.route.at(-1)!,
    progress: 1,
    direction: padNormal(g.target),
  };
}
