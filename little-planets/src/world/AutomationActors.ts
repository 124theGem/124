import { ActorFollower } from "./Motion";
import * as T from "three";
import { Models } from "./Models";
import { spherePoint, sphereUp } from "./SphereWorld";
import type { Save } from "../../shared/model";
import { bodyCenter, padPoint } from "../../shared/space";
import type { DeviceKind } from "../../shared/automation";
export class AutomationActors {
  readonly root = new T.Group();
  private actors = new Map<string, T.Group>();
  private motions = new Map<string, ActorFollower>();
  private previousTime = 0;
  constructor(private kit: Models) {}
  private model(kind: DeviceKind) {
    const g = new T.Group(),
      k = this.kit;
    if (kind === "warehouse" || kind === "refinery")
      return k.building(
        kind === "warehouse" ? "warehouse" : "laboratory",
        "home",
      );
    if (kind === "drone") {
      k.box(g, 0, 0.25, 0, 0.9, 0.45, 0.9, 0xe4d7b5);
      k.box(g, 0, -0.2, 0, 0.65, 0.4, 0.65, 0x718c7d);
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          k.box(g, x * 0.65, 0.28, z * 0.65, 0.7, 0.08, 0.7, 0x475a60);
          k.box(g, x * 0.65, 0.35, z * 0.65, 0.45, 0.05, 0.45, 0x86dfd3, true);
        }
    } else if (kind === "crawler") {
      k.box(g, 0, 0.55, 0, 1.2, 0.45, 1.55, 0xd1d9c7);
      k.box(g, 0, 0.9, -0.15, 0.9, 0.4, 0.8, 0x6d8a8d);
      k.box(g, 0, 1.14, 0.25, 0.75, 0.09, 0.25, 0x74e0e5, true);
      for (const side of [-1, 1]) {
        k.box(g, side * 0.72, 0.32, 0, 0.35, 0.5, 1.8, 0x273e4b);
        for (let i = 0; i < 8; i++) {
          k.box(
            g,
            side * 0.73,
            0.59,
            -0.77 + i * 0.22,
            0.39,
            0.07,
            0.15,
            0x869b9a,
          );
          k.box(
            g,
            side * 0.73,
            0.06,
            -0.77 + i * 0.22,
            0.39,
            0.07,
            0.15,
            0x869b9a,
          );
        }
        for (let i = 0; i < 4; i++)
          k.facet(
            g,
            side * 0.91,
            0.3,
            -0.62 + i * 0.4,
            0.05,
            0.19,
            0.19,
            0xb8bfb0,
          );
      }
      for (const x of [-0.35, 0.35])
        k.box(g, x, 0.9, 0.6, 0.12, 0.5, 0.25, 0xe0c291);
    } else if (kind === "hunter") {
      // Broad armoured torso, twin shoulder launchers, piston legs and arm cannons.
      k.box(g, 0, 1.65, 0, 1.35, 1.1, 0.85, 0x66727b);
      k.box(g, 0, 1.85, 0.49, 0.75, 0.4, 0.18, 0xc2c9bd);
      k.box(g, 0, 2.06, 0.59, 0.4, 0.12, 0.08, 0xfa6d56, true);
      k.box(g, 0, 1.02, 0, 0.75, 0.35, 0.7, 0x374149);
      for (const s of [-1, 1]) {
        k.box(g, s * 0.43, 0.58, 0, 0.43, 0.9, 0.5, 0x9da8a5);
        k.box(g, s * 0.43, 0.16, 0.14, 0.62, 0.25, 0.85, 0x46535c);
        k.box(g, s * 1.02, 1.75, 0, 0.6, 0.85, 0.7, 0x48545e);
        k.box(g, s * 1.02, 1.9, 0.38, 0.36, 0.18, 0.08, 0xb94c46);
        k.box(g, s * 1.05, 1.05, 0.35, 0.3, 0.8, 0.4, 0x87918f);
        k.box(g, s * 1.05, 0.85, 0.7, 0.2, 0.25, 0.7, 0x303d47);
        k.box(g, s * 0.64, 2.43, -0.13, 0.68, 0.47, 0.55, 0x3d4753);
        for (let i = 0; i < 3; i++)
          k.box(
            g,
            s * 0.64 + (i - 1) * 0.16,
            2.46,
            0.17,
            0.1,
            0.1,
            0.05,
            0x97575b,
          );
      }
    } else {
      k.box(g, 0, 0.75, 0, 0.8, 0.8, 0.6, 0xd6d2b9);
      k.box(g, 0, 1.28, 0, 0.6, 0.4, 0.5, 0x658e7e);
      k.box(g, 0, 1.3, 0.27, 0.36, 0.12, 0.05, 0x8be1d2, true);
      for (const s of [-1, 1]) {
        k.box(g, s * 0.25, 0.22, 0, 0.25, 0.45, 0.3, 0x5b6a6b);
        k.box(g, s * 0.55, 0.72, 0.13, 0.2, 0.65, 0.25, 0x95a79a);
      }
      k.box(g, 0, 0.7, -0.5, 0.65, 0.65, 0.4, 0xb39b70);
    }
    k.batch(g);
    return g;
  }
  update(save: Save, time: number) {
    const dt = this.previousTime
      ? Math.min(0.1, time - this.previousTime)
      : 0.016;
    this.previousTime = time;
    const present = new Set<string>();
    for (const d of save.automation.devices) {
      if (d.planet !== save.planet && !d.transit) continue;
      // A civil warehouse already has its architectural model in SphereWorld.
      if (
        d.kind === "warehouse" &&
        save.worlds[d.planet].buildings.some(
          (b) =>
            b.kind === "warehouse" &&
            Math.abs(b.x - d.x) < 0.001 &&
            Math.abs(b.z - d.z) < 0.001,
        )
      )
        continue;
      present.add(d.id);
      let g = this.actors.get(d.id);
      if (!g) {
        g = this.model(d.kind);
        this.actors.set(d.id, g);
        this.motions.set(d.id, new ActorFollower());
        g.userData.deviceId = d.id;
        this.root.add(g);
      }
      if (d.transit) {
        const a = padPoint(d.transit.from, 8),
          b = padPoint(d.transit.to, 8),
          c = bodyCenter(save.planet),
          t = Math.max(
            0,
            Math.min(
              1,
              (Date.now() - d.transit.started) /
                (d.transit.ends - d.transit.started),
            ),
          );
        g.position.set(
          a.x + (b.x - a.x) * t - c.x,
          a.y + (b.y - a.y) * t - c.y,
          a.z + (b.z - a.z) * t - c.z,
        );
        this.motions.get(d.id)!.update(g.position, dt, true);
        continue;
      }
      const target = spherePoint(
          d,
          d.kind === "drone" ? 2.6 + Math.sin(time * 3) * 0.12 : 0.05,
          d.planet,
        ),
        motion = this.motions.get(d.id)!;
      const previous = g.position.clone();
      g.position.copy(motion.update(target, dt));
      const up = sphereUp(d, d.planet),
        travel = g.position.clone().sub(previous).projectOnPlane(up);
      let rotation = new T.Quaternion().setFromUnitVectors(
        T.Object3D.DEFAULT_UP,
        up,
      );
      if (travel.lengthSq() > 0.000001) {
        const heading = travel.normalize(),
          right = new T.Vector3().crossVectors(up, heading).normalize();
        rotation.setFromRotationMatrix(
          new T.Matrix4().makeBasis(right, up, heading),
        );
      }
      g.quaternion.slerp(rotation, 1 - Math.exp(-6 * dt));
    }
    for (const [id, g] of this.actors)
      if (!present.has(id)) {
        g.traverse((o) => {
          if (o instanceof T.InstancedMesh) o.dispose();
        });
        g.removeFromParent();
        this.actors.delete(id);
        this.motions.delete(id);
      }
  }
  pick(ray: T.Ray) {
    this.root.updateMatrixWorld(true);
    const caster = new T.Raycaster();
    caster.ray.copy(ray);
    const hit = caster.intersectObject(this.root, true)[0];
    let o: T.Object3D | null = hit?.object ?? null;
    while (o) {
      if (o.userData.deviceId) return o.userData.deviceId as string;
      o = o.parent;
    }
    return null;
  }
  get positions() {
    return [...this.actors].map(([id, body]) => ({
      id,
      position: body.position.toArray(),
    }));
  }
  dispose() {
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.root.clear();
    this.root.removeFromParent();
    this.actors.clear();
  }
}
