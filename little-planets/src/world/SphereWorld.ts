import * as T from "three";
import { Models } from "./Models";
import { nodes, ship } from "../../shared/catalog";
import { nodeReady, type Save } from "../../shared/model";
import {
  sphereNormal,
  sphereCoordinates,
  SPHERE_RADIUS,
  type Point,
} from "../../shared/sphere";
export function spherePoint(p: Point, height = 0) {
  const n = sphereNormal(p);
  return new T.Vector3(n.x, n.y, n.z).multiplyScalar(SPHERE_RADIUS + height);
}
export function sphereUp(p: Point) {
  const n = sphereNormal(p);
  return new T.Vector3(n.x, n.y, n.z);
}
export class SphereWorld {
  readonly root = new T.Group();
  readonly ship: T.Group;
  private ground: T.Mesh;
  private geometry: T.SphereGeometry;
  private material: T.MeshStandardMaterial;
  private resources = new T.Group();
  private nodeKey = "";
  private decor = new T.Group();
  constructor(
    private kit: Models,
    save: Save,
    now: number,
  ) {
    this.geometry = new T.SphereGeometry(SPHERE_RADIUS, 72, 36);
    const positions = this.geometry.getAttribute("position"),
      colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const n = new T.Vector3().fromBufferAttribute(positions, i).normalize(),
        pattern =
          Math.sin(n.x * 11 + n.y * 7) * Math.cos(n.z * 8 - n.x * 4) +
          Math.sin(n.y * 13 + n.z * 6) * 0.5;
      const color = new T.Color(
        pattern > 0.65 ? 0xb6b584 : pattern < -0.7 ? 0x5f956a : 0x83b76c,
      );
      color.multiplyScalar(0.94 + Math.sin(n.x * 40 + n.z * 30) * 0.035);
      colors.push(color.r, color.g, color.b);
    }
    this.geometry.setAttribute(
      "color",
      new T.Float32BufferAttribute(colors, 3),
    );
    this.material = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
    });
    this.ground = new T.Mesh(this.geometry, this.material);
    this.ground.receiveShadow = true;
    this.root.add(this.ground, this.decor);
    this.root.add(this.resources);
    for (let i = 0; i < 75; i++) {
      const p = { x: (i * 31 + 17) % 120, z: 3 + ((i * 17) % 54) },
        object = new T.Group();
      for (let j = 0; j < 3; j++)
        kit.box(
          object,
          (j - 1) * 0.3,
          0.18 + j * 0.08,
          0,
          0.5,
          0.4 + j * 0.1,
          0.55,
          0xa0a295,
        );
      object.position.copy(spherePoint(p));
      object.quaternion.setFromUnitVectors(T.Object3D.DEFAULT_UP, sphereUp(p));
      this.decor.add(object);
    }
    kit.batch(this.decor);
    const pad = ship("orbis"),
      base = new T.Group();
    kit.box(base, 0, -0.03, 0, 4, 0.12, 4, 0x899d9f);
    for (const x of [-1.5, 1.5])
      kit.box(base, x, 0.04, 0, 0.1, 0.03, 3, 0xf6d58e, true);
    base.position.copy(spherePoint(pad, 0.04));
    base.quaternion.setFromUnitVectors(T.Object3D.DEFAULT_UP, sphereUp(pad));
    this.root.add(base);
    this.ship = kit.ship();
    this.ship.position.copy(spherePoint(pad, 0.14));
    this.ship.quaternion.copy(base.quaternion);
    this.root.add(this.ship);
    this.rebuild(save, now);
  }
  pick(ray: T.Ray) {
    const hit = ray.intersectSphere(
      new T.Sphere(new T.Vector3(), SPHERE_RADIUS + 0.05),
      new T.Vector3(),
    );
    return hit ? sphereCoordinates(hit) : null;
  }
  rebuild(save: Save, now: number) {
    const signature = nodes("orbis")
      .map((n) => nodeReady(save.worlds.orbis, n.id, now))
      .join("");
    if (signature === this.nodeKey) return;
    this.nodeKey = signature;
    this.resources.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.resources.clear();
    for (const n of nodes("orbis")) {
      if (!nodeReady(save.worlds.orbis, n.id, now)) continue;
      const object = this.kit.resource("listoria", n.variant);
      object.position.copy(spherePoint(n));
      object.quaternion.setFromUnitVectors(T.Object3D.DEFAULT_UP, sphereUp(n));
      this.resources.add(object);
    }
    this.kit.batch(this.resources);
  }

  updateCrops(save: Save, now: number) {
    this.rebuild(save, now);
  }
  animate(_time: number) {}
  dispose() {
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
