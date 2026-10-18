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
import { sphereNormal, sphereRadius } from "../../shared/sphere";
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
    for (let i = 0; i < 30; i++) {
      const x = i < 5 ? pad.x - 7 + (i % 3) * 4 : (i * 31 + 17) % size,
        z =
          i < 5
            ? pad.z - 6 - Math.floor(i / 3) * 4
            : 3 + (terrainSeed(i * 317 + seed) % (Math.floor(size / 2) - 6)),
        patch = new T.Group();
      if (
        theme === "meadow" ||
        (theme === "alpine" && i % 3 === 0) ||
        (theme === "tropical" && i % 2 === 0)
      ) {
        for (let row = 0; row < 5; row++)
          for (let col = 0; col < 6; col++) {
            const px = (col - 2.5) * 0.34,
              pz = (row - 2) * 0.4,
              h = 0.42 + (terrainSeed(i * 131 + row * 7 + col) % 9) * 0.035;
            kit.box(
              patch,
              px,
              h / 2,
              pz,
              0.035,
              h,
              0.035,
              theme === "tropical" ? 0x709e5a : 0x8d9a4e,
            );
            kit.box(
              patch,
              px,
              h + 0.09,
              pz,
              0.1,
              0.25,
              0.095,
              theme === "alpine" ? 0xc8bd7e : 0xdfc57c,
            );
            this.stats.stalks++;
          }
      } else if (theme === "tropical") {
        for (let n = 0; n < 2; n++) {
          const palm = new T.Group();
          kit.box(palm, 0, 1.1, 0, 0.25, 2.2, 0.25, 0xa48f66);
          for (let j = 0; j < 5; j++) {
            const a = (j / 5) * Math.PI * 2,
              leaf = kit.box(
                palm,
                Math.cos(a) * 0.65,
                2.3,
                Math.sin(a) * 0.65,
                1.7,
                0.16,
                0.45,
                0x578858,
              );
            leaf.rotation.y = -a;
          }
          palm.position.set(n * 2, 0, n);
          patch.add(palm);
          this.stats.trees++;
        }
      } else if (theme === "forest" || theme === "fungal" || theme === "ice") {
        for (let n = 0; n < 3; n++) {
          let tree: T.Group;
          if (theme === "fungal") {
            tree = kit.plant("moonshroom");
            tree.scale.setScalar(1.9 + n * 0.35);
          } else tree = this.fir(theme);
          tree.position.set((n - 1) * 1.35, 0, (n % 2) * 1.5);
          patch.add(tree);
          this.stats.trees++;
        }
      } else if (theme === "desert") {
        const cactus = kit.plant("ashcactus");
        cactus.scale.setScalar(2.3);
        patch.add(cactus);
        this.stats.trees++;
      } else {
        for (let n = 0; n < 4; n++)
          kit.box(patch, n * 0.4 - 0.5, 0.15, 0, 0.45, 0.3, 0.4, 0x544952);
      }
      this.place(patch, x, z);
      this.staticRoot.add(patch);
    }
    for (let i = 0; i < 72; i++) {
      const patch = new T.Group(),
        x = i < 8 ? pad.x - 6 + (i % 4) * 4 : (i * 43 + seed) % size,
        z =
          i < 8
            ? pad.z + 4 + Math.floor(i / 4) * 3
            : 2 + (terrainSeed(seed + i * 991) % (Math.floor(size / 2) - 4)),
        green =
          theme === "ice"
            ? 0xb4d7cf
            : theme === "fungal"
              ? 0x9b8fc1
              : theme === "desert"
                ? 0x9e9a62
                : theme === "volcanic"
                  ? 0x87585c
                  : 0x659453;
      for (let j = 0; j < 3; j++) {
        kit.box(
          patch,
          (j - 1) * 0.25,
          0.24 + j * 0.1,
          (j % 2) * 0.22,
          0.6,
          0.5,
          0.55,
          green,
          theme === "fungal",
        );
        if ((i + j) % 3 === 0)
          kit.box(
            patch,
            (j - 1) * 0.25,
            0.55 + j * 0.1,
            0.27,
            0.1,
            0.1,
            0.1,
            theme === "fungal" ? 0x9cebd9 : 0xe4bb7c,
            theme === "fungal",
          );
      }
      this.place(patch, x, z);
      this.staticRoot.add(patch);
      this.stats.bushes++;
    }
    for (const feature of this.features) {
      const object = new T.Group(),
        rock =
          theme === "ice"
            ? 0xb2cfd1
            : theme === "volcanic"
              ? 0x62545b
              : theme === "desert"
                ? 0xb49678
                : 0x8b9390;
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
    object.position.copy(up.clone().multiplyScalar(sphereRadius(this.id)));
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
          PLANETS[this.id].soil,
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
      theme === "ice" ? 0xa2dfe8 : 0x76cfd0,
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
        theme === "ice" ? 0xc1e9ed : 0x87e4e1,
        true,
        0.8,
      );
      drop.userData.base = drop.position.y;
    }
    this.kit.box(flow, 0, 0.09, 1.45, 2.5, 0.16, 2, 0x74cbd0, true, 0.75);
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
