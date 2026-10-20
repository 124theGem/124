import * as T from "three";
import type { Models } from "./Models";
export function cockpit(k: Models) {
  const g = new T.Group(),
    metal = 0x263b4a,
    trim = 0x7f969a;
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c = metal,
    glow = false,
  ) => k.box(g, x, y, z, w, h, d, c, glow);
  box(0, -0.53, -0.88, 2, 0.25, 0.45);
  box(0, -0.39, -0.97, 0.8, 0.13, 0.3, trim);
  for (const sign of [-1, 1]) {
    const frame = box(sign * 0.65, 0.04, -1.15, 0.05, 1.04, 0.08, trim);
    frame.rotation.z = sign * 0.17;
    box(sign * 0.56, 0.02, -1.18, 0.025, 1, 0.04);
    const panel = box(sign * 0.56, -0.39, -0.93, 0.44, 0.25, 0.1, trim);
    panel.rotation.x = -0.35;
    const screen = box(
      sign * 0.56,
      -0.36,
      -0.86,
      0.34,
      0.13,
      0.02,
      0x51c2cc,
      true,
    );
    screen.rotation.x = -0.35;
    for (let i = 0; i < 5; i++)
      box(
        sign * 0.56 + (i - 2) * 0.065,
        -0.49,
        -0.76,
        0.035,
        0.026,
        0.04,
        i % 2 ? 0xe8b56d : 0x6fcdbb,
        true,
      );
    box(sign * 0.3, -0.29, -0.86, 0.055, 0.18, 0.06, trim);
    box(sign * 0.3, -0.23, -0.85, 0.11, 0.08, 0.1, 0xc6d4cc);
    box(sign * 0.32, -0.31, -0.75, 0.13, 0.12, 0.25, 0xd8dbca);
  }
  box(0, 0.52, -1.22, 1.55, 0.06, 0.09, trim);
  box(0, -0.34, -0.85, 0.24, 0.025, 0.06, 0x91e5d0, true);
  k.batch(g);
  g.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });
  return g;
}
