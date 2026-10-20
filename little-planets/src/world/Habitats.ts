import * as T from "three";
import type { Models } from "./Models";
import type { BuildingKind, PlanetId } from "../../shared/catalog";
/** Limestone colony architecture: layered plinths, framed glazing and functional roof equipment. */
export function habitat(k: Models, kind: BuildingKind, planet: PlanetId) {
  const g = new T.Group(),
    stone = 0xdcd6c2,
    trim = 0xa4b4a1,
    dark = 0x435e60,
    green = 0x688866,
    glass = 0x87c8c5,
    metal = 0x849c9b;
  const b = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c = stone,
    alpha = 1,
  ) => k.box(g, x, y, z, w, h, d, c, false, alpha);
  const industrial =
      kind === "warehouse" || kind === "extractor" || kind === "bioextractor",
    hq = kind === "headquarters",
    lab = kind === "laboratory",
    w = hq ? 3.7 : lab ? 3.3 : 2.7,
    depth = hq ? 3.2 : 2.6;
  for (let i = 0; i < 3; i++)
    b(
      0,
      0.06 + i * 0.08,
      0,
      w + 0.4 - i * 0.1,
      0.1,
      depth + 0.4 - i * 0.1,
      i === 0 ? 0x9b9f8e : stone,
    );
  if (kind === "extractor" || kind === "bioextractor") {
    for (const x of [-0.85, 0.85]) {
      b(x, 1.2, -0.55, 0.18, 2, 0.24, metal);
      b(x, 0.65, 0.25, 0.25, 0.6, 0.8, dark);
      for (let j = 0; j < 4; j++)
        b(x, 0.95 + j * 0.22, -0.55, 0.3, 0.06, 0.35, stone);
    }
    b(0, 2.25, -0.55, 2.15, 0.23, 0.4, stone);
    b(0, 1.22, 0, 0.9, 1.5, 0.9, kind === "bioextractor" ? green : metal);
    for (let i = 0; i < 7; i++)
      b(0, 0.35 + i * 0.16, 0.3, 0.5 - i * 0.045, 0.08, 0.45 - i * 0.04, dark);
    for (const x of [-0.75, 0.75]) {
      b(x, 0.5, 0.9, 0.65, 0.4, 0.65, metal);
      b(x, 0.73, 0.9, 0.4, 0.06, 0.45, trim);
    }
    for (let i = 0; i < 5; i++)
      b(0.52, 1 + i * 0.12, 0.48, 0.035, 0.06, 0.08, 0xb6e3bb);
    b(0, 2.42, -0.55, 0.7, 0.1, 0.7, green);
    b(-0.8, 2.65, -0.55, 0.05, 0.5, 0.05, metal);
  } else if (kind === "greenhouse") {
    b(0, 0.35, 0, w - 0.2, 0.2, depth - 0.2, 0x7d866c);
    for (const x of [-1, 0, 1])
      for (const z of [-1, 1]) b(x, 1.15, z, 0.07, 1.65, 0.07, stone);
    for (const x of [-1, 0, 1])
      for (const s of [-1, 1]) {
        const panel = b(x, 2, s * 0.52, 0.07, 0.07, 1.18, metal);
        panel.rotation.x = s * 0.3;
      }
    b(0, 1.24, 0, 2, 1.55, 2, glass, 0.28);
    b(0, 2.15, 0, 2.15, 0.06, 2.05, glass, 0.38);
    for (const x of [-0.65, 0.65]) {
      b(x, 0.5, 0, 0.45, 0.2, 1.8, 0x8d7453);
      for (let z = -0.65; z < 0.8; z += 0.5) {
        const p = k.plant("sunflower");
        p.scale.setScalar(0.5);
        p.position.set(x, 0.6, z);
        g.add(p);
      }
    }
    b(1.2, 0.7, -0.7, 0.4, 0.8, 0.6, metal);
    b(1.2, 1.17, -0.7, 0.5, 0.1, 0.7, trim);
  } else {
    const height = hq ? 2.7 : lab ? 2.4 : 2.05;
    b(0, 0.3 + height / 2, 0, w, height, depth, stone);
    for (const y of [0.5, 1.2, 1.9]) {
      b(0, y, depth / 2 + 0.01, w, 0.045, 0.04, trim);
      b(w / 2 + 0.01, y, 0, 0.04, 0.045, depth, trim);
    }
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const px = x * (w / 2 - 0.12),
          pz = z * (depth / 2 - 0.12);
        b(px, height / 2 + 0.35, pz, 0.16, height + 0.1, 0.16, trim);
        b(px, height + 0.45, pz, 0.3, 0.14, 0.3, stone);
      }
    const doorWidth = industrial ? 1.35 : 0.65;
    b(0, 0.96, depth / 2 + 0.035, doorWidth + 0.23, 1.45, 0.1, trim);
    b(0, 0.94, depth / 2 + 0.1, doorWidth, 1.3, 0.08, dark);
    if (industrial)
      for (let y = 0.45; y < 1.6; y += 0.13)
        b(0, y, depth / 2 + 0.155, doorWidth, 0.045, 0.03, metal);
    else {
      b(0, 1.25, depth / 2 + 0.16, 0.42, 0.42, 0.025, glass);
      b(0.2, 0.8, depth / 2 + 0.18, 0.04, 0.09, 0.03, 0xe3bd75);
    }
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - 0.57);
      b(x, 1.4, depth / 2 + 0.055, 0.76, 0.85, 0.12, trim);
      b(x, 1.4, depth / 2 + 0.13, 0.61, 0.68, 0.035, glass, 0.75);
      b(x, 1.4, depth / 2 + 0.16, 0.035, 0.7, 0.025, stone);
      b(x, 1.04, depth / 2 + 0.21, 0.83, 0.1, 0.32, stone);
      for (const z of [-0.7, 0.4]) {
        b(side * (w / 2 + 0.04), 1.4, z, 0.06, 0.65, 0.7, trim);
        b(side * (w / 2 + 0.08), 1.4, z, 0.035, 0.5, 0.55, glass, 0.7);
      }
    }
    for (let i = 0; i < 3; i++)
      b(
        0,
        0.06 + i * 0.09,
        depth / 2 + 0.65 - i * 0.15,
        1.15,
        0.12,
        0.62,
        stone,
      );
    b(0, height + 0.36, 0, w + 0.35, 0.2, depth + 0.35, trim);
    b(0, height + 0.49, 0, w + 0.16, 0.1, depth + 0.12, stone);
    // Parapet with an inset living roof and solar collector, rather than a stacked hut roof.
    for (const z of [-1, 1])
      b(0, height + 0.66, z * (depth / 2 + 0.03), w + 0.15, 0.25, 0.13, stone);
    for (const x of [-1, 1])
      b(x * (w / 2 + 0.03), height + 0.66, 0, 0.13, 0.25, depth + 0.15, stone);
    b(-0.35, height + 0.57, -0.25, w * 0.55, 0.07, depth * 0.58, green);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++)
        b(
          w * 0.3,
          height + 0.65 + i * 0.015,
          -0.72 + j * 0.35,
          0.62,
          0.045,
          0.27,
          0x496e7c,
        );
    b(-w * 0.3, height + 0.85, -depth * 0.25, 0.55, 0.6, 0.55, metal);
    for (let i = 0; i < 4; i++)
      b(
        -w * 0.3,
        height + 0.67 + i * 0.12,
        -depth * 0.25 + 0.29,
        0.44,
        0.035,
        0.025,
        dark,
      );
    if (hq || lab) {
      b(w * 0.3, height + 1, -0.65, 0.07, 0.9, 0.07, metal);
      const dish = b(w * 0.3, height + 1.4, -0.65, 0.65, 0.12, 0.55, stone);
      dish.rotation.z = 0.3;
      b(-w * 0.32, height + 0.8, 0.5, 0.55, 0.35, 0.4, glass, 0.7);
    }
    if (hq) {
      b(-w * 0.3, height + 0.42, depth / 2 + 0.25, 0.13, 0.65, 0.13, stone);
      b(w * 0.3, height + 0.42, depth / 2 + 0.25, 0.13, 0.65, 0.13, stone);
      b(0, height + 0.78, depth / 2 + 0.25, w * 0.75, 0.15, 0.72, trim);
    }
    if (kind === "warehouse")
      for (const x of [-1, 1]) {
        b(x * 1.05, 0.52, depth / 2 + 0.45, 0.55, 0.55, 0.55, 0xaf956b);
        for (const y of [0.34, 0.66])
          b(x * 1.05, y, depth / 2 + 0.74, 0.6, 0.05, 0.035, dark);
      }
    if (kind === "house") {
      for (const x of [-0.7, 0.65]) {
        b(x, 0.62, depth / 2 + 0.46, 0.4, 0.25, 0.45, trim);
        k.facet(g, x, 0.9, depth / 2 + 0.46, 0.35, 0.35, 0.35, green);
      }
    }
  }
  k.batch(g);
  g.userData.architecture = "limestone-colony";
  return g;
}
