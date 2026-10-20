import { PLANET_COMPOSITION, type PlanetId } from "./catalog";
import { localWarehouse } from "./automation";
import type { Save } from "./model";
/** A 100-unit extraction wheel gives exactly the scanned composition, without random rerolls. */
export function advanceIndustry(save: Save, now: number) {
  for (const [id, world] of Object.entries(save.worlds))
    for (const b of world.buildings) {
      if (b.kind !== "planetdrill") continue;
      const previous = b.productionAt ?? now,
        elapsed = Math.max(0, Math.min(2000, now - previous)),
        level = b.level ?? 1;
      if (now <= previous) continue;
      const quantum = 1000 / (level * level * 2),
        count = Math.floor(elapsed / quantum);
      if (!count) continue;
      b.productionAt = now - elapsed + count * quantum;
      const stock = localWarehouse(save, id as PlanetId)
        ? world.stock
        : (b.buffer ??= {});
      if (stock !== b.buffer && b.buffer) {
        for (const [k, n] of Object.entries(b.buffer))
          stock[k] = (stock[k] ?? 0) + n;
        b.buffer = {};
      }
      const composition = PLANET_COMPOSITION[id as PlanetId];
      const capacity = 500 * level;
      let total = Object.values(stock).reduce((a, b) => a + b, 0);
      for (let i = 0; i < count; i++) {
        if (stock === b.buffer && total >= capacity) break;
        const cursor = ((b.produced ?? 0) * 37) % 100;
        let end = 0;
        const part = composition.find((p) => {
          end += p.percent;
          return cursor < end;
        })!;
        stock[part.resource] = (stock[part.resource] ?? 0) + 1;
        b.produced = (b.produced ?? 0) + 1;
        total++;
      }
    }
}
