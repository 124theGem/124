import * as T from "three";
import { Models } from "./Models";
/** Carved ivory masonry, broken lintels, stair profiles and hanging vegetation from the art reference. */
export function sanctuary(kit: Models, variant = 0) {
  const root = new T.Group(),
    stone = [0xe4dcc3, 0xd5cbb0, 0xc6bd9e, 0xeee5cb],
    moss = [0x556e3c, 0x708745, 0x879b50];
  const block = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c = 0,
  ) => kit.stone(root, x, y, z, w, h, d, stone[c % 4]);
  // Split paving with imperfect edges: dark recesses separate the individual dressed blocks.
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++) {
      if ((x === -3 && z === 3) || (x === 3 && z === -3)) continue;
      block(
        x * 0.86,
        0.1,
        z * 0.86,
        0.83,
        0.2,
        0.83,
        (x * x + z * z + variant) % 4,
      );
      if ((x * 7 + z * 3 + variant) % 7 === 0)
        kit.box(
          root,
          x * 0.86 + 0.18,
          0.215,
          z * 0.86,
          0.42,
          0.035,
          0.3,
          moss[(x * x + z * z) % 3],
        );
    }
  for (const [x, z, h, w] of [
    [-2.55, -1.7, 5.2, 1.1],
    [1.25, -1.7, 6.8, 1.3],
    [2.6, 0.3, 4.2, 1.05],
    [-2.55, 1.8, 2.1, 0.95],
  ] as number[][]) {
    for (let i = 0; i < 3; i++)
      block(
        x,
        0.16 + i * 0.16,
        z,
        w + 0.44 - i * 0.1,
        0.14,
        w + 0.44 - i * 0.1,
        2,
      );
    let y = 0.55;
    for (let i = 0; y < h; i++) {
      const height = Math.min(0.95, h - y);
      block(
        x + (i % 3 === 0 ? 0.018 : 0),
        y + height / 2,
        z,
        w,
        height - 0.025,
        w,
        i % 3,
      );
      y += height;
    }
    block(x, h + 0.12, z, w + 0.35, 0.24, w + 0.35, 0);
    block(x, h + 0.31, z, w + 0.15, 0.14, w + 0.15, 3);
    for (let vine = 0; vine < 3; vine++) {
      const length = 1.7 + vine * 0.65;
      for (let j = 0; j < 7; j++) {
        const py = h - (j * length) / 7;
        kit.stem(
          root,
          new T.Vector3(x - w * 0.54, py, z + (vine - 1) * 0.26),
          new T.Vector3(
            x - w * 0.54 - 0.05,
            py - length / 7,
            z + (vine - 1) * 0.26,
          ),
          0.2,
          0x6a7844,
        );
        kit.leaf(
          root,
          x - w * 0.55 - 0.06,
          py - 0.14,
          z + (vine - 1) * 0.26,
          0.3,
          -Math.PI / 2 + (j % 2) * 0.7,
          moss[(j + vine) % 3],
          0.5,
        );
      }
    }
  }
  // Asymmetric lintel and a massive rear wall above the amber cascade.
  for (let i = 0; i < 5; i++)
    block(-2.55 + i * 0.92, 5.35, -1.7, 0.9, 0.65, 1.22, i % 3);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 5; j++)
      block(2.6, 0.6 + j * 0.92, -2.8 + i * 0.82, 1.1, 0.9, 0.8, (i + j) % 3);
  for (let j = 0; j < 4; j++) {
    block(-2.7, 0.55, 2.75 - j * 0.87, 0.28, 0.52, 0.83, 1);
    if (j < 3) block(-2.7, 1.13, 2.75 - j * 0.87, 0.44, 0.65, 0.42, 0);
  }
  // Broken bridge projects above the gorge; squared piers and hanging roots expose its depth.
  for (let i = 0; i < 6; i++) {
    block(-3.5 - i * 0.75, 0.05, 1.65, 0.72, 0.35, 1.45, i % 3);
    if (i % 2 === 0) {
      block(-3.5 - i * 0.75, -1.35, 1.65, 0.35, 2.55, 0.55, 2);
      for (let j = 0; j < 5; j++)
        kit.leaf(
          root,
          -3.6 - i * 0.75,
          -0.35 - j * 0.38,
          2.42,
          0.4,
          Math.PI,
          moss[j % 3],
          0.5,
        );
    }
  }
  // Inlaid terracotta compass tile, not a luminous UI marker.
  kit.box(root, -0.9, 0.218, 0.8, 1.15, 0.018, 1.15, 0xc87939);
  kit.box(root, -0.9, 0.23, 0.8, 0.91, 0.015, 0.91, 0xf1d5a1);
  kit.box(root, -0.9, 0.24, 0.8, 0.66, 0.014, 0.66, 0xca7e42);
  kit.box(root, -0.9, 0.25, 0.8, 0.35, 0.013, 0.35, 0xeed3a0);
  // Fallen masonry and tufts collect around the base.
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4,
      r = 3.6 + (i % 3) * 0.42,
      mesh = kit.box(
        root,
        Math.cos(a) * r,
        0.12,
        Math.sin(a) * r,
        0.55 + (i % 3) * 0.22,
        0.25,
        0.68,
        stone[i % 4],
      );
    mesh.rotation.y = a;
    for (let j = 0; j < 3; j++)
      kit.leaf(
        root,
        Math.cos(a) * r,
        0.3,
        Math.sin(a) * r,
        0.5,
        a + j * 2,
        moss[j],
        -0.3,
      );
  }
  return root;
}
