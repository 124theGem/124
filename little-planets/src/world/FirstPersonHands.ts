import * as T from "three";
import { Models } from "./Models";
import type { Save } from "../../shared/model";
export class FirstPersonHands {
  readonly root = new T.Group();
  private key = "";
  private strikeAt = -10;
  strike() {
    this.strikeAt = performance.now() / 1000;
  }
  constructor(private kit: Models) {}
  update(hand: Save["hand"], camera: T.Camera, time: number, moving: boolean) {
    if (hand !== this.key) {
      this.key = hand;
      this.root.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      this.root.clear();
      for (const side of [-1, 1]) {
        this.kit.box(
          this.root,
          side * 0.23,
          -0.23,
          -0.43,
          0.12,
          0.13,
          0.3,
          0xe4dfcf,
        );
        this.kit.box(
          this.root,
          side * 0.23,
          -0.2,
          -0.58,
          0.13,
          0.12,
          0.14,
          0x63817f,
        );
      }
      if (hand === "pickaxe") {
        this.kit.box(this.root, 0.24, -0.05, -0.68, 0.04, 0.6, 0.04, 0xa4895d);
        this.kit.box(this.root, 0.24, 0.22, -0.68, 0.5, 0.06, 0.08, 0xc0cdcb);
      } else if (hand === "grapple") {
        this.kit.box(this.root, 0.2, -0.14, -0.68, 0.16, 0.16, 0.4, 0x8daba3);
        this.kit.box(this.root, 0.2, -0.09, -0.91, 0.27, 0.05, 0.2, 0xdfc79a);
      } else if (hand !== "none") {
        const gear = this.kit.gear(hand);
        gear.scale.setScalar(0.4);
        gear.position.set(0.22, -0.15, -0.68);
        gear.rotation.x = Math.PI / 2;
        this.root.add(gear);
      }
    }
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);
    this.root.translateY(moving ? Math.sin(time * 10) * 0.008 : 0);
    const t = (time - this.strikeAt) / 0.32;
    if (t >= 0 && t < 1) {
      const swing = Math.sin(t * Math.PI);
      this.root.rotateX(-swing * 0.65);
      this.root.rotateZ(-swing * 0.28);
      this.root.translateZ(-swing * 0.09);
    }
  }
  dispose() {
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.root.clear();
    this.root.removeFromParent();
  }
}
