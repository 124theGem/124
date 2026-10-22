import * as T from "three";
import type { GraphicsQuality } from "./Graphics";
const schedule = new WeakMap<T.Object3D, number>();
/** Emissive windows are cheap; only the nearest 2/4 fixtures cast real local light, without shadow maps. */
export function updateIndustrialLights(
  root: T.Object3D,
  position: T.Vector3,
  daylight: number,
  quality: GraphicsQuality,
  time: number,
) {
  if (time < (schedule.get(root) ?? -1)) return;
  schedule.set(root, time + 0.35);
  const lamps: T.PointLight[] = [],
    materials = new Set<T.MeshStandardMaterial>();
  root.traverse((o) => {
    if (o instanceof T.PointLight && o.userData.colonyFixture) {
      o.visible = false;
      lamps.push(o);
    }
    if (o instanceof T.Mesh) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m.userData.architectureFixture)
          materials.add(m as T.MeshStandardMaterial);
    }
  });
  for (const m of materials)
    m.emissiveIntensity = m.userData.baseGlow * (0.25 + (1 - daylight) * 1.55);
  if (daylight > 0.92 || quality === "economy") return;
  const p = new T.Vector3();
  lamps.forEach((l) => {
    l.getWorldPosition(p);
    l.userData.lampDistance = p.distanceToSquared(position);
  });
  lamps.sort((a, b) => a.userData.lampDistance - b.userData.lampDistance);
  for (const l of lamps.slice(0, quality === "high" ? 4 : 2)) {
    l.visible = l.userData.lampDistance < 20 * 20;
    l.intensity = (1 - daylight) * 5;
  }
}
