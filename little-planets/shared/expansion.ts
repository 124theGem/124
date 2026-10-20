import { basePlanetSize, planetSize, type PlanetId, key } from "./catalog";
import {
  bodyCenter,
  bodyRadius,
  redirectFlight,
  len,
  sub,
  add,
  mul,
} from "./space";
import { beginGrapple } from "./grapple";
import type { Save } from "./model";
/** One-time expansion of v0.9 angular coordinates and persistent voxel edits. */
export function expandSavedWorlds(save: Save) {
  if (save.planetScale === 1.2) return;
  const scale = (p: PlanetId) => planetSize(p) / basePlanetSize(p);
  const point = (v: { x: number; z: number }, p: PlanetId) => {
    v.x *= scale(p);
    v.z *= scale(p);
  };
  for (const [p, w] of Object.entries(save.worlds) as [
    PlanetId,
    Save["worlds"][PlanetId],
  ][]) {
    const ratio = scale(p),
      size = planetSize(p);
    const cells = (k: string) => {
      const [face, i, j] = k.split(":").map(Number),
        keys: string[] = [];
      for (
        let x = Math.max(0, Math.ceil(i * ratio - 0.5));
        x < Math.min(size, Math.ceil((i + 1) * ratio - 0.5));
        x++
      )
        for (
          let z = Math.max(0, Math.ceil(j * ratio - 0.5));
          z < Math.min(size, Math.ceil((j + 1) * ratio - 0.5));
          z++
        )
          keys.push(`${face}:${x}:${z}`);
      return keys;
    };
    w.terrain = Object.fromEntries(
      Object.entries(w.terrain).flatMap(([k, v]) =>
        cells(k).map((n) => [n, structuredClone(v)]),
      ),
    );
    w.cleared = [...new Set(w.cleared.flatMap(cells))];
    w.crops = Object.fromEntries(
      Object.entries(w.crops).map(([k, c]) => {
        const [x, z] = k.split(",").map(Number);
        return [key(Math.round(x * ratio), Math.round(z * ratio)), c];
      }),
    );
    for (const b of w.buildings) point(b, p);
    for (const e of w.enemies) {
      point(e, p);
      e.homeX *= ratio;
      e.homeZ *= ratio;
    }
    if (w.launchPad) point(w.launchPad, p);
  }
  if (!save.inside) point(save.position, save.planet);
  if (save.outsidePosition) point(save.outsidePosition, save.planet);
  for (const d of save.automation.devices) point(d, d.planet);
  if (save.flight) {
    const f = save.flight;
    // A ship just above an old surface must remain above the expanded body.
    for (const p of save.discovered) {
      const center = bodyCenter(p),
        offset = sub(f.position, center);
      if (len(offset) < bodyRadius(p) + 55) {
        f.position = add(center, mul(offset, scale(p)));
        break;
      }
    }
    f.pads = Object.fromEntries(
      Object.entries(save.worlds)
        .filter(([, w]) => w.launchPad)
        .map(([p, w]) => [p, { x: w.launchPad!.x, z: w.launchPad!.z }]),
    );
    save.flight = redirectFlight(f, f.target, save.discovered);
  }
  if (save.grapple) {
    const g = save.grapple;
    point(g.originPosition, g.origin);
    g.route = beginGrapple(
      g.origin,
      g.target,
      g.originPosition,
      save.discovered,
      g.startedAt,
    ).route;
  }
  if (!save.worlds[save.planet].launchPad) {
    const p = save.planet;
    save.worlds[p].launchPad = {
      x: planetSize(p) / 4,
      z: planetSize(p) / 4,
      shipId: save.flight ? null : save.activeShip,
    };
  }
  for (const sh of save.fleet)
    if (
      sh.id !== save.activeShip &&
      !Object.values(save.worlds).some((w) => w.launchPad?.shipId === sh.id)
    )
      save.inventory[`ship:${sh.id}`] ??= 1;
  save.planetScale = 1.2;
}
