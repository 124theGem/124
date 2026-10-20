import * as T from "three";
import { Models } from "./Models";
import { Astronaut } from "./Astronaut";
import { tiledSphere } from "./TiledSphere";
import { bodyCenter, padNormal } from "../../shared/space";
import { grapplePosition, type GrappleState } from "../../shared/grapple";
import type { Save } from "../../shared/model";
/** The rider actually hangs from a transverse handle attached to the rendered interplanetary cable. */
export class ZiplineScene {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(58, 1, 0.1, 40000);
  readonly rider: T.Group;
  private astronaut: Astronaut;
  private handle = new T.Group();
  private geometries: T.BufferGeometry[] = [];
  private materials: T.Material[] = [];
  private ready = false;
  private cameraOffset = new T.Vector3();
  constructor(
    private kit: Models,
    private state: GrappleState,
    save: Save,
  ) {
    this.scene.background = new T.Color(0x071729);
    this.scene.add(new T.HemisphereLight(0xe2eddf, 0x344c55, 2));
    const sun = new T.DirectionalLight(0xffecd4, 3);
    sun.position.set(40, 100, 70);
    this.scene.add(sun);
    const points: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const y = 1 - (2 * (i + 0.5)) / 1000,
        a = i * 2.39996,
        r = Math.sqrt(1 - y * y);
      points.push(Math.cos(a) * r * 20000, y * 20000, Math.sin(a) * r * 20000);
    }
    const starGeo = new T.BufferGeometry().setAttribute(
        "position",
        new T.Float32BufferAttribute(points, 3),
      ),
      starMat = new T.PointsMaterial({
        color: 0xbecedc,
        size: 1.2,
        sizeAttenuation: false,
      });
    this.scene.add(new T.Points(starGeo, starMat));
    this.geometries.push(starGeo);
    this.materials.push(starMat);
    for (const id of new Set([state.origin, state.target])) {
      const data = tiledSphere(id, 20),
        material = new T.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1,
        }),
        body = new T.Mesh(data.geometry, material),
        center = bodyCenter(id);
      body.position.set(center.x, center.y, center.z);
      this.scene.add(body);
      this.geometries.push(data.geometry);
      this.materials.push(material);
    }
    // A physical thickness keeps the cable visible beside the handle, including on mobile.
    const mat = new T.MeshBasicMaterial({ color: 0xe5c99c });
    for (let i = 1; i < state.route.length; i++) {
      const a = state.route[i - 1], b = state.route[i],
        from = new T.Vector3(a.x, a.y, a.z),
        to = new T.Vector3(b.x, b.y, b.z),
        direction = to.clone().sub(from), length = direction.length();
      if (length < 0.001) continue;
      const geometry = new T.CylinderGeometry(0.035, 0.035, length, 6),
        cable = new T.Mesh(geometry, mat);
      cable.position.copy(from).add(to).multiplyScalar(0.5);
      cable.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
      this.scene.add(cable);
      this.geometries.push(geometry);
    }
    this.materials.push(mat);
    this.astronaut = new Astronaut(kit);
    this.astronaut.mode = "hang";
    this.rider = this.astronaut.root;
    this.scene.add(this.rider);
    kit.box(this.handle, 0, 1.87, 0, 1.25, 0.09, 0.09, 0xc5ab7f);
    kit.box(this.handle, 0, 2.06, 0, 0.08, 0.38, 0.08, 0x718b94);
    kit.box(this.handle, 0, 2.25, 0, 0.3, 0.13, 0.25, 0xe0d7b6);
    for (const side of [-1, 1]) {
      kit.box(this.handle, side * 0.32, 1.08, 0, 0.16, 0.6, 0.19, 0xe4dfd0);
      kit.box(this.handle, side * 0.34, 1.55, 0, 0.15, 0.45, 0.17, 0xe4dfd0);
      kit.box(this.handle, side * 0.35, 1.84, 0, 0.18, 0.18, 0.18, 0x6f8e87);
    }
    this.rider.add(this.handle);
    this.resize();
  }
  update(now: number, dt: number) {
    const current = grapplePosition(this.state, now),
      p = current.position,
      from = padNormal(this.state.origin),
      to = padNormal(this.state.target),
      a = new T.Vector3(from.x, from.y, from.z),
      b = new T.Vector3(to.x, to.y, to.z),
      q = new T.Quaternion().setFromUnitVectors(a, b),
      up = a
        .clone()
        .applyQuaternion(new T.Quaternion().slerp(q, current.progress));
    const direction = new T.Vector3(
        current.direction.x,
        current.direction.y,
        current.direction.z,
      ).normalize(),
      heading = direction.clone().projectOnPlane(up);
    if (heading.lengthSq() < 0.01)
      heading
        .set(Math.abs(up.y) > 0.9 ? 1 : 0, Math.abs(up.y) > 0.9 ? 0 : 1, 0)
        .projectOnPlane(up);
    heading.normalize();
    const right = new T.Vector3().crossVectors(up, heading).normalize();
    this.rider.position.set(p.x, p.y, p.z).addScaledVector(up, -2.25 * 0.83);
    this.rider.quaternion.setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, heading),
    );
    this.astronaut.update(now / 1000, dt, false);
    const target = this.rider.position.clone().addScaledVector(up, 0.8),
      offset = direction
        .clone()
        .multiplyScalar(-6.5)
        .addScaledVector(up, 3.2)
        .addScaledVector(right, 3);
    if (!this.ready) {
      this.cameraOffset.copy(offset);
      this.ready = true;
    } else this.cameraOffset.lerp(offset, 1 - Math.exp(-8 * dt));
    // Smooth the viewing boom, not the rider's high-speed world translation.
    this.camera.position.copy(target).add(this.cameraOffset);
    this.camera.up.copy(up);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    return current.progress;
  }
  get followDistance() {
    return this.camera.position.distanceTo(this.rider.position);
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.scene.clear();
  }
}
