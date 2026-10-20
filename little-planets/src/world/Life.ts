import { ActorFollower } from "./Motion";
import { spherePoint, sphereUp } from "./SphereWorld";
import * as T from "three";
import { Models } from "./Models";
import {
  planetDepth,
  isSphere,
  biomeOf,
  planetSize,
  terrainHeight,
  type PlanetId,
} from "../../shared/catalog";
import {
  walkable,
  worldEvent,
  type Save,
  type WorldEvent,
} from "../../shared/model";
interface Animal {
  x: number;
  z: number;
  tx: number;
  tz: number;
  heading: number;
  phase: number;
  parts: { matrix: T.Matrix4; bucket: number; index: number }[];
}
/** Small fauna use shared instanced geometry: animated bodies do not add one draw call per part. */
export class Life {
  readonly root = new T.Group();
  private animals: Animal[] = [];
  private batches: T.InstancedMesh[] = [];
  private phase = 0;
  private followers: ActorFollower[] = [];
  private rotations: T.Quaternion[] = [];
  constructor(
    private kit: Models,
    private planet: PlanetId,
    save: Save,
  ) {
    const size = planetSize(planet),
      count = planet === "home" ? 10 : 5,
      buckets: {
        geometry: T.BufferGeometry;
        material: T.Material;
        matrices: T.Matrix4[];
      }[] = [];
    for (let i = 0; i < count; i++) {
      let x = 2 + ((i * 7 + 5) % (size - 4)),
        z =
          2 + ((i * 11 + 3) % Math.max(1, Math.floor(planetDepth(planet) - 4)));
      for (let n = 0; n < 80 && !walkable(save, planet, x, z); n++) {
        x = 2 + ((i * 7 + n * 3 + 5) % (size - 4));
        z =
          2 +
          ((i * 11 + n * 7 + 3) %
            Math.max(1, Math.floor(planetDepth(planet) - 4)));
      }
      this.followers.push(new ActorFollower());
      this.rotations.push(new T.Quaternion());
      const animal: Animal = {
          x,
          z,
          tx: x,
          tz: z,
          heading: i,
          phase: i * 1.7,
          parts: [],
        },
        model = new T.Group();
      const color =
        biomeOf(planet) === "mycelia"
          ? 0xa18ce4
          : biomeOf(planet) === "pyros"
            ? 0xb6a391
            : 0xd9bb91;
      kit.box(
        model,
        0,
        0.35,
        0,
        0.46,
        0.4,
        0.7,
        color,
        biomeOf(planet) === "mycelia",
      );
      kit.box(model, 0, 0.55, 0.35, 0.4, 0.38, 0.36, color);
      if (biomeOf(planet) === "pyros") {
        kit.box(model, 0, 0.57, -0.07, 0.65, 0.25, 0.7, 0x8d8586);
        kit.box(model, 0, 0.28, -0.54, 0.16, 0.13, 0.4, color);
      } else
        for (const side of [-1, 1]) {
          const ear = kit.box(
            model,
            side * 0.12,
            0.92,
            0.31,
            0.11,
            0.5,
            0.12,
            color,
            biomeOf(planet) === "mycelia",
          );
          ear.rotation.z = side * 0.12;
          kit.box(model, side * 0.12, 0.94, 0.38, 0.05, 0.3, 0.025, 0xc48f9a);
        }
      for (const side of [-1, 1]) {
        kit.box(model, side * 0.21, 0.6, 0.45, 0.055, 0.07, 0.07, 0x334453);
        for (const z of [-0.2, 0.27])
          kit.box(model, side * 0.19, 0.12, z, 0.14, 0.2, 0.2, color);
      }
      kit.box(model, 0, 0.51, 0.56, 0.08, 0.065, 0.05, 0xa67a7f);
      kit.box(model, 0, 0.37, -0.43, 0.2, 0.22, 0.2, 0xefdfc7);
      model.updateMatrixWorld(true);
      model.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        let b = buckets.findIndex(
          (b) => b.geometry === o.geometry && b.material === o.material,
        );
        if (b < 0) {
          b = buckets.length;
          buckets.push({
            geometry: o.geometry,
            material: o.material as T.Material,
            matrices: [],
          });
        }
        const index = buckets[b].matrices.length;
        buckets[b].matrices.push(o.matrixWorld.clone());
        animal.parts.push({ matrix: o.matrixWorld.clone(), bucket: b, index });
      });
      this.animals.push(animal);
    }
    for (const bucket of buckets) {
      const mesh = new T.InstancedMesh(
        bucket.geometry,
        bucket.material,
        bucket.matrices.length,
      );
      mesh.castShadow = true;
      this.root.add(mesh);
      this.batches.push(mesh);
    }
    this.update(save, 0, 0.01);
  }
  update(save: Save, time: number, dt: number) {
    const matrix = new T.Matrix4(),
      rotation = new T.Quaternion(),
      position = new T.Vector3(),
      size = planetSize(this.planet);
    this.phase += dt;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i],
        dx = a.tx - a.x,
        dz = a.tz - a.z,
        d = Math.hypot(dx, dz);
      if (d < 0.2) {
        a.phase += 0.17;
        for (let n = 0; n < 14; n++) {
          const angle = a.phase * 7 + n * 2.4;
          const x = T.MathUtils.clamp(a.x + Math.sin(angle) * 3, 1, size - 2),
            z = T.MathUtils.clamp(a.z + Math.cos(angle) * 3, 1, size - 2);
          if (walkable(save, this.planet, x, z)) {
            a.tx = x;
            a.tz = z;
            break;
          }
        }
      } else {
        const nx = a.x + (dx / d) * dt * 0.65,
          nz = a.z + (dz / d) * dt * 0.65;
        if (walkable(save, this.planet, nx, nz)) {
          a.x = nx;
          a.z = nz;
          a.heading = Math.atan2(dx, dz);
        } else {
          a.tx = a.x;
          a.tz = a.z;
        }
      }
      position.copy(
        this.followers[i].update(
          spherePoint(
            a,
            0.05 + Math.abs(Math.sin(time * 5 + i)) * 0.08,
            this.planet,
          ),
          dt,
        ),
      );
      rotation.setFromUnitVectors(
        T.Object3D.DEFAULT_UP,
        sphereUp(a, this.planet),
      );
      rotation.multiply(
        new T.Quaternion().setFromAxisAngle(T.Object3D.DEFAULT_UP, a.heading),
      );
      this.rotations[i].slerp(rotation, 1 - Math.exp(-5 * dt));
      matrix.compose(position, this.rotations[i], new T.Vector3(1, 1, 1));
      for (const part of a.parts)
        this.batches[part.bucket].setMatrixAt(
          part.index,
          new T.Matrix4().multiplyMatrices(matrix, part.matrix),
        );
    }
    for (const batch of this.batches) {
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
    }
  }
  get positions() {
    return this.animals.map((a) => ({ x: a.x, z: a.z }));
  }
  dispose() {
    for (const batch of this.batches) batch.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}

export class Atmosphere {
  readonly root = new T.Group();
  private meteor = new T.Group();
  private clouds = new T.Group();
  private plume: T.InstancedMesh;
  private geometry = new T.BoxGeometry(1, 1, 1);
  private material = new T.MeshBasicMaterial({
    color: 0xdde5e4,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  private eventKey = "";
  event: WorldEvent | null = null;
  private launch?: { x: number; y: number; z: number; time: number };
  private clock = 0;
  private exhaustY = 0;
  private launchUp = new T.Vector3(0, 1, 0);
  smokeCount = 0;
  constructor(private kit: Models) {
    this.plume = new T.InstancedMesh(this.geometry, this.material, 64);
    this.plume.count = 0;
    this.plume.frustumCulled = false;
    this.root.add(this.plume, this.meteor, this.clouds);
    for (let i = 0; i < 7; i++) {
      const cloud = new T.Group();
      for (let j = 0; j < 4; j++)
        kit.box(
          cloud,
          j * 0.6,
          0.2 * Math.sin(j),
          (j % 2) * 0.2,
          1.2,
          0.55,
          1,
          0xe5edf0,
          false,
          0.66,
        );
      this.clouds.add(cloud);
    }
  }
  startLaunch(x: number, y: number, z: number, up = new T.Vector3(0, 1, 0)) {
    this.launch = { x, y, z, time: this.clock };
    this.exhaustY = 0;
    this.launchUp.copy(up);
  }
  setExhaust(y: number) {
    this.exhaustY = y;
  }
  stopLaunch() {
    this.launch = undefined;
    this.plume.count = 0;
    this.smokeCount = 0;
  }
  update(save: Save, now: number, time: number) {
    this.clock = time;
    this.event = save.inside ? null : worldEvent(save, save.planet, now);
    const event = this.event,
      k = event
        ? `${save.planet}:${event.id}:${event.type}:${event.claimed}`
        : "";
    if (k !== this.eventKey) {
      this.eventKey = k;
      this.meteor.clear();
      if (event?.type === "meteor" && !event.claimed) {
        this.kit.box(this.meteor, 0, 0.28, 0, 0.8, 0.6, 0.7, 0x726a66);
        const core = this.kit.box(
          this.meteor,
          0,
          0.6,
          0,
          0.37,
          0.4,
          0.38,
          0xffc777,
          true,
        );
        core.rotation.z = 0.3;
        for (const side of [-1, 1])
          this.kit.box(
            this.meteor,
            side * 0.65,
            0.04,
            0,
            0.65,
            0.08,
            0.5,
            0x595a61,
          );
      }
    }
    if (event?.type === "meteor" && !event.claimed) {
      this.meteor.visible = true;
      const progress = T.MathUtils.clamp((now - event.startsAt) / 5000, 0, 1);
      this.meteor.position.copy(
        spherePoint(event, (1 - progress) ** 2 * 26, save.planet),
      );
      this.meteor.quaternion.setFromUnitVectors(
        T.Object3D.DEFAULT_UP,
        sphereUp(event, save.planet),
      );
      this.meteor.rotateY(progress * 3);
    } else this.meteor.visible = false;
    const wind = event?.type === "wind" && !isSphere(save.planet);
    this.clouds.visible = !!wind;
    if (wind) {
      const size = planetSize(save.planet);
      this.clouds.children.forEach((cloud, i) =>
        cloud.position.set(
          ((time * 4 + i * 8) % (size + 18)) - 9,
          4 + (i % 3),
          3 + ((i * 7) % (size - 4)),
        ),
      );
    }
    if (this.launch) {
      const launch = this.launch;
      this.smokeCount = 64;
      this.plume.count = 64;
      for (let i = 0; i < 64; i++) {
        const age = (time - launch.time + i * 0.035) % 1.5,
          spread = 0.15 + age * 1.1,
          angle = i * 2.4,
          s = 0.12 + age * 0.48;
        const pos = new T.Vector3(
          Math.cos(angle) * spread,
          Math.max(0.1, this.exhaustY - age * 5) + age * 0.3,
          Math.sin(angle) * spread,
        )
          .applyQuaternion(
            new T.Quaternion().setFromUnitVectors(
              T.Object3D.DEFAULT_UP,
              this.launchUp,
            ),
          )
          .add(new T.Vector3(launch.x, launch.y, launch.z));
        this.plume.setMatrixAt(
          i,
          new T.Matrix4().compose(
            pos,
            new T.Quaternion(),
            new T.Vector3(s, s * 0.7, s),
          ),
        );
      }
      this.plume.instanceMatrix.needsUpdate = true;
    }
  }
  get picking() {
    return this.meteor;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.plume.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
