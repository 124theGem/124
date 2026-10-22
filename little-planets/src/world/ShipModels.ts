import { shipFrame } from "../../shared/shipFrames";
import { graphicsQuality } from "./Graphics";
import { IndustrialSurface } from "./IndustrialSurface";
import { liveryTexture } from "./Livery";
import * as T from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  SHIP_LIVERIES,
  shipRegistration,
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
  private pbr = new IndustrialSurface(
    graphicsQuality() === "high"
      ? 1024
      : graphicsQuality() === "economy"
        ? 256
        : 512,
  );
  private surface = this.pbr.color;
  private normal = this.pbr.normal;
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
        bevelSize: 0.075,
        bevelThickness: 0.075,
      });
      g.rotateX(Math.PI / 2);
      g.translate(0, depth / 2, 0);
      return g;
    });
  }
  build(input: Starship = starterShip()) {
    const design = shipConfiguration(input),
      frame = shipFrame(design);
    const root = new T.Group();
    root.name = "starship";
    root.userData = {
      design: structuredClone(design),
      visual: "engineering-pbr",
      frame: frame.family,
      frameName: frame.name,
      livery: design.livery,
      registration: shipRegistration(design),
      parts: ["hull", "wings", "engine", "module", "landing-gear"],
    };
    const groups = Object.fromEntries(
      [...root.userData.parts, "engineering-details"].map((name: string) => {
        const g = new T.Group();
        g.name = name;
        g.userData.part = name;
        if (name !== "engineering-details") root.add(g);
        return [name, g];
      }),
    ) as Record<string, T.Group>;
    const hull = groups.hull,
      wing = groups.wings,
      engine = groups.engine,
      module = groups.module,
      gear = groups["landing-gear"],
      detail = groups["engineering-details"];
    const coating = SHIP_LIVERIES[design.livery];
    const finish = SHIP_FINISHES[design.finish];
    const bodyColor = new T.Color(SHIP_COLORS[design.color]);
    if (design.finish === "carbon") bodyColor.lerp(new T.Color(0x1c272b), 0.62);
    const pbr = {
      map: this.surface,
      normalMap: this.normal,
      normalScale: new T.Vector2(0.32, 0.32),
      roughnessMap: this.pbr.roughness,
      metalnessMap: this.pbr.metalness,
      aoMap: this.pbr.ao,
      aoMapIntensity: 0.5,
    };
    const paint = this.material(`paint:${design.color}:${design.finish}`, {
      ...pbr,
      color: bodyColor,
      ...finish,
      envMapIntensity: 1.2,
      clearcoat: 0.12,
    });
    const trim = this.material(`stripe:${design.livery}`, {
      ...pbr,
      color: coating.accent,
      metalness: 0.5,
      roughness: 0.58,
    });
    const metal = this.material("alloy", {
      ...pbr,
      color: 0x81928e,
      metalness: 0.85,
      roughness: 0.4,
    });
    const dark = this.material("subframe", {
      ...pbr,
      color: 0x222a2d,
      metalness: 0.7,
      roughness: 0.63,
    });
    const rubber = this.material("rubber", {
      color: 0x101718,
      roughness: 0.93,
    });
    const heat = this.material("heat-stained-titanium", {
      ...pbr,
      color: 0x665449,
      metalness: 0.9,
      roughness: 0.65,
    });
    const hazard = this.material("warning", {
      ...pbr,
      color: 0xdca344,
      metalness: 0.4,
      roughness: 0.65,
    });
    const glass = this.material("glass", {
      color: 0x31525b,
      metalness: 0.18,
      roughness: 0.08,
      transmission: 0.28,
      thickness: 0.12,
      clearcoat: 1,
      ior: 1.5,
      transparent: true,
      opacity: 0.88,
    });
    const glow = (color: number) =>
      this.material(`light:${color}`, {
        color,
        emissive: color,
        emissiveIntensity: 2.5,
        roughness: 0.3,
      });
    const exhaust = glow(SHIP_ENGINES[design.engine].color),
      warm = glow(0xffce85);
    const boxGeo = this.geo(
      "plate",
      () => new RoundedBoxGeometry(1, 1, 1, 2, 0.045),
    );
    const cylinder = this.geo(
      "tube",
      () => new T.CylinderGeometry(1, 1, 1, 24),
    );
    const ringGeo = this.geo(
      "ring",
      () => new T.TorusGeometry(1, 0.075, 6, 32),
    );
    const sphere = this.geo("joint", () => new T.SphereGeometry(1, 16, 10));
    const mesh = (
      g: T.Group,
      geo: T.BufferGeometry,
      mat: T.Material,
      p: number[],
      size: number[] = [1, 1, 1],
    ) => {
      const m = new T.Mesh(geo, mat);
      m.position.fromArray(p);
      m.scale.fromArray(size);
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
    ) => mesh(g, boxGeo, mat, [x, y, z], [w, h, d]);
    const tube = (
      g: T.Group,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      r: number,
      l: number,
      axis = "z",
    ) => {
      const m = mesh(g, cylinder, mat, [x, y, z], [r, l, r]);
      if (axis === "z") m.rotation.x = Math.PI / 2;
      if (axis === "x") m.rotation.z = Math.PI / 2;
      return m;
    };
    const link = (
      g: T.Group,
      mat: T.Material,
      a: number[],
      v: number[],
      radius: number,
    ) => {
      const av = new T.Vector3(...a),
        bv = new T.Vector3(...v),
        m = tube(g, mat, 0, 0, 0, radius, av.distanceTo(bv), "y");
      m.position.copy(av).add(bv).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        bv.sub(av).normalize(),
      );
      return m;
    };
    const ring = (
      g: T.Group,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      r: number,
      axis = "z",
    ) => {
      const m = mesh(g, ringGeo, mat, [x, y, z], [r, r, r]);
      if (axis === "y") m.rotation.x = Math.PI / 2;
      return m;
    };
    const L = frame.length,
      W =
        frame.width *
        (design.hull === "freighter"
          ? 1.08
          : design.hull === "armored"
            ? 1.03
            : 1),
      H = frame.height;
    const base = 0.65,
      top = base + H,
      family = frame.family;
    // Lofted cross sections, not stretched cubes: the pressure hull has real chamfered shoulders.
    const loft = (
      name: string,
      g: T.Group,
      mat: T.Material,
      sections: number[][],
      y = base,
    ) => {
      const key = `loft:${name}:${JSON.stringify(sections)}`;
      const geo = this.geo(key, () => {
        const vertices: number[] = [],
          indices: number[] = [];
        for (const [z, w, h] of sections)
          for (const [xx, yy] of [
            [-0.72, 0],
            [0.72, 0],
            [1, 0.2],
            [1, 0.72],
            [0.65, 1],
            [-0.65, 1],
            [-1, 0.72],
            [-1, 0.2],
          ])
            vertices.push((xx * w) / 2, yy * h, z);
        for (let s = 0; s < sections.length - 1; s++)
          for (let i = 0; i < 8; i++) {
            const a = s * 8 + i,
              c = s * 8 + ((i + 1) % 8);
            indices.push(a, c, a + 8, c, c + 8, a + 8);
          }
        for (let i = 1; i < 7; i++) {
          indices.push(0, i + 1, i);
          const n = (sections.length - 1) * 8;
          indices.push(n, n + i, n + i + 1);
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        const uv = [];
        for (let s = 0; s < sections.length; s++)
          for (let i = 0; i < 8; i++) uv.push(i / 7, s / (sections.length - 1));
        geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
        return geo;
      });
      return mesh(g, geo, mat, [0, y, 0]);
    };
    const profiles: Record<string, number[][]> = {
      shuttle: [
        [-L * 0.46, W * 0.7, H * 0.6],
        [-L * 0.25, W, H * 0.95],
        [L * 0.08, W, H],
        [L * 0.38, W * 0.84, H * 0.7],
        [L * 0.48, W * 0.36, H * 0.35],
      ],
      walker: [
        [-L * 0.5, W * 0.65, H * 0.65],
        [-L * 0.35, W, H],
        [L * 0.3, W, H],
        [L * 0.48, W * 0.76, H * 0.8],
      ],
      outrigger: [
        [-L * 0.5, W * 0.4, H * 0.6],
        [-L * 0.2, W, H],
        [L * 0.24, W * 0.72, H],
        [L * 0.5, W * 0.22, H * 0.45],
      ],
      tug: [
        [-L * 0.5, W * 0.95, H],
        [-L * 0.25, W, H],
        [-L * 0.02, W * 0.65, H * 0.8],
        [L * 0.2, W * 0.2, H * 0.25],
      ],
      hauler: [
        [-L * 0.45, W * 0.3, H * 0.3],
        [-L * 0.2, W * 0.34, H * 0.4],
        [L * 0.23, W * 0.4, H * 0.7],
        [L * 0.48, W * 0.56, H * 0.7],
      ],
      carrier: [
        [-L * 0.5, W * 0.72, H],
        [-L * 0.25, W, H],
        [L * 0.28, W * 0.88, H],
        [L * 0.5, W * 0.48, H * 0.6],
      ],
      interceptor: [
        [-L * 0.5, W, H * 0.5],
        [-L * 0.1, W, H],
        [L * 0.25, W * 0.4, H * 0.7],
        [L * 0.55, W * 0.05, H * 0.1],
      ],
      gunship: [
        [-L * 0.5, W * 0.65, H],
        [-L * 0.1, W, H],
        [L * 0.3, W * 0.8, H * 0.8],
        [L * 0.5, W * 0.55, H * 0.5],
      ],
      frigate: [
        [-L * 0.5, W * 0.7, H],
        [-L * 0.25, W, H],
        [L * 0.3, W * 0.8, H],
        [L * 0.52, W * 0.2, H * 0.3],
      ],
    };
    loft("pressure", hull, paint, profiles[family]);
    loft(
      "keel",
      hull,
      dark,
      profiles[family].map(([z, w]) => [z, w * 0.86, 0.18]),
      base - 0.16,
    );
    const anchors: { label: string; point: number[] }[] = [];
    const cockpitZ = frame.cockpit;
    const canopyW =
      family === "shuttle" ? 0.94 : family === "carrier" ? 1.04 : W * 0.65;
    const cabinY =
      family === "carrier"
        ? top + 0.48
        : family === "shuttle"
          ? base + H * 0.62
          : family === "hauler"
            ? base + H * 0.65
            : top - 0.03;
    // Open cockpit cradle with seats, avionics and a curved glazed canopy, framed by load-bearing ribs.
    b(hull, dark, 0, cabinY - 0.08, cockpitZ, canopyW, 0.2, 0.98);
    for (const s of [-1, 1]) {
      b(
        detail,
        rubber,
        s * canopyW * 0.23,
        cabinY + 0.05,
        cockpitZ - 0.12,
        0.2,
        0.28,
        0.23,
      ).rotation.x = -0.15;
      b(
        detail,
        dark,
        s * canopyW * 0.23,
        cabinY + 0.02,
        cockpitZ + 0.24,
        0.25,
        0.09,
        0.15,
      );
      b(
        detail,
        glow(0x7ad9dd),
        s * canopyW * 0.23,
        cabinY + 0.08,
        cockpitZ + 0.27,
        0.16,
        0.018,
        0.06,
      );
    }
    const windowedNose = family === "walker" || family === "gunship";
    const canopy = mesh(
      hull,
      this.geo(
        "canopy",
        () =>
          new T.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
      ),
      windowedNose ? paint : glass,
      [0, cabinY + 0.06, cockpitZ],
      [canopyW * 0.55, windowedNose ? 0.32 : 0.48, 0.72],
    );
    if (windowedNose) {
      for (const s of [-1, 1]) {
        const pane = b(
          hull,
          glass,
          s * canopyW * 0.24,
          cabinY + 0.14,
          cockpitZ + 0.57,
          canopyW * 0.4,
          0.22,
          0.06,
        );
        pane.rotation.y = s * 0.18;
        b(
          detail,
          dark,
          s * canopyW * 0.24,
          cabinY + 0.27,
          cockpitZ + 0.54,
          canopyW * 0.44,
          0.026,
          0.08,
        );
      }
    }
    canopy.rotation.x = 0.06;
    for (const s of [-1, 1]) {
      link(
        hull,
        metal,
        [s * canopyW * 0.5, cabinY, cockpitZ + 0.54],
        [s * canopyW * 0.4, cabinY + 0.36, cockpitZ + 0.24],
        0.025,
      );
      link(
        hull,
        metal,
        [s * canopyW * 0.4, cabinY + 0.36, cockpitZ + 0.24],
        [s * canopyW * 0.4, cabinY + 0.36, cockpitZ - 0.28],
        0.025,
      );
      link(
        hull,
        metal,
        [s * canopyW * 0.4, cabinY + 0.36, cockpitZ - 0.28],
        [s * canopyW * 0.5, cabinY, cockpitZ - 0.58],
        0.025,
      );
    }
    b(
      hull,
      paint,
      0,
      cabinY + 0.39,
      cockpitZ - 0.31,
      canopyW * 0.85,
      0.065,
      0.35,
    );
    anchors.push({ label: "01 / КАБИНА", point: [0, cabinY + 0.35, cockpitZ] });
    const wingZ =
      family === "interceptor"
        ? -0.65
        : family === "outrigger"
          ? -0.2
          : -L * 0.25;
    // Wing mounts follow the frame: low pylons, delta lifting surfaces, or split radiator fins.
    for (const s of [-1, 1]) {
      const span =
        family === "interceptor"
          ? 1.65
          : family === "outrigger"
            ? 1.3
            : family === "hauler"
              ? 0.38
              : family === "walker"
                ? 0.22
                : family === "tug"
                  ? 0.25
                  : 0.65;
      const wingPoints =
        design.wings === "delta"
          ? [
              [0, 0.8],
              [span, -0.65],
              [span * 0.9, -1.2],
              [0, -0.8],
            ]
          : design.wings === "swept"
            ? [
                [0, 0.3],
                [span, -0.35],
                [span, -0.9],
                [0, -0.55],
              ]
            : [
                [0, 0.4],
                [span, 0.35],
                [span, -0.65],
                [0, -0.8],
              ];
      const fin = mesh(
        wing,
        this.shape(
          `wing:${family}:${design.wings}:${s}`,
          wingPoints.map(([x, z]) => [x * s, z]),
          0.1,
        ),
        paint,
        [s * W * 0.42, base + 0.25, wingZ],
      );
      if (family === "shuttle") fin.rotation.z = s * 0.12;
      b(
        wing,
        trim,
        s * (W * 0.42 + span * 0.7),
        base + 0.31,
        wingZ - 0.5,
        0.13,
        0.025,
        0.55,
      );
      b(
        wing,
        glow(s < 0 ? 0xe76b5c : 0x7ac9ab),
        s * (W * 0.42 + span),
        base + 0.31,
        wingZ - 0.65,
        0.055,
        0.06,
        0.16,
      );
      if (design.wings === "twin")
        b(
          wing,
          paint,
          s * (W * 0.42 + span * 0.85),
          base + 0.61,
          wingZ - 0.6,
          0.09,
          0.65,
          0.75,
        ).rotation.z = -s * 0.18;
    }
    // Nine distinct architectures, with bays and functional systems in genuinely different locations.
    if (family === "shuttle") {
      for (const s of [-1, 1]) {
        b(hull, trim, s * W * 0.47, base + H * 0.55, -0.2, 0.18, H * 0.7, 1.4);
        b(hull, paint, s * W * 0.63, top + 0.23, -0.65, 0.35, 0.4, 1.6);
        for (let j = 0; j < 4; j++)
          b(
            detail,
            dark,
            s * W * 0.65,
            top + 0.45,
            -1.2 + j * 0.27,
            0.27,
            0.018,
            0.16,
          );
      }
      for (const side of [-1, 1])
        for (const z of [-1.15, -0.25]) {
          link(
            hull,
            metal,
            [side * W * 0.31, top - 0.13, z],
            [side * W * 0.63, top + 0.17, z],
            0.055,
          );
          link(
            detail,
            dark,
            [side * W * 0.4, top - 0.3, z + 0.12],
            [side * W * 0.63, top + 0.06, z],
            0.025,
          );
        }
    } else if (family === "walker") {
      for (let j = 0; j < 6; j++) {
        const z = -L * 0.34 + j * L * 0.115;
        b(
          hull,
          j === 2 ? trim : paint,
          0,
          top + 0.055,
          z,
          W * 0.78,
          0.11,
          L * 0.105,
        );
        for (const s of [-1, 1])
          b(
            detail,
            metal,
            s * W * 0.49,
            base + H * 0.45,
            z,
            0.045,
            H * 0.55,
            0.06,
          );
      }
      b(module, dark, 0, top + 0.18, -1.4, 0.62, 0.35, 0.7);
      tube(module, metal, 0, top + 0.65, -1.5, 0.023, 1, "y");
    } else if (family === "outrigger") {
      for (const s of [-1, 1]) {
        link(
          hull,
          metal,
          [0, base + 0.1, -0.3],
          [s * 1.7, base + 0.2, -0.6],
          0.12,
        );
        loft(
          "sensor-pod",
          module,
          paint,
          [
            [-1.7, 0.4, 0.45],
            [-0.6, 0.48, 0.5],
            [0.7, 0.32, 0.3],
          ],
          base + 0.05,
        ).position.x = s * 1.7;
        for (let j = 0; j < 3; j++)
          b(
            module,
            dark,
            s * 1.7,
            base + 0.58,
            -1.3 + j * 0.35,
            0.6,
            0.03,
            0.26,
          );
      }
      ring(module, metal, 0, top + 0.17, -1, 0.55, "y");
      tube(module, glow(0x82d2c5), 0, top + 0.2, -1, 0.2, 0.12, "y");
    } else if (family === "tug") {
      for (const s of [-1, 1]) {
        b(hull, metal, s * 1.05, base - 0.1, -0.25, 0.25, 0.25, 3);
        b(hull, trim, s * 1.05, base + 0.05, -1.45, 0.52, 0.35, 0.4);
        b(hull, dark, s * 1.05, base + 0.05, 1.1, 0.45, 0.35, 0.4);
        link(
          detail,
          metal,
          [s * 0.4, base + 0.1, 0],
          [s * 1.05, base - 0.1, 0.6],
          0.08,
        );
      }
      b(module, trim, 0, top + 0.15, -0.9, 0.75, 0.3, 0.6);
      for (const s of [-1, 1]) {
        b(hull, dark, s * 0.82, base - 0.05, 1, 0.18, 0.28, 1.6);
        b(hull, hazard, s * 0.82, base + 0.12, 1.72, 0.48, 0.18, 0.35);
        link(
          detail,
          metal,
          [s * 0.82, base + 0.18, 0.3],
          [s * 0.82, base + 0.18, 1.6],
          0.035,
        );
      }
    } else if (family === "hauler") {
      // Two staggered container shoulders and a raised forward wheelhouse.
      for (const s of [-1, 1])
        for (let j = 0; j < 3; j++) {
          const z = -1.45 + j * 0.85;
          b(module, dark, s * W * 0.32, base + 0.77, z, 0.9, 1.4, 0.76);
          b(
            module,
            j === 1 ? trim : paint,
            s * W * 0.32,
            base + 0.79,
            z,
            0.84,
            1.28,
            0.69,
          );
          for (const dx of [-1, 1])
            b(
              detail,
              hazard,
              s * W * 0.32 + dx * 0.28,
              base + 1.51,
              z,
              0.04,
              0.04,
              0.7,
            );
          for (let k = 0; k < 6; k++)
            b(
              detail,
              metal,
              s * W * 0.32,
              base + 0.8,
              z - 0.3 + k * 0.12,
              0.92,
              0.018,
              0.025,
            );
        }
    } else if (family === "carrier") {
      b(hull, dark, 0, top + 0.08, 0.1, W * 0.43, 0.07, L * 0.7);
      for (let j = 0; j < 10; j++) {
        b(
          hull,
          metal,
          0,
          top + 0.12,
          -L * 0.22 + j * 0.36,
          W * 0.4,
          0.035,
          0.32,
        );
        for (const s of [-1, 1])
          b(
            detail,
            hazard,
            s * W * 0.22,
            top + 0.15,
            -L * 0.22 + j * 0.36,
            0.045,
            0.02,
            0.17,
          );
      }
      for (const s of [-1, 1]) {
        b(
          hull,
          paint,
          s * W * 0.37,
          top + 0.28,
          -L * 0.28,
          W * 0.25,
          0.48,
          L * 0.36,
        );
        for (let j = 0; j < 5; j++)
          b(
            detail,
            dark,
            s * W * 0.37,
            top + 0.535,
            -L * 0.43 + j * 0.2,
            W * 0.22,
            0.025,
            0.1,
          );
      }
      b(hull, paint, 0, top + 0.25, -L * 0.3, 1.2, 0.42, 1.3);
    } else if (family === "interceptor") {
      for (const s of [-1, 1]) {
        loft(
          "fork",
          hull,
          paint,
          [
            [-1.4, 0.22, 0.25],
            [0.3, 0.3, 0.25],
            [1.75, 0.08, 0.1],
          ],
          base - 0.08,
        ).position.x = s * 0.85;
        b(hull, trim, s * 0.5, base + 0.5, -0.3, 0.12, 0.16, 1.7).rotation.z =
          -s * 0.4;
      }
    } else if (family === "gunship") {
      for (const s of [-1, 1]) {
        b(hull, paint, s * 1.18, base + 0.55, -0.15, 0.5, 0.62, 1.75);
        for (let j = 0; j < 3; j++)
          b(hull, trim, s * 1.2, base + 0.89, -0.65 + j * 0.5, 0.54, 0.12, 0.4);
        tube(module, dark, s * 1.38, base + 0.32, 1, 0.09, 1.7);
        ring(detail, heat, s * 1.38, base + 0.32, 1.85, 0.1);
      }
      b(module, dark, 0, top + 0.22, -0.8, 0.65, 0.35, 0.8);
      tube(module, metal, 0, top + 0.25, 0.1, 0.06, 1.4);
    } else {
      for (const s of [-1, 1]) {
        b(hull, paint, s * 0.78, top - 0.1, -0.8, 0.35, 0.55, 2.2);
        for (let j = 0; j < 5; j++)
          b(
            hull,
            j % 2 ? trim : metal,
            s * 0.84,
            top + 0.21,
            -1.6 + j * 0.4,
            0.45,
            0.09,
            0.32,
          );
        tube(module, dark, s * 0.65, base + 0.15, 1.4, 0.065, 2);
      }
      b(module, paint, 0, top + 0.28, -0.8, 0.7, 0.52, 1);
    }
    const engineX =
      family === "outrigger"
        ? 1.7
        : family === "frigate"
          ? 1.45
          : family === "shuttle"
            ? 1.04
            : family === "interceptor"
              ? 0.5
              : W * 0.53;
    const radius =
      (family === "frigate"
        ? 0.62
        : family === "carrier"
          ? 0.49
          : family === "hauler"
            ? 0.45
            : 0.3) *
      (design.engine === "fusion"
        ? 1.16
        : design.engine === "plasma"
          ? 1.06
          : 1);
    const engineZ = -L * 0.3;
    for (const s of [-1, 1]) {
      const x = s * engineX,
        y = base + H * 0.37,
        len = family === "frigate" ? 2.5 : 1.65;
      tube(engine, dark, x, y, engineZ, radius, len);
      for (let j = 0; j < 4; j++) {
        tube(
          engine,
          j === 1 ? trim : paint,
          x,
          y,
          engineZ + len * 0.28 - j * len * 0.17,
          radius * 1.03,
          len * 0.14,
        );
        ring(
          detail,
          metal,
          x,
          y,
          engineZ + len * 0.36 - j * len * 0.17,
          radius * 1.04,
        );
      }
      const end = engineZ - len * 0.5;
      tube(engine, heat, x, y, end, radius * 0.97, 0.2);
      tube(engine, rubber, x, y, end - 0.12, radius * 0.84, 0.05);
      ring(engine, metal, x, y, end - 0.16, radius * 0.89);
      ring(engine, exhaust, x, y, end - 0.15, radius * 0.61);
      tube(engine, exhaust, x, y, end - 0.16, radius * 0.24, 0.025);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        link(
          detail,
          heat,
          [
            x + Math.cos(a) * radius * 0.75,
            y + Math.sin(a) * radius * 0.75,
            end - 0.14,
          ],
          [
            x + Math.cos(a) * radius * 0.28,
            y + Math.sin(a) * radius * 0.28,
            end - 0.11,
          ],
          0.016,
        );
      }
      anchors.push({
        label: `0${s < 0 ? 2 : 3} / ДВИГАТЕЛЬ`,
        point: [x, y, engineZ],
      });
    }
    // Articulated gear: separate hip, upper arm, knee, piston and wide contact shoe.
    for (let i = 0; i < frame.legs; i++) {
      const s = i % 2 ? -1 : 1,
        row = Math.floor(i / 2),
        n = Math.ceil(frame.legs / 2);
      const z =
        frame.legs === 3
          ? i === 2
            ? L * 0.28
            : -L * 0.28
          : -L * 0.28 + (row * L * 0.56) / Math.max(1, n - 1);
      const x = frame.legs === 3 && i === 2 ? 0 : s * W * 0.42;
      const reach = family === "walker" ? 0.65 : 0.32;
      const knee = [x + s * reach, 0.42, z + 0.1],
        foot = [x + s * (reach + 0.2), 0.075, z + 0.3];
      // Cantilever spars carry outboard hips back to the narrow cargo keel or tug fork.
      if (family === "hauler") {
        link(
          gear,
          dark,
          [s * W * 0.12, base + 0.15, z],
          [x, base + 0.15, z],
          0.11,
        );
        link(
          gear,
          metal,
          [s * W * 0.12, base + 0.25, z - 0.22],
          [x, base + 0.15, z],
          0.045,
        );
      } else if (family === "tug" && z > 0) {
        link(gear, dark, [s * 0.82, base - 0.05, z], [x, base + 0.15, z], 0.09);
      }
      mesh(gear, sphere, dark, [x, base + 0.15, z], [0.14, 0.14, 0.14]);
      link(gear, metal, [x, base + 0.15, z], knee, 0.075);
      link(gear, dark, knee, foot, 0.095);
      link(
        detail,
        metal,
        [x, base + 0.28, z - 0.12],
        [foot[0], 0.15, z + 0.22],
        0.028,
      );
      mesh(gear, sphere, trim, knee, [0.11, 0.11, 0.11]);
      b(gear, dark, foot[0], 0.06, foot[2], 0.37, 0.1, 0.55);
      b(detail, metal, foot[0], 0.12, foot[2], 0.34, 0.025, 0.48);
      if (i === 0)
        anchors.push({ label: "04 / ПОСАДОЧНАЯ ОПОРА", point: knee });
    }
    // Panel-by-panel surface detail with seals, fasteners, access covers and local stripes.
    const count = Math.ceil(L / 0.48);
    for (const s of [-1, 1])
      for (let j = 0; j < count; j++) {
        const z = -L * 0.33 + j * ((L * 0.62) / count);
        const x = s * W * (family === "hauler" ? 0.17 : 0.49),
          y = base + H * 0.42;
        b(detail, dark, x, y, z, 0.025, H * 0.45, 0.35);
        b(
          detail,
          j % 4 === 0 ? trim : paint,
          x + s * 0.019,
          y,
          z,
          0.035,
          H * 0.4,
          0.32,
        );
        for (const yy of [-1, 1])
          b(
            detail,
            metal,
            x + s * 0.04,
            y + yy * H * 0.15,
            z,
            0.025,
            0.018,
            0.023,
          );
        b(detail, dark, s * W * 0.28, top + 0.009, z, W * 0.22, 0.018, 0.3);
        b(
          detail,
          j % 5 === 0 ? trim : paint,
          s * W * 0.28,
          top + 0.022,
          z,
          W * 0.22 - 0.035,
          0.018,
          0.265,
        );
        if (j % 3 === 0) {
          for (let k = 0; k < 5; k++)
            b(
              detail,
              dark,
              s * W * 0.24,
              top + 0.035,
              z - 0.1 + k * 0.04,
              W * 0.14,
              0.015,
              0.014,
            );
        }
      }
    for (const s of [-1, 1]) {
      const z = -L * 0.12,
        x = s * (W * (family === "hauler" ? 0.17 : 0.5) + 0.065);
      link(
        detail,
        heat,
        [x, base + 0.2, z - 0.55],
        [x, base + 0.2, z + 0.55],
        0.025,
      );
      b(hull, dark, x, base + H * 0.5, z, 0.06, 0.35, 0.5);
      b(hull, paint, x + s * 0.035, base + H * 0.5, z, 0.025, 0.29, 0.43);
      b(
        detail,
        metal,
        x + s * 0.055,
        base + H * 0.5,
        z + 0.1,
        0.02,
        0.025,
        0.09,
      );
      for (const zz of [-0.2, 0.2])
        b(
          detail,
          hazard,
          x + s * 0.06,
          base + H * 0.4,
          z + zz,
          0.02,
          0.08,
          0.025,
        );
    }
    const bayZ = -L * 0.48;
    b(hull, dark, 0, base + H * 0.35, bayZ - 0.02, 0.6, H * 0.53, 0.06);
    b(hull, metal, 0, base + H * 0.64, bayZ - 0.06, 0.62, 0.05, 0.08);
    b(detail, warm, 0, base + H * 0.59, bayZ - 0.11, 0.36, 0.025, 0.025);
    const ramp = b(gear, dark, 0, 0.25, bayZ - 0.4, 0.6, 0.055, 0.7);
    ramp.rotation.x = -0.4;
    for (let j = 0; j < 5; j++)
      b(
        detail,
        metal,
        0,
        0.12 + j * 0.05,
        bayZ - 0.7 + j * 0.12,
        0.54,
        0.018,
        0.035,
      );
    anchors.push({
      label: "05 / СЕРВИСНЫЙ ОТСЕК",
      point: [0, base + H * 0.4, bayZ],
    });
    if (design.module === "hold")
      for (const s of [-1, 1]) {
        b(module, dark, s * (W * 0.5 + 0.26), base + 0.15, 0.35, 0.5, 0.5, 0.9);
        b(
          module,
          trim,
          s * (W * 0.5 + 0.26),
          base + 0.42,
          0.35,
          0.52,
          0.05,
          0.92,
        );
        for (const z of [0, 0.65])
          b(
            detail,
            metal,
            s * (W * 0.5 + 0.26),
            base + 0.46,
            z,
            0.53,
            0.035,
            0.06,
          );
      }
    if (design.module === "shield" || design.hull === "armored")
      for (const s of [-1, 1])
        for (let j = 0; j < 3; j++)
          b(
            module,
            metal,
            s * W * 0.45,
            top + 0.12,
            -L * 0.2 + j * 0.5,
            W * 0.35,
            0.17,
            0.43,
          ).rotation.z = -s * 0.2;
    if (design.module === "survey") {
      tube(module, metal, 0, top + 0.52, -0.45, 0.025, 1, "y");
      ring(module, trim, 0, top + 0.94, -0.45, 0.3);
      tube(module, glass, 0, top + 0.94, -0.4, 0.23, 0.08);
      anchors.push({
        label: "06 / СЕНСОРНЫЙ МОДУЛЬ",
        point: [0, top + 0.94, -0.45],
      });
    } else
      anchors.push({
        label: "06 / ГРУЗ / АВИОНИКА",
        point: [W * 0.3, top, -L * 0.2],
      });
    if (design.class === "combat" && family !== "gunship")
      for (const s of [-1, 1]) {
        tube(module, dark, s * (W * 0.6), base + 0.15, 0.65, 0.07, 1.6);
        ring(detail, heat, s * W * 0.6, base + 0.15, 1.46, 0.085);
      }
    // Livery planes retain their native 4:1 aspect on real, flat pressure-hull panels.
    if (typeof document !== "undefined") {
      const key = `livery:${design.livery}:${design.color}:${design.name}:${design.model}:${design.class}`;
      let marking = this.materials.get(key);
      if (!marking) {
        const texture = liveryTexture(design)!;
        this.textures.push(texture);
        marking = this.material(key, {
          map: texture,
          transparent: true,
          depthWrite: false,
          roughness: 0.65,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          side: T.DoubleSide,
        });
      }
      const plane = this.geo("livery-plane", () => new T.PlaneGeometry(1, 1));
      for (const s of [-1, 1]) {
        const plate = b(
          hull,
          paint,
          s * (W * 0.5 + 0.09),
          base + H * 0.56,
          -L * 0.1,
          0.035,
          0.34,
          1.36,
        );
        const label = mesh(
          hull,
          plane,
          marking,
          [plate.position.x + s * 0.023, plate.position.y, plate.position.z],
          [1.3, 0.325, 1],
        );
        label.rotation.y = (s * Math.PI) / 2;
      }
    }
    root.userData.anchors = anchors;
    for (const g of Object.values(groups)) this.batch(g);
    const lod = new T.LOD();
    lod.addLevel(detail, 0);
    lod.addLevel(new T.Group(), graphicsQuality() === "economy" ? 14 : 35);
    root.add(lod);
    root.userData.dimensions = new T.Box3()
      .setFromObject(root)
      .getSize(new T.Vector3())
      .toArray();
    return root;
  }
  cabin(input: Starship = starterShip()) {
    const design = shipConfiguration(input),
      root = new T.Group();
    root.userData.design = structuredClone(design);
    root.userData.frame = shipFrame(design).family;
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
    this.pbr.dispose();
  }
}
