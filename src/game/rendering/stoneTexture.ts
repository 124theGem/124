import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';

/** Original seamless albedo + tangent-space normals. No blurry screenshot or external texture URL. */
export function ancientStoneTextures(scene: Scene) {
  const size = 512,
    cell = 128,
    heights = new Float32Array(size * size);
  const albedo = new DynamicTexture('ancient-cut-stone-albedo', size, scene, true);
  const normal = new DynamicTexture('ancient-cut-stone-normal', size, scene, true);
  const ctx = albedo.getContext(),
    image = new ImageData(size, size);
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / cell),
        u = (x + ((row % 2) * cell) / 2) % cell,
        v = y % cell;
      const edge = Math.min(u, cell - u, v, cell - v),
        bevel = Math.min(1, Math.max(0, (edge - 2) / 7));
      const tile = hash(Math.floor((x + ((row % 2) * cell) / 2) / cell) % 4, row),
        grain = hash(x, y),
        moss = Math.max(0, Math.sin(x * 0.023) * Math.cos(y * 0.037) - 0.3) * (1 - bevel * 0.75);
      const crack =
        Math.abs(Math.sin(u * 0.035 + v * 0.048 + tile * 8)) < 0.016 && edge > 8 ? 0.36 : 1;
      const tone = (0.42 + bevel * 0.58) * (0.87 + tile * 0.23) * (0.97 + grain * 0.06) * crack;
      const i = (y * size + x) * 4;
      image.data[i] = Math.round(166 * tone - moss * 25);
      image.data[i + 1] = Math.round(153 * tone + moss * 45);
      image.data[i + 2] = Math.round(108 * tone - moss * 35);
      image.data[i + 3] = 255;
      heights[y * size + x] = bevel * 0.8 + (grain - 0.5) * 0.03 - (1 - crack) * 0.15;
    }
  ctx.putImageData(image, 0, 0);
  albedo.update();
  const nctx = normal.getContext(),
    nimage = new ImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const h = (dx: number, dy: number) =>
        heights[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      const dx = (h(-1, 0) - h(1, 0)) * 1.3,
        dy = (h(0, -1) - h(0, 1)) * 1.3,
        len = Math.hypot(dx, dy, 1),
        i = (y * size + x) * 4;
      nimage.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      nimage.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nimage.data[i + 2] = (0.5 / len + 0.5) * 255;
      nimage.data[i + 3] = 255;
    }
  nctx.putImageData(nimage, 0, 0);
  normal.gammaSpace = false;
  normal.update();
  albedo.anisotropicFilteringLevel = 8;
  normal.anisotropicFilteringLevel = 8;
  normal.level = 0.45;
  return { albedo, normal };
}
