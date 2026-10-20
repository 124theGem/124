import { ActorFollower } from "./Motion";
import * as T from "three";
import { Models } from "./Models";
import { spherePoint, sphereUp } from "./SphereWorld";
import { terrainHeight } from "../../shared/catalog";
import type { Save } from "../../shared/model";
export class Enemies {
  readonly root = new T.Group();
  private actors = new Map<
    string,
    { body: T.Group; bar: T.Mesh; barBack: T.Mesh; hp: number }
  >();
  private effects: T.Group[] = [];
  private motions = new Map<string, ActorFollower>();
  constructor(
    private kit: Models,
    save: Save,
  ) {
    for (const e of save.worlds[save.planet].enemies) {
      const body = new T.Group(),
        color =
          e.kind === "drone"
            ? 0x8a7fb7
            : e.kind === "stalker"
              ? 0xa65c71
              : 0xb38a5e;
      kit.box(body, 0, 0.55, 0, 0.85, 0.55, 1, color);
      kit.box(body, 0, 0.8, 0.45, 0.55, 0.38, 0.5, color);
      for (const side of [-1, 1]) {
        kit.box(body, side * 0.23, 0.86, 0.72, 0.13, 0.1, 0.06, 0xffae82, true);
        if (e.kind === "drone") {
          kit.box(body, side * 0.75, 0.6, 0, 0.6, 0.12, 0.55, 0x53687b);
          kit.box(body, side * 0.78, 0.74, 0, 0.45, 0.06, 0.45, 0x91dcdf, true);
        } else {
          for (const z of [-0.35, 0.3]) {
            const leg = kit.box(
              body,
              side * 0.5,
              0.25,
              z,
              0.17,
              0.5,
              0.2,
              0x706368,
            );
            leg.rotation.z = side * 0.3;
          }
        }
      }
      if (e.kind === "stalker") {
        kit.box(body, 0, 1.2, 0, 0.18, 0.8, 0.2, 0xbba0c2);
        kit.box(body, 0, 1.65, 0, 0.5, 0.15, 0.45, 0x9086ae);
      }
      kit.batch(body);
      const back = kit.box(body, 0, 2, 0, 1, 0.07, 0.07, 0x3c384c),
        bar = kit.box(body, 0, 2.01, 0.01, 1, 0.065, 0.08, 0xefab87, true);
      this.root.add(body);
      this.motions.set(e.id, new ActorFollower());
      this.actors.set(e.id, { body, bar, barBack: back, hp: e.hp });
    }
  }
  update(save: Save, time: number, dt: number) {
    for (const e of save.worlds[save.planet].enemies) {
      const a = this.actors.get(e.id);
      if (!a) continue;
      a.body.visible = e.hp > 0;
      if (!a.body.visible) {
        a.hp = e.hp;
        continue;
      }
      const target = spherePoint(
        e,
        e.kind === "drone" ? 0.8 : 0.05,
        save.planet,
      );
      a.body.position.copy(
        this.motions.get(e.id)!.update(target, dt, a.hp <= 0),
      );
      a.body.quaternion.slerp(
        new T.Quaternion().setFromUnitVectors(
          T.Object3D.DEFAULT_UP,
          sphereUp(e, save.planet),
        ),
        1 - Math.exp(-5 * dt),
      );
      a.bar.scale.x = e.hp / e.maxHp;
      a.bar.position.x = -(1 - e.hp / e.maxHp) * 0.5;
      a.hp = e.hp;
    }
    for (const fx of [...this.effects]) {
      const end = fx.userData.end as number;
      fx.scale.multiplyScalar(1 + dt * 5);
      (fx.children[0] as T.Mesh).rotation.y += dt * 8;
      if (time > end) {
        fx.removeFromParent();
        this.effects.splice(this.effects.indexOf(fx), 1);
      }
    }
  }
  hit(x: number, z: number, time: number) {
    const fx = new T.Group();
    this.kit.box(fx, 0, 0.7, 0, 0.16, 0.9, 0.16, 0xffe9a0, true);
    fx.position.set(x, terrainHeight(x, z), z);
    fx.userData.end = time + 0.25;
    this.root.add(fx);
    this.effects.push(fx);
  }
  pick(ray: T.Ray) {
    let nearest: { id: string; distance: number } | undefined;
    for (const [id, a] of this.actors) {
      if (!a.body.visible) continue;
      const hit = ray.intersectBox(
        new T.Box3().setFromObject(a.body),
        new T.Vector3(),
      );
      if (hit) {
        const distance = hit.distanceTo(ray.origin);
        if (!nearest || distance < nearest.distance) nearest = { id, distance };
      }
    }
    return nearest?.id;
  }
  get positions() {
    return [...this.actors].map(([id, a]) => ({
      id,
      visible: a.body.visible,
      position: a.body.position.toArray(),
    }));
  }
  dispose() {
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.root.removeFromParent();
    this.root.clear();
  }
}
