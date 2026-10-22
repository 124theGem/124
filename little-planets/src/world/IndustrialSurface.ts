import * as T from "three";
/** Original deterministic brushed paint, edge wear, oil and micro-relief. No remote assets. */
export class IndustrialSurface {
  readonly color: T.DataTexture;
  readonly normal: T.DataTexture;
  readonly roughness: T.DataTexture;
  readonly ao: T.DataTexture;
  readonly metalness: T.DataTexture;
  constructor(resolution = 1024) {
    const n = resolution,
      albedo = new Uint8Array(n * n * 4),
      normals = new Uint8Array(n * n * 4),
      rough = new Uint8Array(n * n * 4),
      ambient = new Uint8Array(n * n * 4);
    const metallic = new Uint8Array(n * n * 4);
    const pitch = n / 4;
    const relief = (x: number, y: number) => {
      const u = (x + n) % pitch,
        v = (y + n) % pitch;
      const edge = Math.min(u, pitch - u, v, pitch - v);
      return edge < 2 ? -0.75 : edge < 5 ? -0.15 : Math.sin(y * 2.7) * 0.006;
    };
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4,
          hash =
            (Math.imul(x + 37, y + 913) ^
              Math.imul(x, 73856093) ^
              Math.imul(y, 19349663)) >>>
            0;
        const grain = (hash % 17) - 8,
          u = x % pitch,
          v = y % pitch;
        const edge = Math.min(u, pitch - u, v, pitch - v);
        const panel =
          (Math.floor(x / pitch) * 13 + Math.floor(y / pitch) * 7) % 11;
        const streak =
          Math.max(0, Math.sin(x * 0.12) * Math.sin(x * 0.037) - 0.18) *
          Math.exp((-v / pitch) * 2) *
          25;
        const grime =
          (Math.sin(x * 0.021 + y * 0.017) * Math.cos(y * 0.027) + 1) * 7 +
          streak;
        const scratch = hash % 499 === 0 && edge < 20 ? 30 : 0;
        const seam = edge < 2 ? 72 : edge < 5 ? 32 : 0;
        const wear = edge >= 5 && edge < 7 ? 17 : 0;
        const value = Math.min(
          255,
          239 - panel + grain * 0.45 - grime - seam + wear + scratch,
        );
        albedo.set(
          [
            value,
            Math.max(0, value - grime * 0.07),
            Math.max(0, value - grime * 0.13),
            255,
          ],
          i,
        );
        const dx = (relief(x + 1, y) - relief(x - 1, y)) * 65,
          dy = (relief(x, y + 1) - relief(x, y - 1)) * 65;
        normals.set([128 - dx, 128 - dy + grain * 0.12, 250, 255], i);
        const r = Math.min(
          255,
          165 + grain + grime * 1.3 + (edge < 5 ? 35 : 0) - wear * 3 - scratch,
        );
        rough.set([r, r, r, 255], i);
        const ao = edge < 2 ? 130 : edge < 5 ? 205 : 255;
        ambient.set([ao, ao, ao, 255], i);
        const met = edge < 5 ? 180 : 225 - grime;
        metallic.set([met, met, met, 255], i);
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
    this.metalness = make(metallic);
  }
  dispose() {
    this.color.dispose();
    this.normal.dispose();
    this.roughness.dispose();
    this.ao.dispose();
    this.metalness.dispose();
  }
}
