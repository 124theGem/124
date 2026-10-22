import * as T from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { IndustrialSurface } from "./IndustrialSurface";
/** Original outpost architecture: panelled pressure modules on exposed service chassis. */
export class IndustrialArchitecture {
  private surface = new IndustrialSurface(1024);
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
          aoMapIntensity: 0.4,
          emissive: glow ? color : 0,
          emissiveIntensity: glow ? 1.5 : 0,
          clearcoat: 0.08,
        }),
      );
    return this.materials.get(key)!;
  }
  build(kind: string, level = 1) {
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
    root.userData.architecture = "panelled-pressure-module";
    root.userData.kind = kind;
    root.userData.level = level;
    return root;
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
    [this.boxGeo, this.cylinder, this.sphere, this.dishGeo, this.plane].forEach(
      (g) => g.dispose(),
    );
    this.materials.forEach((m) => m.dispose());
    this.labels.forEach((t) => t.dispose());
  }
}
