import * as T from "three";
/** Original deterministic brushed paint, edge wear, oil and micro-relief. No remote assets. */
export class IndustrialSurface {
  readonly color: T.DataTexture;
  readonly normal: T.DataTexture;
  readonly roughness: T.DataTexture;
  readonly ao: T.DataTexture;
  constructor(resolution = 1024) {
    const n = resolution,
      albedo = new Uint8Array(n * n * 4),
      normals = new Uint8Array(n * n * 4),
      rough = new Uint8Array(n * n * 4),
      ambient = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4,
          hash =
            (Math.imul(x + 37, y + 913) ^
              Math.imul(x, 73856093) ^
              Math.imul(y, 19349663)) >>>
            0,
          grain = (hash % 13) - 6;
        const edge = Math.min(x, n - 1 - x, y, n - 1 - y),
          scratch = hash % 317 === 0 && x % 61 < 28 ? 27 : 0;
        const dirt =
          (Math.sin(x * 0.009 + y * 0.013) * Math.cos(y * 0.021 - x * 0.004) +
            1) *
          6;
        const value = Math.min(
          255,
          240 + grain - dirt - (edge < 3 ? 26 : 0) + scratch,
        );
        albedo.set([value, value, value - 2, 255], i);
        const brushed = Math.sin(y * 2.7) * 1.5 + grain * 0.2;
        normals.set([128 + brushed, 128 + grain * 0.3, 255, 255], i);
        const r = 155 + grain * 2 + dirt * 2 - (scratch ? 50 : 0);
        rough.set([r, r, r, 255], i);
        const a = edge < 2 ? 170 : edge < 5 ? 225 : 255;
        ambient.set([a, a, a, 255], i);
      }
    const make = (data: Uint8Array, srgb = false) => {
      const t = new T.DataTexture(data, n, n);
      t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.generateMipmaps = true;
      t.minFilter = T.LinearMipmapLinearFilter;
      t.magFilter = T.LinearFilter;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    };
    this.color = make(albedo, true);
    this.normal = make(normals);
    this.roughness = make(rough);
    this.ao = make(ambient);
  }
  dispose() {
    this.color.dispose();
    this.normal.dispose();
    this.roughness.dispose();
    this.ao.dispose();
  }
}
