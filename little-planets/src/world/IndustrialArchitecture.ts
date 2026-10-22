import { graphicsQuality } from "./Graphics";
import * as T from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { IndustrialSurface } from "./IndustrialSurface";
/** Original outpost architecture: panelled pressure modules on exposed service chassis. */
export class IndustrialArchitecture {
  private surface = new IndustrialSurface(
    graphicsQuality() === "high"
      ? 1024
      : graphicsQuality() === "economy"
        ? 256
        : 512,
  );
  private boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.035);
  private cylinder = new T.CylinderGeometry(1, 1, 1, 24);
  private sphere = new T.SphereGeometry(1, 24, 12);
  private dishGeo = new T.LatheGeometry(
    Array.from(
      { length: 14 },
      (_, i) => new T.Vector2(i / 13, 0.38 * (i / 13) ** 2),
    ),
    40,
  );
  private materials = new Map<string, T.MeshStandardMaterial>();
  private labels = new Map<string, T.Texture>();
  private plane = new T.PlaneGeometry(1, 1);
  private mat(color: number, metal = 0.25, rough = 0.7, glow = false) {
    const key = `${color}:${metal}:${rough}:${glow}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new T.MeshPhysicalMaterial({
          color,
          metalness: metal,
          roughness: rough,
          map: glow ? null : this.surface.color,
          normalMap: glow ? null : this.surface.normal,
          normalScale: new T.Vector2(0.12, 0.12),
          roughnessMap: glow ? null : this.surface.roughness,
          aoMap: glow ? null : this.surface.ao,
          metalnessMap: glow ? null : this.surface.metalness,
          aoMapIntensity: 0.4,
          emissive: glow ? color : 0,
          emissiveIntensity: glow ? 1.5 : 0,
          clearcoat: 0.08,
        }),
      );
    const material = this.materials.get(key)!;
    if (glow) {
      material.userData.architectureFixture = true;
      material.userData.baseGlow = 1.5;
    }
    return material;
  }
  build(kind: string, level = 1) {
    if (
      ["house", "headquarters", "warehouse", "refinery", "scanner"].includes(
        kind,
      )
    )
      return this.specialized(kind, level);
    const root = new T.Group(),
      main = new T.Group(),
      detail = new T.Group();
    root.name = `outpost-${kind}`;
    root.add(main);
    const paint = this.mat(0xc5c9c5),
      dark = this.mat(0x343c40, 0.65),
      metal = this.mat(0x7b8586, 0.82, 0.45),
      accent = this.mat(0x597675, 0.45),
      light = this.mat(0xffd8a6, 0, 0.6, true),
      black = this.mat(0x161e22, 0.1, 0.9);
    const glazingKey = "glazing";
    if (!this.materials.has(glazingKey))
      this.materials.set(
        glazingKey,
        new T.MeshPhysicalMaterial({
          color: 0x7e9a9d,
          metalness: 0.12,
          roughness: 0.13,
          transmission: 0.35,
          transparent: true,
          opacity: 0.6,
          thickness: 0.06,
          ior: 1.46,
        }),
      );
    const glass = this.materials.get(glazingKey)!;
    const mesh = (
      g: T.Group,
      geo: T.BufferGeometry,
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
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const b = (
      g: T.Group,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => mesh(g, this.boxGeo, mat, x, y, z, w, h, d);
    const c = (
      g: T.Group,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      r: number,
      h: number,
    ) => mesh(g, this.cylinder, mat, x, y, z, r, h, r);
    const beam = (
      g: T.Group,
      mat: T.Material,
      a: T.Vector3,
      v: T.Vector3,
      r: number,
    ) => {
      const m = c(g, mat, 0, 0, 0, r, a.distanceTo(v));
      m.position.copy(a).add(v).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        v.clone().sub(a).normalize(),
      );
      return m;
    };
    const yard = kind === "shipyard",
      store = kind === "warehouse",
      refinery = kind === "refinery",
      green = kind === "greenhouse",
      drill = kind === "extractor" || kind === "bioextractor";
    const w = yard ? 4 : kind === "house" ? 2.3 : store ? 2.6 : 3,
      d = yard ? 3.5 : 2.7,
      h = yard ? 2.8 : store ? 2.25 : 2.4;
    // Load-bearing frame, jacks, hydraulic braces and insulated segmented floor.
    b(main, dark, 0, 0.34, 0, w, 0.23, d);
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const xx = x * (w / 2 - 0.15),
          zz = z * (d / 2 - 0.17);
        b(main, dark, xx, 0.22, zz, 0.28, 0.4, 0.36);
        c(main, metal, xx, 0.36, zz, 0.065, 0.55);
        b(main, metal, xx, 0.04, zz, 0.44, 0.07, 0.5);
        beam(
          detail,
          metal,
          new T.Vector3(xx, 0.12, zz),
          new T.Vector3(xx - x * 0.25, 0.65, zz - z * 0.3),
          0.035,
        );
      }
    for (let i = 0; i < 6; i++)
      b(
        main,
        metal,
        0,
        0.49,
        -d / 2 + 0.24 + (i * (d - 0.48)) / 5,
        w - 0.18,
        0.07,
        (d - 0.48) / 6 - 0.015,
      );
    if (!yard && !drill) {
      // Real doorway: the front wall comprises two jambs and a lintel around an open recess.
      b(main, dark, 0, 1.4, -d / 2 + 0.07, w - 0.08, 1.95, 0.13);
      for (const side of [-1, 1]) {
        b(main, dark, side * (w / 2 - 0.07), 1.4, 0, 0.13, 1.95, d - 0.08);
        for (let col = 0; col < 5; col++) {
          const z = -d / 2 + 0.29 + (col * (d - 0.25)) / 5;
          b(
            main,
            paint,
            (side * w) / 2,
            1.42,
            z,
            0.1,
            1.8,
            (d - 0.25) / 5 - 0.028,
          );
          b(
            detail,
            accent,
            side * (w / 2 + 0.058),
            0.81,
            z,
            0.012,
            0.11,
            (d - 0.25) / 5 - 0.05,
          );
          for (const y of [0.65, 2.14])
            b(detail, metal, side * (w / 2 + 0.07), y, z, 0.018, 0.032, 0.032);
        }
        b(
          main,
          paint,
          side * (w / 4 + 0.22),
          1.4,
          d / 2,
          w / 2 - 0.48,
          1.9,
          0.14,
        );
        b(detail, metal, side * 0.43, 1.23, d / 2 + 0.08, 0.09, 1.5, 0.14);
      }
      b(main, paint, 0, 2.18, d / 2, 1, 0.35, 0.18);
      b(main, black, 0, 1.16, -d / 2 + 0.19, 0.7, 1.25, 0.07);
      for (const side of [-1, 1]) {
        b(main, metal, side * 0.45, 1.1, 0.1, 0.24, 1, 0.48);
        for (let j = 0; j < 5; j++)
          b(
            detail,
            j === 0 ? light : dark,
            side * 0.45,
            0.76 + j * 0.14,
            0.35,
            0.17,
            0.045,
            0.015,
          );
      }
      b(detail, light, 0, 1.91, d / 2 + 0.11, 0.4, 0.035, 0.03);
      b(main, paint, 0, 2.45, 0, w + 0.1, 0.18, d + 0.12);
      for (let j = 0; j < 4; j++)
        b(
          detail,
          metal,
          0,
          2.56,
          -d / 2 + 0.35 + j * 0.65,
          w - 0.4,
          0.035,
          0.024,
        );
      // Framed windows and visible internal equipment inside the entrance.
      for (const side of [-1, 1]) {
        b(main, metal, side * (w / 2 + 0.07), 1.7, -0.45, 0.08, 0.63, 0.85);
        b(main, glass, side * (w / 2 + 0.12), 1.7, -0.45, 0.014, 0.48, 0.69);
        b(detail, dark, side * (w / 2 + 0.14), 1.7, -0.45, 0.01, 0.5, 0.035);
      }
      b(detail, metal, -0.22, 0.95, d / 2 - 0.23, 0.16, 0.75, 0.12);
      for (let j = 0; j < 5; j++)
        b(
          detail,
          light,
          -0.22,
          0.77 + j * 0.08,
          d / 2 - 0.16,
          0.07,
          0.018,
          0.012,
        );
    }
    // Entry ramp, handrails, tread strips and utility umbilicals.
    if (!yard && !drill) {
      const ramp = b(main, dark, 0, 0.24, d / 2 + 0.48, 0.82, 0.09, 0.9);
      ramp.rotation.x = 0.4;
      for (let j = 0; j < 7; j++)
        b(
          detail,
          metal,
          0,
          0.1 + j * 0.05,
          d / 2 + 0.86 - j * 0.12,
          0.75,
          0.02,
          0.03,
        );
      for (const side of [-1, 1]) {
        beam(
          detail,
          metal,
          new T.Vector3(side * 0.48, 0.55, d / 2 + 0.9),
          new T.Vector3(side * 0.48, 1, d / 2),
          0.018,
        );
        beam(
          detail,
          metal,
          new T.Vector3(side * 0.48, 0.12, d / 2 + 0.9),
          new T.Vector3(side * 0.48, 0.55, d / 2 + 0.9),
          0.018,
        );
      }
    }
    for (const side of [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const radiator = b(
          main,
          dark,
          side * (w / 2 - 0.32),
          h + 0.4,
          -0.6 + j * 0.5,
          0.45,
          0.32,
          0.38,
        );
        for (let fin = 0; fin < 7; fin++)
          b(
            detail,
            metal,
            radiator.position.x - 0.18 + fin * 0.06,
            h + 0.58,
            radiator.position.z,
            0.02,
            0.07,
            0.32,
          );
      }
      const pipeX = side * (w / 2 + 0.16);
      beam(
        detail,
        metal,
        new T.Vector3(pipeX, 0.6, -1),
        new T.Vector3(pipeX, 2.1, -1),
        0.035,
      );
      for (const y of [0.7, 1.3, 1.9])
        c(detail, dark, pipeX, y, -1, 0.055, 0.05);
    }
    if (store) {
      // Cargo annex with roller door, pallets and lifting rail.
      b(main, dark, 0, 1.17, -d / 2 - 0.1, 1.55, 1.4, 0.12);
      for (let j = 0; j < 11; j++)
        b(detail, metal, 0, 0.55 + j * 0.12, -d / 2 - 0.18, 1.4, 0.065, 0.04);
      b(main, accent, 0, 2.1, -d / 2 - 0.22, 1.9, 0.16, 0.18);
      for (const x of [-0.8, 0.1, 0.85]) {
        b(main, dark, x, 0.52, d / 2 + 0.18, 0.58, 0.08, 0.45);
        b(main, paint, x, 0.8, d / 2 + 0.18, 0.5, 0.5, 0.4);
        b(detail, accent, x, 0.85, d / 2 + 0.39, 0.035, 0.4, 0.015);
      }
    } else if (yard) {
      // Open fabrication hall with overhead gantry and articulated manufacturing tooling.
      for (const x of [-1, 1]) {
        for (const z of [-1, 1])
          b(main, dark, x * 1.85, 1.7, z * 1.5, 0.24, 2.5, 0.24);
        b(main, paint, x * 1.85, 2.85, 0, 0.35, 0.45, 3.5);
        for (let j = 0; j < 4; j++)
          b(main, paint, x * 1.95, 1.1, -1.2 + j * 0.8, 0.18, 0.7, 0.68);
        beam(
          main,
          metal,
          new T.Vector3(x * 1.65, 0.65, -0.8),
          new T.Vector3(x * 0.85, 1.6, -0.35),
          0.075,
        );
        beam(
          main,
          accent,
          new T.Vector3(x * 0.85, 1.6, -0.35),
          new T.Vector3(x * 0.55, 1.1, 0.2),
          0.065,
        );
        c(detail, metal, x * 0.85, 1.6, -0.35, 0.16, 0.15);
      }
      b(main, metal, 0, 2.9, -0.4, 3.5, 0.2, 0.35);
      b(main, accent, 0, 2.7, -0.4, 0.55, 0.3, 0.5);
      beam(
        detail,
        dark,
        new T.Vector3(0, 2.6, -0.4),
        new T.Vector3(0, 1.8, -0.4),
        0.025,
      );
      b(main, dark, 0, 0.55, 0, 1.7, 0.1, 2.5);
      for (let j = 0; j < 6; j++)
        b(detail, light, 0, 0.62, -1 + j * 0.4, 0.06, 0.012, 0.15);
    } else if (kind === "scanner") {
      const mount = new T.Group();
      mount.position.set(0, 3.3, 0);
      mount.rotation.z = 0.6;
      main.add(mount);
      const dish = mesh(mount, this.dishGeo, paint, 0, 0, 0, 1.15, 1.15, 1.15);
      dish.material = paint;
      c(mount, metal, 0, 0.42, 0, 0.05, 0.75);
      c(main, dark, 0, 2.9, 0, 0.25, 0.7);
      for (let i = 0; i < level + 2; i++) {
        const angle = (i / (level + 2)) * Math.PI * 2,
          x = Math.cos(angle) * 1.05,
          z = Math.sin(angle) * 1.05,
          high = 1.1 + (i % 3) * 0.25 + level * 0.055;
        c(main, metal, x, 2.5 + high / 2, z, 0.025, high);
        b(detail, accent, x, 2.65, z, 0.22, 0.42, 0.07);
        c(detail, light, x, 2.5 + high, z, 0.045, 0.06);
      }
    } else if (kind === "telescope") {
      const dome = mesh(main, this.sphere, paint, 0, 2.5, 0, 0.95, 0.65, 0.95);
      dome.scale.y = 0.65;
      const tube = new T.Group();
      tube.position.set(0, 3.05, 0.25);
      tube.rotation.x = Math.PI / 2 - 0.4;
      main.add(tube);
      c(tube, dark, 0, 0, 0, 0.4, 1.7);
      c(tube, paint, 0, 0, 0, 0.42, 1.3);
      c(tube, metal, 0, 0.8, 0, 0.47, 0.12);
      c(tube, glass, 0, 0.87, 0, 0.35, 0.025);
      for (const y of [-0.6, 0.35])
        c(detail, metal, 0, 2.7 + y * 0.2, 0, 0.035, 0.45);
    } else if (refinery || kind === "laboratory") {
      // Two pressure vessels, insulated pipes, heat exchangers and exhaust stacks.
      for (const x of [-0.65, 0.65]) {
        c(main, metal, x, 3.05, 0, 0.36, 1.05);
        mesh(main, this.sphere, paint, x, 3.6, 0, 0.36, 0.18, 0.36);
        for (const y of [2.6, 3.1, 3.45])
          c(detail, dark, x, y, 0, 0.385, 0.055);
        beam(
          detail,
          accent,
          new T.Vector3(x, 2.6, 0.2),
          new T.Vector3(x, 3.1, 0.8),
          0.06,
        );
        c(main, dark, x, 3.45, -0.9, 0.1, 1.8);
        c(detail, metal, x, 4.32, -0.9, 0.15, 0.1);
      }
      b(main, accent, 0, 1.05, d / 2 + 0.14, 0.28, 0.3, 0.08);
    } else if (green) {
      for (const x of [-0.65, 0, 0.65]) {
        b(main, glass, x, 2.8, 0, 0.6, 0.5, 2);
        b(detail, metal, x, 3.05, 0, 0.035, 0.04, 2);
        for (let j = 0; j < 4; j++) {
          c(detail, accent, x, 2.65, -0.65 + j * 0.4, 0.08, 0.25);
        }
      }
    } else if (drill) {
      for (const x of [-1, 1])
        b(main, dark, x * 0.85, 1.7, -0.3, 0.2, 2.4, 0.24);
      b(main, paint, 0, 2.9, -0.3, 2.3, 0.4, 0.6);
      c(main, metal, 0, 1.5, -0.3, 0.22, 2.4);
      for (let j = 0; j < 13; j++) {
        const collar = c(
          main,
          j % 2 ? dark : metal,
          0,
          0.45 + j * 0.16,
          -0.3,
          0.42 - j * 0.013,
          0.09,
        );
        collar.rotation.z = j * 0.3;
      }
      b(main, accent, 0.8, 0.8, 0.6, 0.65, 0.5, 0.6);
    } else {
      b(main, accent, 0.65, 2.65, -0.3, 0.85, 0.22, 1.2);
      for (let j = 0; j < 10; j++)
        b(detail, metal, 0.65, 2.79, -0.81 + j * 0.11, 0.75, 0.045, 0.025);
      c(main, metal, -0.8, 2.9, -0.75, 0.02, 0.9);
      c(detail, light, -0.8, 3.35, -0.75, 0.035, 0.05);
    }
    // ID plate uses the same restrained corporate typography as ship liveries.
    if (typeof document !== "undefined") {
      let tex = this.labels.get(kind);
      if (!tex) {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#384446";
        ctx.font = "600 65px sans-serif";
        ctx.fillText("△  AURORA", 25, 85);
        ctx.font = "40px monospace";
        ctx.fillText(kind.toUpperCase() + " / 07", 25, 158);
        ctx.font = "25px monospace";
        ctx.fillText("COLONY SYSTEMS   •   SERVICE ACCESS", 25, 215);
        tex = new T.CanvasTexture(canvas);
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = 4;
        this.labels.set(kind, tex);
      }
      const key = "label:" + kind;
      if (!this.materials.has(key))
        this.materials.set(
          key,
          new T.MeshStandardMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            roughness: 0.8,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }),
        );
      const label = mesh(
        detail,
        this.plane,
        this.materials.get(key)!,
        w * 0.3,
        1.65,
        d / 2 + 0.081,
        w * 0.36,
        (w * 0.36) / 4,
        1,
      );
      if (yard) {
        label.position.set(0, 2.9, -0.2);
        label.scale.set(1.4, 0.35, 1);
      }
    }
    this.batch(main);
    this.batch(detail);
    const lod = new T.LOD();
    lod.addLevel(detail, 0);
    lod.addLevel(new T.Group(), 35);
    root.add(lod);
    if (kind === "scanner") root.scale.setScalar(1 + (level - 1) * 0.11);
    this.addLighting(root, 1.8, d / 2);
    root.userData.architecture = "panelled-pressure-module";
    root.userData.kind = kind;
    root.userData.level = level;
    return root;
  }
  /** Different floor plans and load paths, rather than one pressure box with accessories. */
  private specialized(kind: string, level: number) {
    const root = new T.Group(),
      main = new T.Group(),
      detail = new T.Group();
    root.add(main);
    root.name = `outpost-${kind}`;
    const paint = this.mat(0xb6c0b9, 0.35, 0.75),
      dark = this.mat(0x303b3b, 0.72, 0.65),
      metal = this.mat(0x778b86, 0.85, 0.55),
      accent = this.mat(0x547c75, 0.55, 0.64),
      rust = this.mat(0x846552, 0.65, 0.8),
      warm = this.mat(0xffc471, 0, 0.5, true),
      cool = this.mat(0x8bc8c4, 0, 0.5, true),
      black = this.mat(0x182321, 0.1, 0.9);
    const mesh = (
      g: T.Group,
      geo: T.BufferGeometry,
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
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const b = (
      g: T.Group,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => mesh(g, this.boxGeo, mat, x, y, z, w, h, d);
    const c = (
      g: T.Group,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      r: number,
      h: number,
    ) => mesh(g, this.cylinder, mat, x, y, z, r, h, r);
    const beam = (
      g: T.Group,
      mat: T.Material,
      a: number[],
      v: number[],
      r: number,
    ) => {
      const av = new T.Vector3(...a),
        bv = new T.Vector3(...v),
        m = c(g, mat, 0, 0, 0, r, av.distanceTo(bv));
      m.position.copy(av).add(bv).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        bv.sub(av).normalize(),
      );
    };
    const window = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      side = false,
    ) => {
      const group = new T.Group();
      group.position.set(x, y, z);
      if (side) group.rotation.y = Math.PI / 2;
      main.add(group);
      b(group, metal, 0, 0, 0, w + 0.12, h + 0.13, 0.12);
      b(group, black, 0, 0, 0.065, w, h, 0.05);
      b(group, warm, 0, 0, 0.095, w - 0.065, h - 0.055, 0.014);
      // Recessed glowing panes, mullions, interior silhouette and an outside sill.
      for (let i = 1; i < 4; i++)
        b(group, dark, -w / 2 + (i * w) / 4, 0, 0.11, 0.022, h, 0.024);
      b(group, dark, 0, -h * 0.1, 0.115, w, 0.025, 0.03);
      b(detail, metal, x, y - h * 0.55, z + 0.08, w + 0.18, 0.04, 0.24);
    };
    const door = (x: number, z: number, y = 0.3) => {
      b(main, dark, x, y + 0.65, z, 0.64, 1.3, 0.12);
      b(main, accent, x, y + 0.65, z + 0.07, 0.52, 1.15, 0.045);
      b(detail, cool, x + 0.19, y + 0.78, z + 0.1, 0.03, 0.2, 0.018);
      b(main, warm, x, y + 1.37, z + 0.06, 0.67, 0.04, 0.15);
      for (let i = 0; i < 4; i++)
        b(
          main,
          metal,
          x,
          0.06 + i * 0.07,
          z + 0.58 - i * 0.15,
          0.8,
          0.09,
          0.18,
        );
    };
    const rails = (x: number, y: number, z: number, w: number) => {
      beam(
        detail,
        metal,
        [x - w / 2, y + 0.48, z],
        [x + w / 2, y + 0.48, z],
        0.018,
      );
      for (let i = 0; i < 4; i++)
        beam(
          detail,
          metal,
          [x - w / 2 + (i * w) / 3, y, z],
          [x - w / 2 + (i * w) / 3, y + 0.48, z],
          0.018,
        );
    };
    const vent = (x: number, y: number, z: number, r = 0.25) => {
      const g = new T.Group();
      g.position.set(x, y, z);
      g.rotation.x = Math.PI / 2;
      detail.add(g);
      c(g, black, 0, 0, 0, r * 1.2, 0.11);
      c(g, metal, 0, 0.065, 0, r, 0.035);
      for (let j = 0; j < 6; j++) {
        const a = (j * Math.PI) / 3;
        const m = b(
          g,
          dark,
          Math.cos(a) * r * 0.42,
          0.09,
          Math.sin(a) * r * 0.42,
          r * 0.65,
          0.02,
          r * 0.19,
        );
        m.rotation.y = -a;
      }
      c(g, black, 0, 0.11, 0, r * 0.19, 0.04);
    };
    const equipment = (x: number, y: number, z: number) => {
      b(main, dark, x, y, z, 0.47, 0.65, 0.27);
      b(detail, metal, x, y, z + 0.15, 0.42, 0.6, 0.035);
      for (let j = 0; j < 8; j++)
        b(detail, black, x, y - 0.22 + j * 0.063, z + 0.178, 0.32, 0.022, 0.02);
      b(detail, cool, x + 0.14, y + 0.22, z + 0.19, 0.04, 0.025, 0.01);
    };
    let height = 3,
      front = 1.4,
      architecture = "";
    if (kind === "warehouse") {
      architecture = "barrel-vault-cargo-terminal";
      height = 2.9;
      front = 1.65;
      b(main, dark, 0, 0.18, 0, 3.3, 0.35, 3.5);
      const shell = this.extraGeo("vault", () => {
        const g = new T.CylinderGeometry(1, 1, 1, 32, 1, true, 0, Math.PI);
        g.rotateZ(Math.PI / 2);
        g.rotateY(Math.PI / 2);
        return g;
      });
      mesh(main, shell, paint, 0, 1.35, 0, 1.55, 1.55, 3.1);
      b(main, dark, 0, 1.1, -1.5, 2.8, 1.8, 0.16);
      for (const s of [-1, 1]) {
        b(main, paint, s * 1.43, 0.95, 0, 0.16, 1.5, 3.1);
        for (let j = 0; j < 7; j++)
          b(detail, metal, s * 1.54, 1, -1.35 + j * 0.45, 0.07, 1.65, 0.07);
        b(main, metal, s * 1.2, 1.5, 1.58, 0.27, 2.3, 0.22);
        for (let j = 0; j < 6; j++)
          b(
            detail,
            s % 2 ? accent : rust,
            s * 1.9,
            0.65,
            -1.15 + j * 0.38,
            0.5,
            0.7,
            0.32,
          );
      }
      b(main, metal, 0, 2.6, 1.56, 2.9, 0.25, 0.23);
      for (let j = 0; j < 14; j++)
        b(
          main,
          j < 4 ? dark : metal,
          0,
          0.44 + j * 0.13,
          1.59,
          2.1,
          0.085,
          0.08,
        );
      b(main, warm, 0, 2.34, 1.73, 1.8, 0.045, 0.09);
      // Offset dispatch cabin and external loading rollers.
      b(main, accent, -1.25, 2.28, -0.5, 0.7, 0.85, 1.4);
      window(-1.25, 2.35, 0.22, 0.5, 0.35);
      for (let j = 0; j < 6; j++) {
        const roll = c(main, metal, 0, 0.43, 1.95 + j * 0.17, 0.065, 1.8);
        roll.rotation.z = Math.PI / 2;
      }
      rails(0, 0.36, 2.95, 2.4);
      door(-1.25, 1.78);
    } else if (kind === "refinery") {
      architecture = "open-frame-pressure-plant";
      height = 4.4;
      front = 1.65;
      b(main, dark, 0, 0.2, 0, 3.5, 0.4, 3);
      for (const x of [-0.9, 0.7]) {
        c(main, dark, x, 0.65, -0.25, 0.55, 0.6);
        c(main, metal, x, 2.25, -0.25, 0.5, 2.7);
        mesh(main, this.sphere, paint, x, 3.6, -0.25, 0.5, 0.26, 0.5);
        for (let j = 0; j < 6; j++)
          c(detail, j % 2 ? rust : dark, x, 1 + j * 0.45, -0.25, 0.535, 0.065);
        for (const z of [-0.7, 0.7])
          beam(main, dark, [x, 0.3, z], [x, 3.7, z], 0.07);
        beam(main, rust, [x, 2.5, 0.25], [x, 2.5, 1.1], 0.09);
        beam(main, rust, [x, 2.5, 1.1], [x, 0.5, 1.1], 0.09);
        c(main, dark, x, 3.4, -1.05, 0.12, 2);
        c(detail, metal, x, 4.4, -1.05, 0.18, 0.1);
        for (let j = 0; j < 3; j++)
          b(main, metal, x, 1.2 + j * 0.8, 0.72, 0.9, 0.06, 0.65);
      }
      b(main, accent, 1.25, 1.15, 1.1, 1.2, 1.6, 0.75);
      window(1.25, 1.5, 1.51, 0.87, 0.52);
      door(1.25, 1.53);
      b(main, metal, -0.1, 2, 0.7, 3.2, 0.09, 0.6);
      rails(-0.1, 2, 1.02, 3.2);
      for (let j = 0; j < 12; j++)
        b(detail, metal, -1.6, 0.4 + j * 0.14, 1.05, 0.045, 0.025, 0.33);
      beam(detail, dark, [-1.6, 0.4, 0.85], [-1.6, 2.3, 0.85], 0.025);
      for (let j = 0; j < 3; j++) equipment(-0.9 + j * 0.6, 0.9, 1.2);
      b(main, cool, 0.4, 3.75, -0.3, 0.12, 0.06, 0.2);
    } else if (kind === "scanner") {
      architecture = "octagonal-observatory-array";
      height = 5.6 + level * 0.08;
      front = 1.35;
      const oct = this.extraGeo(
        "octagon",
        () => new T.CylinderGeometry(1, 1, 1, 8),
      );
      mesh(main, oct, dark, 0, 0.2, 0, 1.7, 0.4, 1.7);
      mesh(main, oct, paint, 0, 0.9, 0, 1.4, 1.2, 1.4);
      mesh(main, oct, accent, 0, 1.55, 0, 1.47, 0.15, 1.47);
      door(0, 1.33);
      window(0.93, 1.05, 0.98, 0.53, 0.4);
      for (const s of [-1, 1]) {
        beam(main, metal, [s * 1.2, 0.5, -0.6], [s * 0.4, 3.5, -0.2], 0.13);
        b(main, dark, s * 0.42, 2.5, -0.2, 0.2, 2.3, 0.3);
        for (let j = 0; j < level + 2; j++) {
          const z = -1 + j * 0.25;
          c(
            main,
            metal,
            s * 1.2,
            2.0 + (j % 3) * 0.15,
            z,
            0.025,
            1.4 + (j % 3) * 0.3,
          );
          b(main, accent, s * 1.2, 1.7, z, 0.18, 0.5, 0.09);
        }
      }
      const dish = new T.Group();
      dish.position.set(0, 3.6, -0.2);
      dish.rotation.z = 0.5;
      main.add(dish);
      mesh(dish, this.dishGeo, paint, 0, 0, 0, 1.8, 1.8, 1.8);
      c(dish, metal, 0, 0.75, 0, 0.04, 1.4);
      c(dish, cool, 0, 1.45, 0, 0.1, 0.12);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        beam(
          detail,
          metal,
          [Math.cos(a) * 1.1, 3.6, -0.2 + Math.sin(a) * 1.1],
          [0, 4.7, -0.2],
          0.023,
        );
      }
      equipment(-1.2, 0.75, 0.6);
    } else if (kind === "house") {
      architecture = "asymmetric-inhabited-service-tower";
      height = 5.8;
      front = 1.2;
      b(main, dark, 0, 0.2, 0, 2.6, 0.4, 2.45);
      // Offset floors, exposed service spine, balconies and warm habitation windows.
      for (let floor = 0; floor < 3; floor++) {
        const y = 0.55 + floor * 1.55,
          x = floor === 1 ? 0.18 : -0.12;
        b(main, dark, x, y + 0.65, 0, 2.05, 1.4, 2);
        for (const s of [-1, 1]) {
          b(main, paint, x + s * 0.85, y + 0.65, 0, 0.25, 1.3, 2.05);
          window(x + s * 0.45, y + 0.75, 1.035, 0.65, 0.62);
          window(x + s * 1.01, y + 0.8, -0.3, 0.7, 0.62, true);
        }
        b(main, metal, x, y + 1.4, 0, 2.3, 0.12, 2.25);
        b(main, dark, x, y + 0.12, 1.27, 2.4, 0.08, 0.55);
        rails(x, y + 0.15, 1.53, 2.4);
        for (let j = 0; j < 4; j++)
          b(detail, metal, x - 0.83 + j * 0.55, y + 0.1, 1.2, 0.06, 0.15, 0.65);
      }
      door(0, 1.07);
      height = 5.8;
      for (let j = 0; j < 3; j++) {
        equipment(-1.15, 1 + j * 1.5, 1.13);
        const x = 1.22 + j * 0.08;
        beam(
          main,
          j % 2 ? rust : metal,
          [x, 0.5, -0.7],
          [x, 5.35, -0.7],
          0.035,
        );
      }
      for (let j = 0; j < 4; j++) {
        c(main, metal, -0.7 + j * 0.45, 5.7, -0.5, 0.022, 0.7 + (j % 2) * 0.5);
      }
      b(main, metal, 1.38, 3.7, 0.8, 0.3, 2.3, 0.13);
      b(
        main,
        this.mat(0xee8eaf, 0, 0.5, true),
        1.38,
        3.7,
        0.89,
        0.22,
        2.1,
        0.025,
      );
      vent(-0.5, 4.9, 1.2, 0.3);
      vent(0.52, 3.4, 1.2, 0.23);
    } else {
      architecture = "stepped-command-courtyard";
      height = 3.8;
      front = 1.6;
      b(main, dark, 0, 0.2, 0, 3.6, 0.4, 3);
      b(main, paint, -0.8, 1.15, 0, 1.6, 1.6, 2.8);
      b(main, paint, 0.6, 1.15, -0.7, 1.3, 1.6, 1.4);
      b(main, dark, -0.7, 2.25, -0.6, 1.9, 0.6, 1.4);
      for (let j = 0; j < 3; j++)
        window(-1.1 + j * 0.55, 2.3, 0.12, 0.43, 0.37);
      b(main, paint, -0.7, 2.65, -0.6, 2, 0.15, 1.55);
      door(-0.8, 1.43);
      window(0.6, 1.35, 0.05, 0.9, 0.58);
      b(main, dark, 0.8, 0.47, 0.8, 1.15, 0.1, 1.1);
      rails(0.8, 0.52, 1.33, 1.1);
      equipment(-1.6, 1.1, 0.5);
      vent(-1.1, 1.4, 1.49, 0.24);
      c(main, metal, -0.95, 3.18, -0.8, 0.025, 1.05);
      for (let j = 0; j < 3; j++)
        b(main, dark, 0.7, 2.2, -1 + j * 0.4, 0.65, 0.35, 0.3);
    }
    // Purpose-labelled luminous sign and small warning stencils on genuine mounted panels.
    const names: Record<string, string> = {
      warehouse: "ГРУЗОВОЙ ТЕРМИНАЛ",
      refinery: "ПЕРЕРАБОТКА",
      scanner: "ДАЛЬНИЙ КОНТАКТ",
      house: "ЖИЛОЙ СЕКТОР",
      headquarters: "ЦЕНТР КОЛОНИИ",
    };
    const label = this.sign(kind, names[kind] ?? kind);
    const sy =
      kind === "house"
        ? 4.9
        : kind === "scanner"
          ? 1.65
          : kind === "refinery"
            ? 1.8
            : 2.55;
    b(main, dark, 0, sy, front + 0.05, 1.35, 0.36, 0.12);
    mesh(main, this.plane, label, 0, sy, front + 0.12, 1.25, 0.3125, 1);
    this.batch(main);
    this.batch(detail);
    const lod = new T.LOD();
    lod.addLevel(detail, 0);
    lod.addLevel(new T.Group(), 30);
    root.add(lod);
    if (kind === "scanner") root.scale.setScalar(1 + (level - 1) * 0.11);
    this.addLighting(root, Math.min(height * 0.5, 2), front);
    root.userData = { kind, level, architecture };
    return root;
  }
  private extraGeometries = new Map<string, T.BufferGeometry>();
  private extraGeo(key: string, make: () => T.BufferGeometry) {
    if (!this.extraGeometries.has(key)) this.extraGeometries.set(key, make());
    return this.extraGeometries.get(key)!;
  }
  private sign(kind: string, title: string) {
    const key = `sign:${kind}`;
    if (!this.materials.has(key)) {
      let texture: T.Texture | null = null;
      if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 256;
        const c = canvas.getContext("2d")!;
        c.fillStyle = "#172d2b";
        c.fillRect(0, 0, 1024, 256);
        c.strokeStyle = "#8eaba1";
        c.lineWidth = 3;
        c.strokeRect(9, 9, 1006, 238);
        c.fillStyle = "#d8d6a5";
        c.font = "600 52px sans-serif";
        c.fillText(title, 28, 96, 970);
        c.fillStyle = "#8bb3aa";
        c.font = "30px monospace";
        c.fillText("AURORA / 07   •   КОЛОНИЯ", 30, 158);
        c.font = "22px monospace";
        c.fillText("SERVICE ACCESS  •  АВТОМАТИКА ВКЛЮЧЕНА", 30, 210);
        texture = new T.CanvasTexture(canvas);
        texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = 4;
        this.labels.set(key, texture);
      }
      const m = new T.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.6,
        roughness: 0.7,
      });
      m.userData.architectureFixture = true;
      m.userData.baseGlow = 0.6;
      this.materials.set(key, m);
    }
    return this.materials.get(key)!;
  }
  private addLighting(root: T.Group, y: number, z: number) {
    const lamp = new T.PointLight(0xffc98b, 0, 4, 2);
    lamp.position.set(0, y, z + 0.3);
    lamp.visible = false;
    lamp.userData.colonyFixture = true;
    root.add(lamp);
  }
  drill(width: number, height: number, level: number) {
    const root = new T.Group(),
      core = new T.Group(),
      detail = new T.Group();
    root.add(core);
    const paint = this.mat(0xbfc5c2),
      dark = this.mat(0x273135, 0.6),
      metal = this.mat(0x7b8586, 0.85, 0.4),
      light = this.mat(0xc4e0d8, 0, 0.5, true);
    const box = (
      g: T.Group,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => {
      const m = new T.Mesh(this.boxGeo, mat);
      m.position.set(x, y, z);
      m.scale.set(w, h, d);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const beam = (
      g: T.Group,
      mat: T.Material,
      a: T.Vector3,
      b: T.Vector3,
      r: number,
    ) => {
      const m = new T.Mesh(this.cylinder, mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(r, a.distanceTo(b), r);
      m.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    const depth = width * 0.55;
    box(core, dark, 0, 0.15, 0, width * 0.6, 0.3, depth * 0.75);
    box(core, dark, 0, height * 0.9, 0, width, 0.25, depth);
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const lower = new T.Vector3(
            side * width * 0.19,
            height * 0.18,
            end * depth * 0.38,
          ),
          upper = new T.Vector3(
            side * width * 0.45,
            height * 0.88,
            end * depth * 0.38,
          );
        beam(core, metal, lower, upper, width * 0.032);
        for (let j = 0; j < 6 + level; j++) {
          const t = (j + 0.5) / (6 + level),
            p = lower.clone().lerp(upper, t);
          const panel = box(
            core,
            paint,
            p.x,
            p.y,
            p.z,
            width * 0.15,
            (height * 0.63) / (6 + level) - 0.025,
            0.12 + width * 0.025,
          );
          panel.rotation.z = -side * 0.35;
          box(
            detail,
            dark,
            p.x,
            p.y,
            p.z + end * width * 0.022,
            width * 0.09,
            0.018 + width * 0.002,
            0.025,
          );
          for (const dx of [-1, 1])
            box(
              detail,
              metal,
              p.x + dx * width * 0.055,
              p.y,
              p.z + end * width * 0.023,
              width * 0.006,
              width * 0.006,
              0.035,
            );
        }
        beam(
          detail,
          dark,
          lower.clone().add(new T.Vector3(0, 0, end * 0.15)),
          upper.clone().add(new T.Vector3(0, 0, end * 0.15)),
          width * 0.014,
        );
      }
    for (let j = 0; j < 5 + level; j++) {
      const x = -width * 0.4 + (j * width * 0.8) / (4 + level);
      box(
        core,
        paint,
        x,
        height * 0.96,
        0,
        (width * 0.8) / (5 + level) - 0.025,
        height * 0.12,
        depth * 0.9,
      );
      for (const end of [-1, 1])
        box(
          detail,
          light,
          x,
          height * 0.91,
          end * depth * 0.46,
          width * 0.06,
          0.04,
          0.025,
        );
    }
    for (const side of [-1, 1]) {
      box(
        core,
        dark,
        side * width * 0.12,
        height * 0.65,
        0,
        width * 0.12,
        height * 0.44,
        depth * 0.3,
      );
      for (let j = 0; j < 10; j++)
        box(
          detail,
          metal,
          side * width * 0.12,
          height * 0.46 + j * height * 0.035,
          depth * 0.17,
          width * 0.14,
          0.035,
          0.06,
        );
      beam(
        detail,
        metal,
        new T.Vector3(side * width * 0.15, height * 0.2, 0),
        new T.Vector3(side * width * 0.15, height * 0.85, 0),
        width * 0.01,
      );
    }
    for (let j = 0; j < 5; j++) {
      const ring = new T.Mesh(this.cylinder, j === 0 ? light : metal);
      ring.position.set(0, height * 0.14 + j * 0.18, 0);
      ring.scale.set(
        width * (0.08 + j * 0.012),
        0.09,
        width * (0.08 + j * 0.012),
      );
      core.add(ring);
    }
    const extraction = new T.Mesh(
      this.cylinder,
      this.mat(0x7bb3ad, 0, 0.8, true),
    );
    extraction.position.y = height * 0.085;
    extraction.scale.set(width * 0.04, height * 0.16, width * 0.04);
    core.add(extraction);
    this.batch(core);
    this.batch(detail);
    const lod = new T.LOD();
    lod.addLevel(detail, 0);
    lod.addLevel(new T.Group(), width * 4);
    root.add(lod);
    this.addLighting(root, Math.min(height * 0.2, 3), depth * 0.4);
    root.userData = {
      architecture: "tapered-extraction-platform",
      level,
      width,
      height,
    };
    return root;
  }
  private batch(root: T.Group) {
    root.updateWorldMatrix(true, true);
    const buckets = new Map<
      string,
      { geo: T.BufferGeometry; mat: T.Material; matrices: T.Matrix4[] }
    >();
    root.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      const mat = o.material as T.Material,
        key = o.geometry.uuid + mat.uuid;
      let b = buckets.get(key);
      if (!b) {
        b = { geo: o.geometry, mat, matrices: [] };
        buckets.set(key, b);
      }
      b.matrices.push(o.matrixWorld.clone());
    });
    root.clear();
    for (const b of buckets.values()) {
      const m = new T.InstancedMesh(b.geo, b.mat, b.matrices.length);
      b.matrices.forEach((v, i) => m.setMatrixAt(i, v));
      m.castShadow = m.receiveShadow = true;
      root.add(m);
    }
  }
  dispose() {
    this.surface.dispose();
    this.extraGeometries.forEach((g) => g.dispose());
    [this.boxGeo, this.cylinder, this.sphere, this.dishGeo, this.plane].forEach(
      (g) => g.dispose(),
    );
    this.materials.forEach((m) => m.dispose());
    this.labels.forEach((t) => t.dispose());
  }
}
