import * as T from "three";
import { Models } from "./Models";
import {
  PLANETS,
  planetSize,
  ship,
  type PlanetId,
  type SphereTheme,
} from "../../shared/catalog";
import { landmarks, terrainSeed, type Landmark } from "../../shared/surface";
import {
  sphereNormal,
  sphereRadius,
  surfaceDistance,
} from "../../shared/sphere";
import {
  surfaceHeight,
  terrainSurfaceHeight,
  sanctuaryPoint,
  offsetPoint,
  clearingCoordinates,
  noise3,
} from "../../shared/voxel";
import { sanctuary } from "./Sanctuary";
export class SphereNature {
  readonly root = new T.Group();
  private staticRoot = new T.Group();
  private water: T.Group[] = [];
  private volcanoes: T.Group[] = [];
  private smokeGeo = new T.BoxGeometry(1, 1, 1);
  private smokeMaterial = new T.MeshBasicMaterial({
    color: 0xa8a4a7,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  private smoke: T.InstancedMesh;
  readonly features: Landmark[];
  readonly stats: {
    bushes: number;
    stalks: number;
    trees: number;
    caves: number;
    waterfalls: number;
    volcanoes: number;
    cliffs: number;
  };
  constructor(
    private kit: Models,
    readonly id: PlanetId,
  ) {
    this.root.add(this.staticRoot);
    this.features = landmarks(id);
    this.stats = {
      bushes: 0,
      stalks: 0,
      trees: 0,
      caves: 0,
      waterfalls: 0,
      volcanoes: 0,
      cliffs: 0,
    };
    const theme = PLANETS[id].sphereTheme ?? "meadow",
      size = planetSize(id),
      pad = ship(id),
      seed = PLANETS[id].seed ?? 71;
    const moist = theme !== "volcanic" && theme !== "desert" && theme !== "ice";
    // Wide patches form actual forests and meadows rather than evenly spaced decoration.
    for (let i = 0; i < 170; i++) {
      const p =
          i < 22
            ? offsetPoint(
                pad,
                -13 + (i % 6) * 4,
                -15 + Math.floor(i / 6) * 3.5,
                id,
              )
            : {
                x: (i * 43.7 + seed) % size,
                z: 2 + (terrainSeed(seed + i * 277) % (size / 2 - 4)),
              },
        n = sphereNormal(p, id),
        d = surfaceDistance(p, pad, id),
        uv = clearingCoordinates(n, id);
      if (
        d < 4.8 ||
        (uv.front > 0.55 && uv.x > -11 && uv.x < -1 && uv.z > -14 && uv.z < 0)
      )
        continue;
      const density = noise3(n.x * 7, n.y * 7, n.z * 7, seed + 99);
      if (density < 0.38 && i >= 22) continue;
      let tree: T.Group;
      if (theme === "fungal") {
        tree = kit.plant("moonshroom");
        tree.scale.setScalar(2.3 + (i % 4) * 0.4);
      } else if (theme === "desert") {
        if (i % 4) continue;
        tree = kit.plant("ashcactus");
        tree.scale.setScalar(2.2);
      } else if (theme === "volcanic") {
        if (i % 5) continue;
        tree = this.broadleaf(i, true);
      } else
        tree =
          theme === "ice" || theme === "alpine"
            ? this.fir(theme)
            : this.broadleaf(i);
      this.place(tree, p.x, p.z);
      this.staticRoot.add(tree);
      this.stats.trees++;
    }
    for (let i = 0; i < 30; i++) {
      if (!moist) break;
      const center =
        i < 6
          ? offsetPoint(
              pad,
              -1 + (i % 3) * 3.2,
              7 + Math.floor(i / 3) * 3.5,
              id,
            )
          : {
              x: (i * 31 + 17) % size,
              z: 3 + (terrainSeed(i * 317 + seed) % (size / 2 - 6)),
            };
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 6; col++) {
          const p = offsetPoint(
              center,
              (col - 2.5) * 0.35,
              (row - 2) * 0.39,
              id,
            ),
            uv = clearingCoordinates(sphereNormal(p, id), id);
          if (
            surfaceDistance(p, pad, id) < 4 ||
            (uv.front > 0.55 &&
              uv.x > -11 &&
              uv.x < -1 &&
              uv.z > -14 &&
              uv.z < 0)
          )
            continue;
          const stalk = new T.Group(),
            h = 0.55 + (terrainSeed(i * 131 + row * 7 + col) % 9) * 0.045;
          const stem = kit.box(stalk, 0, h / 2, 0, 0.027, h, 0.027, 0x8b9050);
          stem.rotation.z = Math.sin(i + row) * 0.08;
          kit.box(stalk, 0, h + 0.06, 0, 0.095, 0.24, 0.085, 0xc4ac63);
          kit.leaf(stalk, 0, h * 0.45, 0, 0.32, i + col, 0x7b8b47, -0.8);
          this.place(stalk, p.x, p.z);
          this.staticRoot.add(stalk);
          this.stats.stalks++;
        }
    }
    for (let i = 0; i < 340; i++) {
      const p =
          i < 44
            ? offsetPoint(
                pad,
                -14 + (i % 9) * 3.3,
                -13 + Math.floor(i / 9) * 4.2,
                id,
              )
            : {
                x: (i * 43.71 + seed) % size,
                z: 1 + (terrainSeed(seed + i * 991) % (size / 2 - 2)),
              },
        uv = clearingCoordinates(sphereNormal(p, id), id);
      if (
        surfaceDistance(p, pad, id) < 3.5 ||
        (uv.front > 0.55 &&
          uv.x > -9.2 &&
          uv.x < -2.4 &&
          uv.z > -12 &&
          uv.z < -5)
      )
        continue;
      const plant =
        i % 3 === 0 && moist ? this.fern(i) : this.undergrowth(i, theme);
      this.place(plant, p.x, p.z);
      this.staticRoot.add(plant);
      this.stats.bushes++;
    }
    const ruin = sanctuary(kit, seed),
      anchor = sanctuaryPoint(id);
    this.place(ruin, anchor.x, anchor.z);
    ruin.position.setLength(
      sphereRadius(id) + terrainSurfaceHeight(anchor, id),
    );
    this.staticRoot.add(ruin);
    // Water collecting at the foot of the ivory escarpment, with reeds and lily pads.
    if (moist) {
      for (let i = 0; i < 18; i++) {
        const p = offsetPoint(
            pad,
            6.2 + (i % 3) * 1.35,
            -7 + Math.floor(i / 3) * 1.6,
            id,
          ),
          pool = new T.Group();
        kit.box(pool, 0, 0.04, 0, 1.6, 0.08, 1.65, 0xb8a164, false, 0.78);
        if (i % 2 === 0) {
          kit.leaf(pool, 0.15, 0.13, 0.1, 0.65, i, 0x587844);
          kit.facet(pool, 0.15, 0.12, 0.1, 0.38, 0.025, 0.3, 0x719246);
        }
        this.place(pool, p.x, p.z);
        this.staticRoot.add(pool);
      }
    }
    for (const feature of this.features) {
      const object = new T.Group(),
        rock =
          theme === "ice"
            ? 0xb2cfd1
            : theme === "volcanic"
              ? 0x777060
              : theme === "desert"
                ? 0xc5b48d
                : 0xc7bfa2;
      if (feature.kind === "cave") {
        this.cave(object, rock, theme);
        this.stats.caves++;
      } else if (feature.kind === "volcano") {
        this.volcano(object);
        this.volcanoes.push(object);
        this.stats.volcanoes++;
      } else {
        this.cliff(object, rock, feature.scale);
        this.stats.cliffs++;
        if (feature.kind === "waterfall") {
          const flow = this.waterfall(object, feature.scale, theme);
          this.water.push(flow);
          this.stats.waterfalls++;
        }
      }
      this.place(object, feature.x, feature.z);
      this.staticRoot.add(object);
    }
    // Batch solid scenery once; independently animated water and smoke stay in their own groups.
    for (const flow of this.water) {
      flow.updateWorldMatrix(true, false);
      const position = new T.Vector3(),
        rotation = new T.Quaternion(),
        scale = new T.Vector3();
      flow.matrixWorld.decompose(position, rotation, scale);
      flow.removeFromParent();
      this.root.add(flow);
      flow.position.copy(position);
      flow.quaternion.copy(rotation);
    }
    kit.batch(this.staticRoot);
    this.smoke = new T.InstancedMesh(
      this.smokeGeo,
      this.smokeMaterial,
      Math.max(1, this.volcanoes.length * 20),
    );
    this.smoke.frustumCulled = false;
    this.smoke.visible = this.volcanoes.length > 0;
    this.root.add(this.smoke);
  }
  private place(object: T.Group, x: number, z: number) {
    const n = sphereNormal({ x, z }, this.id),
      up = new T.Vector3(n.x, n.y, n.z);
    object.position.copy(
      up
        .clone()
        .multiplyScalar(
          sphereRadius(this.id) + surfaceHeight({ x, z }, this.id),
        ),
    );
    object.quaternion.setFromUnitVectors(T.Object3D.DEFAULT_UP, up);
  }
  private fir(theme: SphereTheme) {
    const root = new T.Group();
    this.kit.box(root, 0, 0.8, 0, 0.2, 1.6, 0.2, 0x8d7660);
    for (let i = 0; i < 3; i++) {
      const size = 1.5 - i * 0.38;
      this.kit.box(
        root,
        0,
        1.25 + i * 0.48,
        0,
        size,
        0.6,
        size,
        theme === "ice" ? 0xb5d0c5 : 0x4b7e59,
      );
    }
    return root;
  }
  private broadleaf(seed: number, bare = false) {
    const tree = new T.Group(),
      height = 3.5 + (seed % 5) * 0.48;
    this.kit.stem(
      tree,
      new T.Vector3(0, 0, 0),
      new T.Vector3(0.12, height, 0),
      2.6,
      0x6c674c,
    );
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4,
        r = 0.9 + (i % 2) * 0.55,
        tip = new T.Vector3(
          Math.cos(a) * r,
          height - 0.4 + (i % 3) * 0.4,
          Math.sin(a) * r,
        );
      this.kit.stem(
        tree,
        new T.Vector3(0, height * 0.55, 0),
        tip,
        1.3,
        0x777153,
      );
      if (bare) continue;
      const colors = [0x304d36, 0x446344, 0x5d8051, 0x8a9f55];
      this.kit.facet(
        tree,
        tip.x,
        tip.y + 0.3,
        tip.z,
        1.35,
        1,
        1.15,
        colors[(seed + i) % 4],
      );
      for (let j = 0; j < 7; j++) {
        const angle = j * 2.4 + i;
        this.kit.leaf(
          tree,
          tip.x + Math.cos(angle) * 0.8,
          tip.y + 0.4 + (j % 3) * 0.22,
          tip.z + Math.sin(angle) * 0.8,
          0.95,
          angle,
          colors[(j + i) % 4],
          -0.22,
        );
      }
    }
    for (let j = 0; j < 4; j++)
      this.kit.stem(
        tree,
        new T.Vector3(0, 0.35, 0),
        new T.Vector3(
          Math.sin(j * 1.57) * 0.65,
          0.05,
          Math.cos(j * 1.57) * 0.65,
        ),
        1.4,
        0x777153,
      );
    return tree;
  }
  private fern(seed: number) {
    const root = new T.Group();
    for (let frond = 0; frond < 5; frond++) {
      const a = frond * 1.256 + seed;
      for (let i = 0; i < 4; i++) {
        const t = (i + 1) / 4,
          x = Math.sin(a) * t * 0.7,
          z = Math.cos(a) * t * 0.7,
          y = Math.sin(t * 2) * 0.55;
        for (const side of [-1, 1])
          this.kit.leaf(
            root,
            x,
            y,
            z,
            0.28 + (1 - t) * 0.17,
            a + side * 0.8,
            [0x435f34, 0x67803b, 0x8c9c49][(frond + i) % 3],
            -0.45,
          );
      }
    }
    return root;
  }
  private undergrowth(seed: number, theme: SphereTheme) {
    const root = new T.Group(),
      palette =
        theme === "ice"
          ? [0xaab5a1, 0xc3ccba, 0x8eac99]
          : theme === "fungal"
            ? [0x6c655f, 0x8e8198, 0x739171]
            : theme === "desert"
              ? [0x8e8753, 0xb3a76a, 0x78814a]
              : [0x344f34, 0x52743c, 0x7d9848];
    for (let j = 0; j < 4; j++) {
      const a = j * 2.4 + seed;
      this.kit.facet(
        root,
        Math.sin(a) * 0.32,
        0.2 + (j % 2) * 0.15,
        Math.cos(a) * 0.32,
        0.4,
        0.32,
        0.4,
        palette[j % 3],
      );
      this.kit.leaf(
        root,
        Math.sin(a) * 0.2,
        0.35,
        Math.cos(a) * 0.2,
        0.55,
        a,
        palette[(j + 1) % 3],
        -0.6,
      );
    }
    if (seed % 11 === 0)
      this.kit.facet(root, 0.13, 0.57, 0, 0.08, 0.1, 0.07, 0xc7ad61);
    return root;
  }
  private cliff(root: T.Group, color: number, scale: number) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) {
        const h = (2.5 + ((i * 3 + j) % 4) * 0.7) * scale;
        this.kit.box(
          root,
          (i - 1.5) * 0.9,
          h / 2,
          (j - 1) * 0.85,
          0.98,
          h,
          1.05,
          color,
        );
        this.kit.box(
          root,
          (i - 1.5) * 0.9,
          h + 0.1,
          (j - 1) * 0.85,
          1,
          0.2,
          1.06,
          0x8c9860,
        );
      }
  }
  private cave(root: T.Group, color: number, theme: SphereTheme) {
    for (const side of [-1, 1])
      for (let j = 0; j < 4; j++) {
        this.kit.box(root, side * 1.6, 1.15, -j * 0.8, 1.05, 2.3, 1.05, color);
        this.kit.box(root, side * 2.1, 0.6, -j * 0.8, 0.8, 1.2, 0.95, color);
      }
    for (let i = 0; i < 5; i++)
      this.kit.box(root, (i - 2) * 0.7, 2.65, -1.1, 0.85, 0.85, 4.3, color);
    this.kit.box(root, 0, 1.3, -3.25, 2.4, 2.6, 0.25, 0x343541);
    for (const side of [-1, 1]) {
      const c = this.kit.resource("mycelia", 1);
      c.scale.setScalar(0.55);
      c.position.set(side * 0.85, 0, -2.6);
      root.add(c);
    }
    if (theme === "ice")
      for (let i = 0; i < 4; i++)
        this.kit.box(
          root,
          (i - 1.5) * 0.45,
          2.1,
          0.5,
          0.12,
          0.7,
          0.12,
          0xb9e5e4,
          true,
        );
  }
  private volcano(root: T.Group) {
    for (let layer = 0; layer < 5; layer++) {
      const radius = 2.8 - layer * 0.35;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2,
          block = this.kit.box(
            root,
            Math.cos(a) * radius,
            0.5 + layer * 0.75,
            Math.sin(a) * radius,
            1.05,
            0.88,
            1.05,
            layer % 2 ? 0x695258 : 0x7e5e5b,
          );
        block.rotation.y = -a;
      }
    }
    this.kit.box(root, 0, 3.05, 0, 2.8, 0.12, 2.8, 0xf99043, true);
    for (let i = 0; i < 7; i++)
      this.kit.box(
        root,
        0.45,
        3.4 - i * 0.48,
        1.5 + i * 0.27,
        0.5,
        0.14,
        0.55,
        0xfba452,
        true,
      );
  }
  private waterfall(parent: T.Group, scale: number, theme: SphereTheme) {
    const flow = new T.Group(),
      height = 4 * scale;
    this.kit.box(
      flow,
      0,
      height + 0.05,
      0.25,
      1.8,
      0.14,
      1.9,
      theme === "ice" ? 0xbfd6cd : 0xc6b485,
      true,
    );
    for (let i = 0; i < 12; i++) {
      const drop = this.kit.box(
        flow,
        ((i % 3) - 1) * 0.43,
        height - (Math.floor(i / 3) * height) / 4,
        1.32,
        0.42,
        height / 4 + 0.08,
        0.13,
        theme === "ice" ? 0xd1dfd6 : 0xe0d5ad,
        true,
        0.8,
      );
      drop.userData.base = drop.position.y;
    }
    this.kit.box(flow, 0, 0.09, 1.45, 2.5, 0.16, 2, 0xb7a066, false, 0.75);
    parent.add(flow);
    return flow;
  }
  animate(time: number) {
    for (const flow of this.water) {
      flow.children.forEach((o) => {
        if (o.userData.base !== undefined)
          o.position.y = o.userData.base - ((time * 1.4) % 0.75);
      });
    }
    if (!this.volcanoes.length) return;
    const matrix = new T.Matrix4(),
      q = new T.Quaternion();
    let index = 0;
    for (const v of this.volcanoes) {
      v.updateWorldMatrix(true, false);
      for (let i = 0; i < 20; i++) {
        const age = (time * 0.6 + i * 0.07) % 1.8,
          s = 0.4 + age * 0.7,
          p = new T.Vector3(
            Math.sin(i * 2.4) * age * 0.8,
            4 + age * 4,
            Math.cos(i * 2.4) * age * 0.8,
          ).applyMatrix4(v.matrixWorld);
        matrix.compose(p, q, new T.Vector3(s, s * 0.8, s));
        this.smoke.setMatrixAt(index++, matrix);
      }
    }
    this.smoke.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.smokeGeo.dispose();
    this.smokeMaterial.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
