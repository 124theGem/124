import { surfaceRadius, MAX_TERRAIN_HEIGHT } from "./voxel";
import {
  isSphere,
  planetSize,
  ship,
  terrainHeight,
  type PlanetId,
} from "./catalog";
import { sphereNormal, sphereRadius, type Vec } from "./sphere";
export interface PilotInput {
  throttle: number;
  turn: number;
  pitch: number;
  brake: boolean;
  boost: boolean;
  autopilot: boolean;
}
export interface FlightState {
  origin: PlanetId;
  target: PlanetId;
  position: Vec;
  velocity: Vec;
  forward: Vec;
  up: Vec;
  route: Vec[];
  waypoint: number;
  autopilot: boolean;
  startedAt: number;
  lastUpdate: number;
  distance: number;
}
export const add = (a: Vec, b: Vec): Vec => ({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  }),
  sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  mul = (v: Vec, s: number): Vec => ({ x: v.x * s, y: v.y * s, z: v.z * s }),
  dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z,
  len = (v: Vec) => Math.hypot(v.x, v.y, v.z),
  unit = (v: Vec): Vec =>
    len(v) > 1e-9 ? mul(v, 1 / len(v)) : { x: 0, y: 0, z: 1 },
  cross = (a: Vec, b: Vec): Vec => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
const centers: Partial<Record<PlanetId, Vec>> = {
  home: { x: -190, y: -30, z: -170 },
  listoria: { x: -70, y: 150, z: -240 },
  mycelia: { x: 200, y: -90, z: -260 },
  pyros: { x: -260, y: 170, z: 180 },
  ferra: { x: -360, y: -120, z: -80 },
  nox: { x: 320, y: -190, z: 160 },
  orbis: { x: 0, y: 0, z: 0 },
  verdia: { x: 180, y: 170, z: 210 },
  cryonia: { x: -200, y: 170, z: 270 },
  duna: { x: 310, y: -80, z: -80 },
  vulcanis: { x: -110, y: -220, z: 240 },
  aquaria: { x: 260, y: 150, z: -140 },
  mycelion: { x: -250, y: -140, z: -300 },
  granit: { x: 60, y: 310, z: 30 },
};
export function bodyCenter(id: PlanetId): Vec {
  if (centers[id]) return { ...centers[id]! };
  const i = Number(id.split("-")[1]) || 1,
    angle = i * 2.39996,
    r = 530 + (i % 3) * 110;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(i * 4.1) * 260,
    z: Math.sin(angle) * r,
  };
}
export function bodyRadius(id: PlanetId) {
  return isSphere(id)
    ? sphereRadius(id) + MAX_TERRAIN_HEIGHT
    : planetSize(id) * 0.52;
}
export function padNormal(id: PlanetId): Vec {
  return isSphere(id) ? sphereNormal(ship(id), id) : { x: 0, y: 1, z: 0 };
}
export function padPoint(id: PlanetId, height = 0): Vec {
  const c = bodyCenter(id),
    p = ship(id);
  if (isSphere(id))
    return add(c, mul(padNormal(id), surfaceRadius(p, id) + 0.14 + height));
  const offset = (planetSize(id) - 1) / 2;
  return add(c, {
    x: p.x - offset,
    y: bodyRadius(id) + terrainHeight(p.x, p.z) + 0.13 + height,
    z: p.z - offset,
  });
}
export function approachPoint(id: PlanetId) {
  return padPoint(id, 9);
}
function segmentDistance(a: Vec, b: Vec, p: Vec) {
  const d = sub(b, a),
    t = Math.max(
      0,
      Math.min(1, dot(sub(p, a), d) / Math.max(0.0001, dot(d, d))),
    );
  return len(sub(p, add(a, mul(d, t))));
}
export function flightRoute(
  start: Vec,
  target: PlanetId,
  known: PlanetId[],
): Vec[] {
  const end = approachPoint(target),
    outer = padPoint(target, 35),
    points: Vec[] = [{ ...start }];
  // A pilot can enable guidance next to any hemisphere after a manual approach.
  // First climb clear of the nearby body before calculating the transfer legs.
  for (const id of known) {
    const center = bodyCenter(id),
      offset = sub(start, center),
      radius = bodyRadius(id);
    if (len(offset) < radius + 17) {
      points.push(add(center, mul(unit(offset), radius + 35)));
      break;
    }
  }
  points.push(outer, end);
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (let i = 0; i < points.length - 1 && !changed; i++)
      for (const id of known) {
        const c = bodyCenter(id),
          r = bodyRadius(id) + 5;
        if (
          segmentDistance(points[i], points[i + 1], c) < r &&
          len(sub(points[i], c)) > r &&
          len(sub(points[i + 1], c)) > r
        ) {
          const direction = unit(sub(points[i + 1], points[i])),
            mid = mul(add(points[i], points[i + 1]), 0.5),
            offset = sub(mid, c),
            perp = sub(offset, mul(direction, dot(offset, direction))),
            side = unit(
              len(perp) > 0.1
                ? perp
                : cross(
                    direction,
                    Math.abs(direction.y) > 0.9
                      ? { x: 1, y: 0, z: 0 }
                      : { x: 0, y: 1, z: 0 },
                  ),
            );
          points.splice(i + 1, 0, add(c, mul(side, r + 24)));
          changed = true;
          break;
        }
      }
    if (!changed) break;
  }
  return points.slice(1);
}
export function beginFlight(
  origin: PlanetId,
  target: PlanetId,
  known: PlanetId[],
  now: number,
): FlightState {
  const position = padPoint(origin, 13),
    departure = padPoint(origin, 38);
  return {
    origin,
    target,
    position,
    velocity: { x: 0, y: 0, z: 0 },
    forward: unit(sub(departure, position)),
    up:
      Math.abs(padNormal(origin).y) > 0.9
        ? { x: 0, y: 0, z: 1 }
        : { x: 0, y: 1, z: 0 },
    route: [departure, ...flightRoute(departure, target, known)],
    waypoint: 0,
    autopilot: false,
    startedAt: now,
    lastUpdate: now,
    distance: 0,
  };
}
export function redirectFlight(
  f: FlightState,
  target: PlanetId,
  known: PlanetId[],
) {
  return {
    ...f,
    target,
    route: flightRoute(f.position, target, known),
    waypoint: 0,
  };
}
export function landingInfo(f: FlightState) {
  const gate = approachPoint(f.target),
    distance = len(sub(f.position, gate)),
    speed = len(f.velocity);
  return {
    distance,
    speed,
    altitude: len(sub(f.position, bodyCenter(f.target))) - bodyRadius(f.target),
    allowed: distance < 9 && speed < 7,
  };
}
function rotate(v: Vec, axis: Vec, angle: number) {
  return add(
    add(mul(v, Math.cos(angle)), mul(cross(axis, v), Math.sin(angle))),
    mul(axis, dot(axis, v) * (1 - Math.cos(angle))),
  );
}
/** Shared, deterministic integration. Time is supplied as bounded command segments, never as a teleport position. */
export function stepFlight(
  original: FlightState,
  input: PilotInput,
  dt: number,
  known: PlanetId[],
): FlightState {
  const f: FlightState = {
    ...original,
    position: { ...original.position },
    velocity: { ...original.velocity },
    forward: { ...original.forward },
    up: { ...original.up },
    autopilot: input.autopilot,
  };
  const steps = Math.max(1, Math.ceil(dt / 0.035)),
    h = dt / steps;
  if (input.autopilot && !original.autopilot) {
    f.route = flightRoute(f.position, f.target, known);
    f.waypoint = 0;
  }
  for (let i = 0; i < steps; i++) {
    let acceleration: Vec;
    if (input.autopilot) {
      let goal = f.route[f.waypoint] ?? approachPoint(f.target);
      if (len(sub(goal, f.position)) < 5 && f.waypoint < f.route.length - 1) {
        f.waypoint++;
        goal = f.route[f.waypoint];
      }
      const delta = sub(goal, f.position),
        distance = len(delta),
        last = f.waypoint >= f.route.length - 1,
        speed = Math.min(
          44,
          Math.sqrt(Math.max(0, distance - (last ? 0.4 : 0)) * 17),
        ),
        desired = mul(unit(delta), speed);
      acceleration = mul(sub(desired, f.velocity), 1.8);
      if (len(acceleration) > 26) acceleration = mul(unit(acceleration), 26);
      if (len(f.velocity) > 0.3)
        f.forward = unit(
          add(
            mul(f.forward, Math.max(0, 1 - h * 5)),
            mul(unit(f.velocity), h * 5),
          ),
        );
    } else {
      const yaw = -input.turn * 1.8 * h;
      f.forward = unit(rotate(f.forward, f.up, yaw));
      const right = unit(cross(f.forward, f.up));
      f.forward = unit(rotate(f.forward, right, input.pitch * 1.45 * h));
      f.up = unit(rotate(f.up, right, input.pitch * 1.45 * h));
      acceleration = add(
        mul(f.forward, input.throttle * (input.boost ? 42 : 23)),
        mul(f.velocity, input.brake ? -5 : -0.12),
      );
    }
    let projectedUp = sub(f.up, mul(f.forward, dot(f.up, f.forward)));
    if (len(projectedUp) < 0.01)
      projectedUp = cross(
        f.forward,
        Math.abs(f.forward.y) > 0.9
          ? { x: 1, y: 0, z: 0 }
          : { x: 0, y: 1, z: 0 },
      );
    f.up = unit(projectedUp);
    f.velocity = add(f.velocity, mul(acceleration, h));
    const maxSpeed = input.boost && !input.autopilot ? 64 : 46;
    if (len(f.velocity) > maxSpeed)
      f.velocity = mul(unit(f.velocity), maxSpeed);
    let next = add(f.position, mul(f.velocity, h));
    for (const id of known) {
      const center = bodyCenter(id),
        offset = sub(next, center),
        radius = bodyRadius(id) + 0.8;
      if (len(offset) < radius) {
        const normal = unit(offset);
        next = add(center, mul(normal, radius));
        const inward = dot(f.velocity, normal);
        if (inward < 0) f.velocity = sub(f.velocity, mul(normal, inward));
        f.velocity = mul(f.velocity, 0.6);
      }
    }
    f.distance += len(sub(next, f.position));
    f.position = next;
  }
  return f;
}
