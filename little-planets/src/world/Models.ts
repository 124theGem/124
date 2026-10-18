import * as T from "three";
import {
  PLANTS,
  FURNITURE,
  type FurnitureKind,
  type BuildingKind,
  type PlanetId,
} from "../../shared/catalog";
/** Small procedural factories; their roots can later be replaced by GLTF models. */
export class Models {
  private boxGeo = new T.BoxGeometry(1, 1, 1);
  private crystalGeo = new T.ConeGeometry(0.32, 1.4, 4);
  private materials = new Map<string, T.MeshStandardMaterial>();
  material(color: number, glow = false, alpha = 1) {
    const key = `${color}:${glow}:${alpha}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new T.MeshStandardMaterial({
        color,
        roughness: 0.82,
        emissive: glow ? color : 0,
        emissiveIntensity: glow ? 0.65 : 0,
        transparent: alpha < 1,
        opacity: alpha,
      });
      this.materials.set(key, material);
    }
    return material;
  }
  box(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
    glow = false,
    alpha = 1,
  ) {
    const mesh = new T.Mesh(this.boxGeo, this.material(color, glow, alpha));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  plant(id: string, growth = 2) {
    const root = new T.Group(),
      plant = PLANTS[id],
      color = plant.color,
      glow = plant.planet !== "listoria" || id === "glowbush";
    if (growth === 0) {
      this.box(root, 0, 0.08, 0, 0.13, 0.14, 0.13, 0xa0d969);
      this.box(root, 0.1, 0.14, 0, 0.2, 0.06, 0.1, 0x78af62);
      return root;
    }
    const scale = growth === 1 ? 0.55 : 1;
    if (plant.shape === "mushroom") {
      this.box(root, 0, 0.28, 0, 0.18, 0.56, 0.18, 0xe8dbd5);
      this.box(root, 0, 0.6, 0, 0.78, 0.18, 0.65, color, glow);
      this.box(root, 0, 0.74, 0, 0.5, 0.12, 0.45, color, glow);
      for (const x of [-0.2, 0.18])
        this.box(root, x, 0.71, 0.12, 0.1, 0.04, 0.1, 0xf5d7ff, true);
    } else if (plant.shape === "bush" || plant.shape === "cactus") {
      for (const [x, y, z] of [
        [0, 0.3, 0],
        [-0.2, 0.4, 0.1],
        [0.2, 0.35, -0.1],
        [0, 0.58, 0.03],
      ])
        this.box(
          root,
          x,
          y,
          z,
          0.3,
          0.4,
          0.3,
          plant.shape === "bush" ? 0x68a96b : color,
        );
      if (plant.shape === "bush")
        for (const x of [-0.21, 0.21])
          this.box(root, x, 0.59, 0.13, 0.14, 0.16, 0.14, color, glow);
      else this.box(root, 0.2, 0.68, 0, 0.17, 0.15, 0.17, 0xffb36c);
    } else {
      this.box(root, 0, 0.33, 0, 0.07, 0.6, 0.07, 0x568b45);
      for (const side of [-1, 1]) {
        const leaf = this.box(
          root,
          side * 0.15,
          0.26,
          0,
          0.3,
          0.07,
          0.15,
          0x76b759,
        );
        leaf.rotation.z = side * 0.3;
      }
      if (plant.shape === "carrot") {
        this.box(root, 0, 0.18, 0, 0.26, 0.31, 0.24, color);
        this.box(root, 0, 0.36, 0, 0.34, 0.08, 0.3, 0x78b757);
      } else {
        for (const [x, z] of [
          [-0.16, 0],
          [0.16, 0],
          [0, 0.16],
          [0, -0.16],
        ])
          this.box(root, x, 0.65, z, 0.22, 0.16, 0.22, color, glow);
        this.box(root, 0, 0.68, 0, 0.19, 0.2, 0.19, 0x855137);
      }
    }
    root.scale.setScalar(scale);
    return root;
  }
  resource(planet: PlanetId, variant: number) {
    const root = new T.Group();
    if (variant % 2 === 0 && (planet === "listoria" || planet === "home")) {
      this.box(root, 0, 0.7, 0, 0.28, 1.4, 0.3, 0x8b6043);
      for (const [x, y, z, s] of [
        [0, 1.8, 0, 1.05],
        [-0.4, 1.35, 0.1, 0.8],
        [0.38, 1.5, -0.15, 0.9],
        [0, 2.35, 0.05, 0.65],
      ])
        this.box(
          root,
          x,
          y,
          z,
          s,
          s * 0.85,
          s,
          variant % 4 === 0 ? 0x71a84c : 0x92bb55,
        );
      this.box(root, 0, 0.12, 0, 0.48, 0.18, 0.46, 0x9e7750);
    } else if (variant % 2 === 0 && planet === "mycelia") {
      const mushroom = this.plant("moonshroom");
      mushroom.scale.setScalar(2.2);
      root.add(mushroom);
      for (const side of [-1, 1]) {
        const small = this.plant("moonshroom");
        small.position.set(side * 0.52, 0, 0.35);
        small.scale.setScalar(0.65);
        root.add(small);
      }
    } else if (
      variant % 2 === 1 &&
      planet !== "listoria" &&
      planet !== "home"
    ) {
      const color = planet === "mycelia" ? 0x70dcff : 0xff8054;
      for (const [x, z, s] of [
        [0, 0, 1],
        [-0.3, 0.15, 0.6],
        [0.3, 0.1, 0.7],
      ]) {
        const mesh = new T.Mesh(this.crystalGeo, this.material(color, true));
        mesh.position.set(x, 0.7 * s, z);
        mesh.scale.setScalar(s);
        root.add(mesh);
      }
      this.box(
        root,
        0,
        0.1,
        0,
        0.8,
        0.18,
        0.7,
        planet === "mycelia" ? 0x55547c : 0x4c434b,
      );
    } else {
      for (const [x, z, s] of [
        [0, 0, 0.8],
        [-0.3, 0.1, 0.55],
        [0.27, -0.15, 0.5],
      ]) {
        const rock = this.box(
          root,
          x,
          s * 0.4,
          z,
          s,
          s * 0.8,
          s,
          planet === "pyros" ? 0x46424f : 0xa6b3ac,
        );
        rock.rotation.y = x + variant;
      }
      if (planet === "pyros")
        this.box(root, 0, 0.6, 0, 0.09, 0.15, 0.5, 0xffb057, true);
    }
    return root;
  }
  building(kind: BuildingKind, planet: PlanetId = "listoria"): T.Group {
    if (kind === "headquarters" || kind === "laboratory") {
      const root = this.building(
        kind === "headquarters" ? "house" : "warehouse",
        planet,
      );
      root.scale.set(1.5, 1.15, 1.5);
      if (kind === "headquarters") {
        this.box(root, -0.6, 2.7, 0.2, 0.055, 0.9, 0.055, 0xb7c6c5);
        this.box(root, -0.37, 2.95, 0.2, 0.45, 0.3, 0.055, 0xe5ba6e);
        this.box(root, 0, 1.52, 1.03, 0.6, 0.2, 0.05, 0xf0d694, true);
      } else {
        this.box(root, 0, 2.18, 0, 1, 0.6, 1, 0x9bd6df, false, 0.6);
        this.box(root, 0.6, 2.65, -0.3, 0.05, 1, 0.05, 0xd8e7e3);
        const dish = this.box(root, 0.6, 3.08, -0.3, 0.7, 0.1, 0.4, 0xb4d9e8);
        dish.rotation.z = 0.4;
        this.box(root, 0, 1.1, 1, 0.65, 0.42, 0.04, 0x91cce8, true);
      }
      return root;
    }
    if (kind === "extractor" || kind === "bioextractor") {
      const root = new T.Group(),
        bio = kind === "bioextractor";
      this.box(root, 0, 0.12, 0, 1.9, 0.24, 1.9, 0x7c8f9c);
      for (const side of [-1, 1])
        this.box(root, side * 0.7, 0.9, -0.5, 0.15, 1.5, 0.18, 0xd9c294);
      this.box(root, 0, 1.6, -0.5, 1.7, 0.16, 0.2, 0xe8bc72);
      this.box(root, 0, 0.7, 0, 0.8, 1.2, 0.85, bio ? 0x78aa91 : 0x849cae);
      this.box(root, 0, 1.45, 0, 0.65, 0.3, 0.65, 0xdbc09a);
      this.box(
        root,
        0.52,
        0.9,
        0.48,
        0.15,
        0.55,
        0.4,
        bio ? 0x8fe3a0 : 0x81d9ef,
        true,
      );
      for (let i = 0; i < 5; i++)
        this.box(root, 0, 0.17 + i * 0.2, 0.05, 0.24, 0.12, 0.24, 0xb1c3ca);
      for (const side of [-1, 1])
        this.box(root, side * 0.7, 0.25, 0.5, 0.45, 0.22, 0.55, 0x546779);
      if (bio) {
        const sprout = this.plant("glowbush");
        sprout.position.set(0, 1.5, 0);
        root.add(sprout);
      } else this.box(root, 0, 1.86, -0.5, 0.4, 0.13, 0.4, 0xf0aa5b, true);
      return root;
    }

    const root = new T.Group(),
      wood =
        planet === "pyros"
          ? 0x797076
          : planet === "mycelia"
            ? 0x8b74a0
            : 0xc19260,
      roof =
        planet === "pyros"
          ? 0x66616c
          : planet === "mycelia"
            ? 0x7762a1
            : 0xc87746;
    this.box(root, 0, 0.12, 0, 2.1, 0.24, 2.1, 0x8c8c82);
    if (kind === "greenhouse") {
      this.box(root, 0, 0.95, 0, 1.9, 1.6, 1.9, 0x8cdcd1, false, 0.28);
      for (const x of [-0.95, 0, 0.95])
        for (const z of [-0.95, 0.95])
          this.box(root, x, 0.98, z, 0.06, 1.7, 0.06, 0xe5dcb9);
      for (const y of [0.28, 1.75])
        this.box(root, 0, y, 0, 2, 0.06, 2, 0xd7d1b6, false, y > 1 ? 0.45 : 1);
      for (const x of [-0.6, 0, 0.6]) {
        const plant = this.plant("sunflower");
        plant.position.set(x, 0.25, 0.25);
        root.add(plant);
      }
      this.box(root, 0, 1.9, 0, 1.35, 0.18, 2, 0x9bdbcc, false, 0.4);
    } else {
      this.box(root, 0, 0.95, 0, 1.85, 1.5, 1.85, wood);
      for (let i = 0; i < 6; i++)
        this.box(root, 0, 0.33 + i * 0.24, 0.94, 1.9, 0.035, 0.035, 0xa27958);
      if (kind === "house") {
        for (let i = 0; i < 6; i++)
          this.box(
            root,
            0,
            1.77 + i * 0.16,
            0,
            2.4 - i * 0.32,
            0.18,
            2.4,
            roof,
          );
        this.box(root, 0.65, 2.28, -0.5, 0.28, 0.9, 0.32, 0xb39d82);
        this.box(root, 0.65, 2.76, -0.5, 0.4, 0.12, 0.42, 0xd7c6aa);
      } else this.box(root, 0, 1.8, 0, 2.2, 0.22, 2.2, roof);
      this.box(root, 0, 0.72, 0.955, 0.45, 1, 0.07, 0x715340);
      this.box(root, 0.15, 0.76, 1, 0.05, 0.05, 0.04, 0xf6d08b, true);
      for (const x of [-0.6, 0.6]) {
        this.box(root, x, 1.12, 0.96, 0.45, 0.48, 0.05, 0x674a44);
        this.box(root, x, 1.12, 1, 0.32, 0.34, 0.035, 0xffd18c, true);
        this.box(root, x, 1.12, 1.025, 0.025, 0.36, 0.02, 0xc5aa80);
      }
      this.box(root, 0, 0.16, 1.16, 0.75, 0.15, 0.35, 0xb4aa8e);
      if (kind === "warehouse")
        for (const [x, z] of [
          [-0.7, 1.15],
          [0.7, 1.15],
        ]) {
          this.box(root, x, 0.38, z, 0.5, 0.5, 0.45, 0xb79160);
          this.box(root, x, 0.4, z + 0.24, 0.43, 0.05, 0.03, 0x7e644b);
        }
    }
    return root;
  }
  ship() {
    const root = new T.Group();
    this.box(root, 0, 0.8, 0, 1.05, 0.65, 1.8, 0xe8e4d9);
    this.box(root, 0, 1.2, -0.15, 0.75, 0.4, 0.9, 0xf0e5cf);
    this.box(root, 0, 1.15, 0.55, 0.65, 0.35, 0.35, 0x69d7ef, true);
    this.box(root, 0, 0.8, 1.02, 0.65, 0.45, 0.4, 0xe0a453);
    for (const s of [-1, 1]) {
      this.box(root, s * 0.8, 0.7, -0.25, 0.65, 0.18, 1.35, 0xdaa25e);
      this.box(root, s * 0.5, 0.3, -0.5, 0.16, 0.55, 0.2, 0x656774);
      this.box(root, s * 0.55, 0.12, -0.5, 0.4, 0.12, 0.45, 0xc4b690);
      this.box(root, s * 0.35, 0.68, -0.96, 0.25, 0.25, 0.24, 0x6ec7eb, true);
    }
    return root;
  }
  furniture(kind: FurnitureKind) {
    const root = new T.Group(),
      f = FURNITURE[kind],
      w = f.w,
      d = f.d,
      wood = 0xb68a58,
      cloth = 0x80a4b2;
    if (kind === "rug") {
      this.box(root, 0, 0.025, 0, w - 0.1, 0.04, d - 0.1, 0xb2756a);
      this.box(root, 0, 0.05, 0, w - 0.5, 0.02, d - 0.5, 0xe0c79e);
      return root;
    }
    if (kind === "chair" || kind === "table") {
      const h = kind === "chair" ? 0.55 : 0.85;
      this.box(root, 0, h, 0, w - 0.12, 0.13, d - 0.12, wood);
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          this.box(
            root,
            x * (w / 2 - 0.2),
            h / 2,
            z * (d / 2 - 0.2),
            0.09,
            h,
            0.09,
            0x896645,
          );
      if (kind === "chair") {
        this.box(root, 0, 0.96, -0.38, 0.75, 0.8, 0.1, wood);
        this.box(root, 0, 0.65, 0, 0.65, 0.08, 0.65, 0xc9a77b);
      }
    } else if (kind === "bed") {
      this.box(root, 0, 0.3, 0, w - 0.1, 0.4, d - 0.1, wood);
      this.box(root, 0, 0.61, 0.1, w - 0.25, 0.3, d - 0.3, 0xe8dec8);
      this.box(root, 0, 0.8, -d / 2 + 0.5, w - 0.5, 0.2, 0.65, 0xf5ead7);
      this.box(root, 0, 0.8, 0.5, w - 0.2, 0.16, 1.55, cloth);
      this.box(root, 0, 0.75, -d / 2 + 0.08, w - 0.05, 1.2, 0.15, wood);
    } else if (kind === "sofa") {
      this.box(root, 0, 0.4, 0, w - 0.1, 0.7, 0.95, cloth);
      this.box(root, 0, 0.9, -0.35, w, 1, 0.25, 0x6b919f);
      for (const x of [-1, 1])
        this.box(root, x * (w / 2 - 0.12), 0.7, 0, 0.22, 0.8, 1.02, 0x6b919f);
      this.box(root, 0, 0.78, 0.1, w - 0.5, 0.12, 0.6, 0xb4cfce);
    } else if (kind === "cabinet") {
      this.box(root, 0, 0.9, 0, 0.9, 1.8, 0.9, wood);
      this.box(root, 0, 0.9, 0.46, 0.035, 1.65, 0.03, 0x70533e);
      for (const x of [-0.1, 0.1])
        this.box(root, x, 0.9, 0.49, 0.04, 0.16, 0.03, 0xe0ca96);
    } else {
      this.box(root, 0, 0.7, 0, 1.95, 1.4, 0.95, 0x9b958d);
      this.box(root, 0, 0.58, 0.49, 1.3, 0.8, 0.04, 0x343640);
      this.box(root, 0, 1.45, 0, 2.15, 0.17, 1.1, 0xc9bba1);
      this.box(root, 0, 1.85, -0.2, 0.65, 0.7, 0.6, 0x85857f);
      this.box(root, 0, 0.3, 0.53, 1.15, 0.12, 0.1, 0x8a6142);
      for (const x of [-0.3, 0, 0.3]) {
        const flame = this.box(
          root,
          x,
          0.6,
          0.55,
          0.2,
          0.45,
          0.06,
          x === 0 ? 0xffdf88 : 0xff9245,
          true,
        );
        flame.rotation.z = x;
      }
    }
    return root;
  }
  batch(root: T.Group) {
    root.updateMatrixWorld(true);
    const buckets = new Map<
      string,
      {
        geometry: T.BufferGeometry;
        material: T.Material;
        matrices: T.Matrix4[];
      }
    >();
    root.traverse((object) => {
      if (object instanceof T.Mesh) {
        const material = object.material as T.Material,
          k = `${object.geometry.uuid}:${material.uuid}`;
        let bucket = buckets.get(k);
        if (!bucket) {
          bucket = { geometry: object.geometry, material, matrices: [] };
          buckets.set(k, bucket);
        }
        bucket.matrices.push(object.matrixWorld.clone());
      }
    });
    root.clear();
    for (const bucket of buckets.values()) {
      const mesh = new T.InstancedMesh(
        bucket.geometry,
        bucket.material,
        bucket.matrices.length,
      );
      bucket.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
  dispose() {
    this.boxGeo.dispose();
    this.crystalGeo.dispose();
    for (const material of this.materials.values()) material.dispose();
  }
}
