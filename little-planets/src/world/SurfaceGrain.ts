import * as T from "three";
/** Small deterministic texture shared by voxel props; no downloads or save changes. */
export function surfaceGrain() {
  const n = 64,
    data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4,
        noise = ((x * 19 + y * 31 + x * y * 7) % 13) - 6;
      data[i] = 128 + noise;
      data[i + 1] = 128 + (((x * 13 + y * 17) % 11) - 5);
      data[i + 2] = 254;
      data[i + 3] = 255;
    }
  const texture = new T.DataTexture(data, n, n);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
