import * as T from "three";
import { Models } from "./Models";
import {
  BEDS,
  PLANETS,
  SIZE,
  SHIP,
  nodes,
  terrainHeight,
  waterCell,
  type PlanetId,
} from "../../shared/catalog";
import { nodeReady, stage, ready, type Save } from "../../shared/model";
export class Planet {
  readonly root = new T.Group();
  readonly ship: T.Group;
  private terrain = new T.Group();
  private objects = new T.Group();
  private crops = new T.Group();
  private waterfall = new T.Group();
  private lastDynamic = "";
  private lastNodes = "";
  constructor(
    readonly id: PlanetId,
    private kit: Models,
    save: Save,
    now: number,
  ) {
    const palette = PLANETS[id];
    this.root.add(this.terrain, this.objects, this.crops, this.waterfall);
    for (let x = 0; x < SIZE; x++)
      for (let z = 0; z < SIZE; z++) {
        const h = terrainHeight(x, z),
          edge = x === 0 || z === 0 || x === SIZE - 1 || z === SIZE - 1;
        const tint = new T.Color(palette.soil)
          .multiplyScalar(0.94 + ((x * 13 + z * 7) % 7) * 0.018)
          .getHex();
        kit.box(
          this.terrain,
          x,
          h - 0.15,
          z,
          1,
          0.3,
          1,
          waterCell(x, z) ? (id === "pyros" ? 0xf07d40 : 0x49a6bf) : tint,
          waterCell(x, z),
        );
        kit.box(
          this.terrain,
          x,
          -0.7 + h * 0.5,
          z,
          0.98,
          1.1 + h,
          0.98,
          palette.side,
        );
        kit.box(
          this.terrain,
          x,
          -3.2,
          z,
          1,
          4.2 + ((x * 3 + z * 11) % 5) * 0.18,
          1,
          palette.rock,
        );
        if (edge)
          for (let layer = 0; layer < 4; layer++) {
            const shade = new T.Color(palette.rock)
              .multiplyScalar(0.84 + ((x * 3 + z + layer * 7) % 5) * 0.075)
              .getHex();
            kit.box(
              this.terrain,
              x + (x === 0 ? -0.07 : x === 16 ? 0.07 : 0),
              -1.5 - layer * 0.85,
              z + (z === 0 ? -0.07 : z === 16 ? 0.07 : 0),
              1.04,
              0.79,
              1.04,
              shade,
            );
            if (id === "listoria" && (x + z + layer) % 5 === 0)
              kit.box(
                this.terrain,
                x + (x === 0 ? -0.13 : x === 16 ? 0.13 : 0),
                -1.4 - layer * 0.8,
                z + (z === 0 ? -0.13 : z === 16 ? 0.13 : 0),
                1.06,
                0.16,
                1.06,
                0x618b56,
              );
          }
        if (edge && (x + z) % 3 === 0) {
          kit.box(
            this.terrain,
            x,
            -1.1,
            z,
            1.03,
            0.2,
            1.03,
            id === "pyros" ? 0xff9958 : id === "mycelia" ? 0x9580b9 : 0x6e965a,
            id === "pyros",
          );
        }
        if (
          !waterCell(x, z) &&
          (x * 19 + z * 11) % 23 === 0 &&
          x > 0 &&
          z > 0
        ) {
          kit.box(
            this.terrain,
            x - 0.22,
            h + 0.17,
            z + 0.2,
            0.08,
            0.25,
            0.08,
            id === "listoria"
              ? 0xb5d871
              : id === "mycelia"
                ? 0xa5c3ef
                : 0xd1a474,
          );
        }
        if (
          x > 0 &&
          z > 0 &&
          x < 16 &&
          z < 16 &&
          (x * 31 + z * 17) % 11 === 0 &&
          !waterCell(x, z) &&
          !BEDS.some((b) => b.x === x && b.z === z) &&
          !(x >= 11 && z >= 11)
        ) {
          const species =
              id === "mycelia"
                ? "lightflower"
                : id === "pyros"
                  ? "fireflower"
                  : "sunflower",
            flower = kit.plant(species);
          flower.position.set(x + 0.18, h, z - 0.17);
          flower.scale.setScalar(0.38);
          this.terrain.add(flower);
          for (const side of [-1, 1])
            kit.box(
              this.terrain,
              x + side * 0.22,
              h + 0.12,
              z + 0.21,
              0.15,
              0.2,
              0.17,
              id === "listoria"
                ? 0x72a451
                : id === "mycelia"
                  ? 0x9c80b5
                  : 0x9f986d,
            );
        }
      }
    // A visible ribbon pours from the top stream down the front face of the cube.
    for (let i = 0; i < 10; i++) {
      const drop = kit.box(
        this.waterfall,
        5,
        -i * 0.58,
        16.48,
        0.74,
        0.65,
        0.1,
        id === "pyros" ? 0xff994f : 0x70d5eb,
        true,
        0.8,
      );
      drop.userData.start = drop.position.y;
      kit.box(
        this.waterfall,
        5.22,
        -i * 0.58,
        16.55,
        0.13,
        0.44,
        0.1,
        id === "pyros" ? 0xffcf65 : 0xb2f4ff,
        true,
        0.8,
      );
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.4,
        radius = 10 + (i % 3) * 1.2;
      const cloud = new T.Group();
      for (let j = 0; j < 3; j++)
        kit.box(
          cloud,
          j * 0.48,
          Math.sin(j) * 0.2,
          0,
          0.85,
          0.55,
          0.7,
          0xbacbd7,
          false,
          0.72,
        );
      cloud.position.set(
        8 + Math.cos(angle) * radius,
        -2 - (i % 4),
        8 + Math.sin(angle) * radius,
      );
      this.terrain.add(cloud);
    }
    for (const bed of BEDS) {
      const h = terrainHeight(bed.x, bed.z);
      kit.box(this.terrain, bed.x, h + 0.045, bed.z, 0.92, 0.1, 0.92, 0x76513e);
      for (const offset of [-0.27, 0, 0.27])
        kit.box(
          this.terrain,
          bed.x,
          h + 0.11,
          bed.z + offset,
          0.83,
          0.04,
          0.06,
          0x4e3e35,
        );
    }
    for (const x of [5.5, 9.5])
      for (const z of [7.5, 9.5]) {
        kit.box(
          this.terrain,
          x,
          terrainHeight(x, z) + 0.28,
          z,
          0.1,
          0.55,
          0.1,
          0xbfa076,
        );
        kit.box(
          this.terrain,
          x,
          terrainHeight(x, z) + 0.5,
          z,
          0.15,
          0.08,
          0.15,
          0xe1c591,
        );
      }
    for (let x = 7; x <= 12; x++)
      kit.box(
        this.terrain,
        x,
        terrainHeight(x, 11) + 0.04,
        11,
        0.76,
        0.08,
        0.65,
        id === "mycelia" ? 0x8ec9e1 : 0xbcc2ad,
        id === "mycelia",
      );
    for (let x = 11; x <= 15; x++)
      for (let z = 11; z <= 15; z++)
        kit.box(
          this.terrain,
          x,
          terrainHeight(x, z) + 0.03,
          z,
          0.94,
          0.08,
          0.94,
          (x + z) % 2 ? 0x8495a2 : 0x91a0aa,
        );
    for (const side of [-1, 1])
      kit.box(
        this.terrain,
        SHIP.x + side * 1.4,
        terrainHeight(SHIP.x, SHIP.z) + 0.12,
        SHIP.z,
        0.1,
        0.04,
        2.8,
        0xf2cf7c,
        true,
      );
    kit.batch(this.terrain);
    this.ship = kit.ship();
    this.ship.position.set(
      SHIP.x,
      terrainHeight(SHIP.x, SHIP.z) + 0.13,
      SHIP.z,
    );
    this.root.add(this.ship);
    this.rebuild(save, now);
  }
  rebuild(save: Save, now: number) {
    this.clear(this.objects);
    this.lastNodes = this.nodeSignature(save, now);
    for (const n of nodes(this.id)) {
      if (nodeReady(save.worlds[this.id], n.id, now)) {
        const object = this.kit.resource(this.id, n.variant);
        object.position.set(n.x, terrainHeight(n.x, n.z) + 0.05, n.z);
        this.objects.add(object);
      } else
        this.kit.box(
          this.objects,
          n.x,
          terrainHeight(n.x, n.z) + 0.08,
          n.z,
          0.38,
          0.15,
          0.4,
          0x777374,
        );
    }
    for (const building of save.worlds[this.id].buildings) {
      const object = this.kit.building(building.kind, this.id);
      object.position.set(
        building.x + 0.5,
        terrainHeight(building.x + 0.5, building.z + 0.5),
        building.z + 0.5,
      );
      object.rotation.y = (building.rotation * Math.PI) / 2;
      this.objects.add(object);
    }
    this.kit.batch(this.objects);
    this.lastDynamic = "";
    this.updateCrops(save, now);
  }
  updateCrops(save: Save, now: number) {
    if (this.lastNodes !== this.nodeSignature(save, now)) {
      this.rebuild(save, now);
      return true;
    }
    const crops = save.worlds[this.id].crops,
      signature =
        Object.entries(crops)
          .map(([k, c]) => `${k}:${c.plant}:${stage(c, now)}:${ready(c, now)}`)
          .join("|") +
        ";" +
        Object.entries(save.worlds[this.id].depleted)
          .map(([id]) => nodeReady(save.worlds[this.id], id, now))
          .join(",");
    if (signature === this.lastDynamic) return false;
    this.lastDynamic = signature;
    this.clear(this.crops);
    for (const [k, crop] of Object.entries(crops)) {
      const [x, z] = k.split(",").map(Number),
        object = this.kit.plant(crop.plant, stage(crop, now));
      object.position.set(x, terrainHeight(x, z) + 0.14, z);
      this.crops.add(object);
      if (ready(crop, now)) {
        const marker = this.kit.box(
          this.crops,
          x,
          terrainHeight(x, z) + 1.2,
          z,
          0.17,
          0.17,
          0.17,
          0xffdf84,
          true,
        );
        marker.rotation.z = Math.PI / 4;
      }
    }
    this.kit.batch(this.crops);
    return true;
  }
  animate(time: number) {
    this.waterfall.children.forEach(
      (child, i) =>
        (child.position.y =
          Number(child.userData.start ?? -Math.floor(i / 2) * 0.58) -
          ((time * 0.65) % 0.58)),
    );
  }
  private nodeSignature(save: Save, now: number) {
    return nodes(this.id)
      .map((n) => nodeReady(save.worlds[this.id], n.id, now))
      .join(",");
  }
  private clear(group: T.Group) {
    group.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    group.clear();
  }
  dispose() {
    this.root.removeFromParent();
    this.clear(this.root);
  }
}
