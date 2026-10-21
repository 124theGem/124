import * as T from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  SHIP_COLORS,
  SHIP_ENGINES,
  SHIP_FINISHES,
  shipConfiguration,
  starterShip,
  type Starship,
} from "../../shared/ships";

/** Shared hard-surface factory. Every viewport uses the same geometry and saved design. */
export class ShipModels {
  private geometries = new Map<string, T.BufferGeometry>();
  private materials = new Map<string, T.MeshStandardMaterial>();
  private textures: T.Texture[] = [];
  private surface = this.texture(false);
  private normal = this.texture(true);
  private texture(normal: boolean) {
    const n = 128,
      data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4,
          noise = ((x * 73 + y * 37 + x * y * 3) % 23) - 11;
        const seam = x % 64 < 1 || y % 32 < 1;
        data[i] = normal
          ? 128 + (seam ? 22 : noise * 0.3)
          : 210 + noise - (seam ? 35 : 0);
        data[i + 1] = normal ? 128 + noise * 0.3 : data[i];
        data[i + 2] = normal ? 255 : data[i];
        data[i + 3] = 255;
      }
    const texture = new T.DataTexture(data, n, n);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    this.textures.push(texture);
    return texture;
  }
  private geo(key: string, make: () => T.BufferGeometry) {
    if (!this.geometries.has(key)) this.geometries.set(key, make());
    return this.geometries.get(key)!;
  }
  private material(key: string, params: T.MeshPhysicalMaterialParameters) {
    if (!this.materials.has(key))
      this.materials.set(key, new T.MeshPhysicalMaterial(params));
    return this.materials.get(key)!;
  }
  private shape(key: string, points: number[][], depth: number) {
    return this.geo(key, () => {
      const s = new T.Shape();
      points.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
      s.closePath();
      const g = new T.ExtrudeGeometry(s, {
        depth,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.045,
        bevelThickness: 0.045,
      });
      g.rotateX(Math.PI / 2);
      g.translate(0, depth / 2, 0);
      return g;
    });
  }
  build(input: Starship = starterShip()) {
    const design = shipConfiguration(input),
      root = new T.Group();
    root.name = "starship";
    root.userData.design = structuredClone(design);
    root.userData.visual = "hard-surface-pbr";
    const finish = SHIP_FINISHES[design.finish],
      color = new T.Color(SHIP_COLORS[design.color]).lerp(
        new T.Color(design.finish === "carbon" ? 0x192532 : 0x9aacb9),
        design.finish === "carbon"
          ? 0.65
          : design.finish === "titanium"
            ? 0.2
            : 0,
      );
    const paint = this.material(`paint:${design.color}:${design.finish}`, {
      color,
      ...finish,
      map: this.surface,
      clearcoat: design.finish === "ceramic" ? 0.45 : 0.12,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.4,
      normalMap: this.normal,
      normalScale: new T.Vector2(0.18, 0.18),
      roughnessMap: this.surface,
    });
    const alloy = this.material("alloy", {
      color: 0x9baebc,
      map: this.surface,
      metalness: 0.85,
      roughness: 0.3,
      normalMap: this.normal,
      normalScale: new T.Vector2(0.09, 0.09),
      roughnessMap: this.surface,
    });
    const dark = this.material("dark", {
      color: 0x17232d,
      metalness: 0.65,
      roughness: 0.46,
      normalMap: this.normal,
    });
    const rubber = this.material("rubber", {
      color: 0x10151b,
      roughness: 0.85,
    });
    const accent = this.material("accent", {
      color: 0xe0aa54,
      metalness: 0.6,
      roughness: 0.35,
    });
    const engineColor = SHIP_ENGINES[design.engine].color;
    const luminous = this.material(`exhaust:${design.engine}`, {
      color: engineColor,
      emissive: engineColor,
      emissiveIntensity: 2.1,
      roughness: 0.25,
    });
    const glass = this.material("glass", {
      color: 0x17394c,
      metalness: 0.15,
      roughness: 0.08,
      transparent: true,
      opacity: 0.9,
      transmission: 0.18,
      thickness: 0.12,
      ior: 1.45,
      clearcoat: 0.8,
      envMapIntensity: 2.2,
    });
    const nav = (color: number) =>
      this.material(`nav:${color}`, {
        color,
        emissive: color,
        emissiveIntensity: 2.4,
      });
    const boxGeo = this.geo(
      "panel",
      () => new RoundedBoxGeometry(1, 1, 1, 1, 0.06),
    );
    const cylinder = this.geo("cylinder", () => {
      const g = new T.CylinderGeometry(1, 1, 1, 16);
      g.rotateX(Math.PI / 2);
      return g;
    });
    const nozzle = this.geo("nozzle", () => {
      const g = new T.CylinderGeometry(0.68, 1, 1, 20, 1, true);
      g.rotateX(Math.PI / 2);
      return g;
    });
    const torus = this.geo("ring", () => new T.TorusGeometry(1, 0.11, 6, 20));
    const detail = new T.Group();
    detail.name = "engineering-details";
    const part = (name: string) => {
      const g = new T.Group();
      g.name = name;
      g.userData.part = name;
      root.add(g);
      return g;
    };
    const hull = part("hull"),
      wings = part("wings"),
      engines = part("engine"),
      module = part("module"),
      gear = part("landing-gear");
    const mesh = (
      g: T.Object3D,
      geo: T.BufferGeometry,
      mat: T.Material,
      p: number[],
      scale: number[] = [1, 1, 1],
    ) => {
      const m = new T.Mesh(geo, mat);
      m.position.fromArray(p);
      m.scale.fromArray(scale);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const box = (
      g: T.Object3D,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => mesh(g, boxGeo, mat, [x, y, z], [w, h, d]);
    const width =
      design.hull === "freighter"
        ? 1.05
        : design.hull === "armored"
          ? 0.9
          : 0.63;
    const nose = design.hull === "needle" ? 2.05 : 1.6;
    mesh(
      hull,
      this.shape(
        `hull:${design.hull}`,
        [
          [0, nose],
          [width * 0.6, 1.2],
          [width, 0.15],
          [width * 0.8, -1.5],
          [-width * 0.8, -1.5],
          [-width, 0.15],
          [-width * 0.6, 1.2],
        ],
        0.56,
      ),
      paint,
      [0, 0.82, 0],
    );
    box(hull, dark, 0, 0.49, -0.4, width * 1.5, 0.16, 2.3);
    const canopy = box(hull, glass, 0, 1.21, 0.64, width * 1.15, 0.36, 1.1);
    canopy.rotation.x = -0.14;
    for (const s of [-1, 1]) {
      const rail = box(
        hull,
        alloy,
        s * width * 0.62,
        1.25,
        0.6,
        0.055,
        0.12,
        1.14,
      );
      rail.rotation.x = -0.14;
      box(hull, dark, s * width * 0.32, 1.07, 0.54, 0.15, 0.12, 0.3);
      const panel = box(
        hull,
        paint,
        s * width * 0.5,
        1.15,
        -0.65,
        width * 0.85,
        0.16,
        1.1,
      );
      panel.rotation.z = -s * 0.09;
      box(hull, alloy, s * width * 0.45, 0.96, 1.35, 0.08, 0.06, 0.7);
      // Layered wing profiles have distinct silhouettes, rather than scaled boxes.
      const points =
        design.wings === "delta"
          ? [
              [0, 0.6],
              [1.55, -1.25],
              [0, -1.05],
            ]
          : design.wings === "twin"
            ? [
                [0, 0.75],
                [0.8, 1.05],
                [0.95, -1.4],
                [0, -1.25],
              ]
            : [
                [0, 0.5],
                [1.7, -0.65],
                [1.45, -1.15],
                [0, -0.65],
              ];
      const wing = mesh(
        wings,
        this.shape(
          `wing:${design.wings}:${s}`,
          points.map(([x, z]) => [x * s, z]),
          0.12,
        ),
        paint,
        [s * width * 0.6, 0.78, 0],
      );
      box(
        wings,
        alloy,
        s * (width + 0.65),
        0.87,
        -0.7,
        0.6,
        0.045,
        0.15,
      ).rotation.y = s * 0.4;
      const fin = box(
        wings,
        paint,
        s * (width + 1.05),
        1.02,
        -0.95,
        0.1,
        0.48,
        0.6,
      );
      fin.rotation.z = s * -0.25;
      box(
        wings,
        nav(s < 0 ? 0xff5a56 : 0x78f1b6),
        s * (width + 1.12),
        1.05,
        -0.92,
        0.07,
        0.06,
        0.2,
      );
      const engineX = s * (width + 0.35),
        radius =
          design.engine === "fusion"
            ? 0.32
            : design.engine === "plasma"
              ? 0.27
              : 0.23;
      mesh(
        engines,
        cylinder,
        dark,
        [engineX, 0.73, -0.7],
        [radius * 1.12, radius * 1.12, 1.6],
      );
      mesh(
        engines,
        cylinder,
        paint,
        [engineX, 0.73, -0.45],
        [radius * 1.18, radius * 1.18, 0.9],
      );
      mesh(
        engines,
        nozzle,
        alloy,
        [engineX, 0.73, -1.55],
        [radius * 1.3, radius * 1.3, 0.38],
      );
      mesh(
        engines,
        cylinder,
        dark,
        [engineX, 0.73, -1.66],
        [radius, radius, 0.045],
      );
      mesh(
        engines,
        torus,
        luminous,
        [engineX, 0.73, -1.7],
        [radius * 0.77, radius * 0.77, radius * 0.77],
      );
      mesh(
        engines,
        cylinder,
        luminous,
        [engineX, 0.73, -1.68],
        [radius * 0.34, radius * 0.34, 0.04],
      );
      for (let i = 0; i < (design.engine === "fusion" ? 8 : 5); i++) {
        mesh(
          detail,
          torus,
          alloy,
          [engineX, 0.73, -0.1 - i * 0.2],
          [radius * 1.16, radius * 1.16, radius * 0.5],
        );
      }
      // Hydraulic landing legs and broad foot pads keep the model aligned with the saved pad.
      const leg = box(
        gear,
        alloy,
        s * width * 0.7,
        0.28,
        -0.68,
        0.075,
        0.45,
        0.09,
      );
      leg.rotation.z = s * 0.24;
      box(gear, rubber, s * width * 0.77, 0.07, -0.68, 0.38, 0.1, 0.5);
      box(gear, alloy, s * width * 0.77, 0.13, -0.68, 0.4, 0.04, 0.5);
      for (let i = 0; i < 7; i++) {
        box(
          detail,
          dark,
          s * width * 0.6,
          1.245,
          -1.08 + i * 0.105,
          width * 0.55,
          0.025,
          0.035,
        );
        box(
          detail,
          alloy,
          s * width * 0.88,
          0.83,
          -1.15 + i * 0.27,
          0.025,
          0.045,
          0.028,
        );
      }
      for (let i = 0; i < 3; i++)
        box(
          detail,
          accent,
          s * width * 0.65,
          1.25,
          -0.2 + i * 0.11,
          0.07,
          0.023,
          0.045,
        );
      if (design.class === "combat") {
        mesh(
          module,
          cylinder,
          dark,
          [s * (width + 0.7), 0.68, 0.6],
          [0.065, 0.065, 1.35],
        );
        mesh(
          module,
          torus,
          alloy,
          [s * (width + 0.7), 0.68, 1.27],
          [0.08, 0.08, 0.08],
        );
      }
      if (design.class === "cargo" || design.module === "hold")
        for (let i = 0; i < design.model; i++) {
          box(
            module,
            dark,
            s * width * 0.58,
            1.3,
            -0.9 + i * 0.45,
            0.53,
            0.43,
            0.4,
          );
          box(
            module,
            alloy,
            s * width * 0.58,
            1.53,
            -0.9 + i * 0.45,
            0.55,
            0.045,
            0.42,
          );
          box(
            module,
            accent,
            s * width * 0.58,
            1.55,
            -0.9 + i * 0.45,
            0.1,
            0.025,
            0.32,
          );
        }
      if (design.module === "shield")
        for (let i = 0; i < 3; i++)
          box(
            module,
            alloy,
            s * width * 0.92,
            1.08,
            -0.9 + i * 0.6,
            0.2,
            0.33,
            0.5,
          );
    }
    box(gear, alloy, 0, 0.25, 1.05, 0.09, 0.45, 0.09);
    box(gear, rubber, 0, 0.065, 1.05, 0.32, 0.1, 0.4);
    box(hull, accent, 0, 1.13, 1.42, 0.13, 0.025, 0.4);
    for (const side of [-1, 1]) {
      box(
        detail,
        dark,
        side * width * 0.49,
        1.143,
        1.1,
        0.014,
        0.012,
        0.74,
      ).rotation.y = -side * 0.13;
      box(detail, dark, side * width * 0.7, 1.147, 0.05, 0.014, 0.012, 0.48);
      box(detail, alloy, side * width * 0.47, 1.155, 1.42, 0.024, 0.018, 0.08);
      box(hull, dark, side * 0.2, 1.405, 0.65, 0.025, 0.018, 1.05);
      box(
        hull,
        alloy,
        side * width * 0.65,
        0.88,
        0.74,
        0.06,
        0.15,
        0.55,
      ).rotation.y = -side * 0.15;
      for (let stripe = 0; stripe < 3; stripe++)
        box(
          detail,
          accent,
          side * (width + 0.56),
          0.92,
          -0.45 + stripe * 0.1,
          0.23,
          0.015,
          0.04,
        ).rotation.y = side * 0.4;
      // Surface fasteners, access hatch and contrasting panel seals remain readable up close.
      box(detail, dark, side * width * 0.85, 0.88, -0.18, 0.04, 0.24, 0.43);
      box(detail, paint, side * width * 0.88, 0.88, -0.18, 0.025, 0.2, 0.37);
      box(detail, alloy, side * width * 0.9, 0.92, -0.07, 0.025, 0.03, 0.08);
    }
    if (design.module === "hold")
      for (const side of [-1, 1]) {
        box(module, dark, side * (width + 0.08), 0.49, 0.5, 0.52, 0.4, 0.94);
        box(module, alloy, side * (width + 0.08), 0.71, 0.5, 0.54, 0.05, 0.97);
        for (const z of [0.2, 0.8])
          box(module, accent, side * (width + 0.08), 0.75, z, 0.55, 0.04, 0.06);
      }
    if (design.module === "survey") {
      box(module, alloy, 0, 1.43, -1.1, 0.6, 0.14, 0.32);
      for (const x of [-0.2, 0, 0.2]) {
        mesh(module, cylinder, dark, [x, 1.56, -1.06], [0.08, 0.08, 0.24]);
        mesh(module, cylinder, glass, [x, 1.56, -0.93], [0.06, 0.06, 0.02]);
      }
    }
    if (typeof document !== "undefined") {
      const key = `marking:${design.class}:${design.model}`;
      let marking = this.materials.get(key);
      if (!marking) {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = "#d6e3df";
        ctx.font = "bold 43px monospace";
        ctx.fillText(`LP / 0${design.model}`, 16, 52);
        ctx.font = "16px monospace";
        ctx.fillStyle = "#b8c5c6";
        ctx.fillText("AURORA  /  ORBITAL SYSTEMS", 17, 84);
        ctx.fillStyle = "#dba968";
        ctx.fillRect(17, 104, 148, 5);
        const texture = new T.CanvasTexture(canvas);
        texture.colorSpace = T.SRGBColorSpace;
        this.textures.push(texture);
        marking = this.material(key, {
          map: texture,
          transparent: true,
          depthWrite: false,
          roughness: 0.55,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        });
      }
      const decal = mesh(
        detail,
        this.geo("decal", () => new T.PlaneGeometry(1, 1)),
        marking,
        [width * 0.6, 1.25, -0.62],
        [0.43, 0.14, 1],
      );
      decal.rotation.x = -Math.PI / 2;
    }
    if (design.class === "exploration" || design.module === "survey") {
      box(module, alloy, 0, 1.55, -0.65, 0.04, 0.65, 0.04);
      mesh(module, cylinder, dark, [0, 1.88, -0.61], [0.18, 0.18, 0.11]);
      mesh(module, cylinder, glass, [0, 1.88, -0.54], [0.14, 0.14, 0.015]);
    }
    for (let i = 0; i < design.model; i++)
      box(detail, alloy, 0, 1.2, -1.2 + i * 0.18, 0.16, 0.1, 0.07);
    // Instance engineering fittings; discard just this LOD at a distance on mobile.
    for (const group of [hull, wings, engines, module, gear, detail])
      this.batch(group);
    const lod = new T.LOD();
    lod.addLevel(detail, 0);
    lod.addLevel(new T.Group(), 45);
    root.add(lod);
    root.scale.setScalar(0.82 + design.model * 0.08);
    root.userData.parts = ["hull", "wings", "engine", "module", "landing-gear"];
    return root;
  }
  cabin(input: Starship = starterShip()) {
    const design = shipConfiguration(input),
      root = new T.Group();
    root.userData.design = structuredClone(design);
    const geo = this.geo(
      "cabin-panel",
      () => new RoundedBoxGeometry(1, 1, 1, 2, 0.04),
    );
    const metal = this.material("cabin-metal", {
      color: 0x253443,
      metalness: 0.7,
      roughness: 0.37,
      normalMap: this.normal,
    });
    const trim = this.material(`cabin-trim:${design.color}`, {
      color: SHIP_COLORS[design.color],
      metalness: 0.6,
      roughness: 0.3,
    });
    const black = this.material("cabin-black", {
      color: 0x090f18,
      roughness: 0.55,
    });
    const light = this.material(`cabin-screen:${design.engine}`, {
      color: SHIP_ENGINES[design.engine].color,
      emissive: SHIP_ENGINES[design.engine].color,
      emissiveIntensity: 0.9,
      roughness: 0.18,
    });
    const amber = this.material("cabin-amber", {
      color: 0xedb96f,
      emissive: 0xedb96f,
      emissiveIntensity: 0.8,
    });
    const box = (
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(w, h, d);
      root.add(m);
      return m;
    };
    box(metal, 0, -0.62, -0.91, 2.1, 0.34, 0.65);
    box(trim, 0, -0.45, -0.9, 0.76, 0.11, 0.4);
    box(black, 0, -0.38, -1.04, 0.52, 0.12, 0.05);
    for (const side of [-1, 1]) {
      const frame = box(trim, side * 0.73, 0.04, -1.3, 0.047, 1.15, 0.085);
      frame.rotation.z = side * 0.17;
      const seal = box(black, side * 0.7, 0.04, -1.29, 0.023, 1.13, 0.08);
      seal.rotation.z = side * 0.17;
      const console = box(metal, side * 0.59, -0.4, -1.02, 0.48, 0.3, 0.23);
      console.rotation.x = -0.3;
      box(black, side * 0.59, -0.355, -0.9, 0.4, 0.19, 0.025).rotation.x = -0.3;
      for (let line = 0; line < 4; line++)
        box(
          line === 0 ? light : amber,
          side * 0.59,
          -0.31 - line * 0.031,
          -0.88,
          0.29 - (line % 3) * 0.055,
          0.008,
          0.009,
        );
      for (let button = 0; button < 6; button++)
        box(
          button % 3 ? light : amber,
          side * 0.59 + (button - 2.5) * 0.055,
          -0.49,
          -0.78,
          0.023,
          0.023,
          0.035,
        );
      box(trim, side * 0.34, -0.32, -0.82, 0.05, 0.2, 0.06).rotation.x = -0.2;
      box(black, side * 0.34, -0.22, -0.81, 0.11, 0.075, 0.09);
      box(trim, side * 0.36, -0.39, -0.72, 0.18, 0.11, 0.28);
      for (let fastener = 0; fastener < 5; fastener++)
        box(
          metal,
          side * 0.75,
          -0.35 + fastener * 0.18,
          -1.24,
          0.027,
          0.027,
          0.02,
        );
    }
    box(trim, 0, 0.61, -1.35, 1.75, 0.07, 0.11);
    box(light, 0, 0.58, -1.28, 0.35, 0.012, 0.02);
    if (design.module !== "standard") {
      box(metal, 0, -0.38, -0.91, 0.38, 0.13, 0.08);
      box(light, 0, -0.35, -0.86, 0.28, 0.045, 0.012);
    }
    this.batch(root);
    root.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
    return root;
  }
  private batch(root: T.Group) {
    root.updateMatrixWorld(true);
    const buckets = new Map<
      string,
      { geo: T.BufferGeometry; mat: T.Material; matrices: T.Matrix4[] }
    >();
    root.traverse((o) => {
      if (o instanceof T.Mesh) {
        const key = o.geometry.uuid + (o.material as T.Material).uuid;
        if (!buckets.has(key))
          buckets.set(key, {
            geo: o.geometry,
            mat: o.material as T.Material,
            matrices: [],
          });
        buckets.get(key)!.matrices.push(o.matrix.clone());
      }
    });
    root.clear();
    for (const b of buckets.values()) {
      const m = new T.InstancedMesh(b.geo, b.mat, b.matrices.length);
      b.matrices.forEach((matrix, i) => m.setMatrixAt(i, matrix));
      m.castShadow = m.receiveShadow = true;
      root.add(m);
    }
  }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
  }
}
