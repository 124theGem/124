import * as T from "three";
import { terrainHeight, isSphere } from "../../shared/catalog";
import { worldEvent, type Save } from "../../shared/model";
import { spherePoint, sphereUp } from "./SphereWorld";
/** Rain, a rotating debris funnel, thunderclouds and intermittent lightning around the player. */
export class Weather {
  readonly root = new T.Group();
  private drops: T.LineSegments;
  private dropGeometry = new T.BufferGeometry();
  private dropMaterial = new T.LineBasicMaterial({
    color: 0xc9e9f1,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  private dropData = new Float32Array(420 * 6);
  private funnel: T.InstancedMesh;
  private box = new T.BoxGeometry(1, 1, 1);
  private fogMaterial = new T.MeshStandardMaterial({
    color: 0x9babb8,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  private clouds: T.InstancedMesh;
  private bolt: T.Line;
  private boltGeometry = new T.BufferGeometry();
  private boltMaterial = new T.LineBasicMaterial({ color: 0xe2efff });
  private flash = new T.PointLight(0xb4dfff, 0, 70, 1.5);
  private lastThunder = -1;
  private flashUntil = -1;
  thunder = false;
  type: string | null = null;
  constructor() {
    this.drops = new T.LineSegments(this.dropGeometry, this.dropMaterial);
    this.dropGeometry.setAttribute(
      "position",
      new T.BufferAttribute(this.dropData, 3),
    );
    this.drops.frustumCulled = false;
    this.funnel = new T.InstancedMesh(this.box, this.fogMaterial, 90);
    this.funnel.frustumCulled = false;
    this.clouds = new T.InstancedMesh(this.box, this.fogMaterial, 25);
    this.clouds.frustumCulled = false;
    this.bolt = new T.Line(this.boltGeometry, this.boltMaterial);
    this.root.add(this.drops, this.funnel, this.clouds, this.bolt, this.flash);
    this.flash.position.set(0, 12, 2);
  }
  update(
    save: Save,
    position: { x: number; z: number },
    now: number,
    time: number,
  ) {
    const event = save.inside ? null : worldEvent(save, save.planet, now);
    this.type = event?.type ?? null;
    this.thunder = false;
    const rain =
        this.type === "rain" ||
        this.type === "storm" ||
        this.type === "hurricane",
      wind = this.type === "wind" || this.type === "hurricane",
      storm = this.type === "storm";
    this.root.visible = rain || wind;
    if (!this.root.visible) return;
    if (isSphere(save.planet)) {
      this.root.position.copy(spherePoint(position, 0, save.planet));
      this.root.quaternion.setFromUnitVectors(
        T.Object3D.DEFAULT_UP,
        sphereUp(position, save.planet),
      );
    } else {
      this.root.position.set(
        position.x,
        terrainHeight(position.x, position.z),
        position.z,
      );
      this.root.quaternion.identity();
    }
    this.drops.visible = rain;
    this.clouds.visible = true;
    this.funnel.visible = this.type === "hurricane";
    if (rain) {
      for (let i = 0; i < 420; i++) {
        const x = ((i * 7.317 + time * (wind ? 5 : 1)) % 22) - 11,
          z = ((i * 3.713 + time * 0.45) % 20) - 10,
          y = 12 - ((time * 13 + i * 0.371) % 12),
          at = i * 6;
        this.dropData.set(
          [x, y, z, x + (wind ? 0.5 : 0.12), y - 0.5, z + 0.05],
          at,
        );
      }
      this.dropGeometry.attributes.position.needsUpdate = true;
    }
    for (let i = 0; i < 25; i++) {
      const x = ((i * 4.1 + time * (wind ? 3.5 : 0.35)) % 32) - 16,
        z = ((i * 7.3) % 22) - 11,
        scale = 2 + (i % 3);
      this.clouds.setMatrixAt(
        i,
        new T.Matrix4().compose(
          new T.Vector3(
            x,
            (isSphere(save.planet) ? 17 : 10) + (i % 4) * 0.4,
            z,
          ),
          new T.Quaternion(),
          new T.Vector3(
            scale * (isSphere(save.planet) ? 0.65 : 1.4),
            0.8,
            scale * (isSphere(save.planet) ? 0.65 : 1),
          ),
        ),
      );
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    if (this.funnel.visible) {
      for (let i = 0; i < 90; i++) {
        const t = i / 90,
          y = t * 11,
          r = 0.4 + t * 3,
          angle = time * (5 - t * 2) + i * 2.4,
          s = 0.3 + t * 0.9;
        this.funnel.setMatrixAt(
          i,
          new T.Matrix4().compose(
            new T.Vector3(6 + Math.cos(angle) * r, y, 1 + Math.sin(angle) * r),
            new T.Quaternion().setFromEuler(new T.Euler(0, angle, 0.3)),
            new T.Vector3(s * 1.8, s * 0.6, s),
          ),
        );
      }
      this.funnel.instanceMatrix.needsUpdate = true;
    }
    const cycle = Math.floor(now / 9400);
    if (storm && cycle !== this.lastThunder) {
      this.lastThunder = cycle;
      this.flashUntil = time + 0.46;
      this.thunder = true;
    }
    const remaining = this.flashUntil - time,
      flashing =
        storm && remaining > 0 && (remaining > 0.23 || remaining < 0.12);
    this.bolt.visible = flashing;
    this.flash.intensity = flashing ? 120 : 0;
    if (flashing) {
      const points = [];
      for (let i = 0; i < 9; i++)
        points.push(
          new T.Vector3(
            3 + Math.sin(i * 7 + cycle) * 0.7,
            13 - i * 1.6,
            -3 + Math.cos(i * 4) * 0.4,
          ),
        );
      this.boltGeometry.setFromPoints(points);
    }
  }
  get stats() {
    return {
      type: this.type,
      rain: this.drops.visible && this.root.visible,
      drops: this.drops.visible && this.root.visible ? 420 : 0,
      vortex: this.funnel.visible && this.root.visible,
      lightning: this.bolt.visible && this.root.visible,
    };
  }
  dispose() {
    this.dropGeometry.dispose();
    this.dropMaterial.dispose();
    this.box.dispose();
    this.fogMaterial.dispose();
    this.boltGeometry.dispose();
    this.boltMaterial.dispose();
    this.funnel.dispose();
    this.clouds.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
