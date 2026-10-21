import * as T from "three";
import type { Save } from "../../shared/model";
import { landingPad } from "../../shared/model";
import { STORY_METEOR, STORY_PLANTS } from "../../shared/prologue";
import { spherePoint, sphereUp } from "./SphereWorld";

/** Local effects follow the cube surface, rather than the camera or player. */
export class PrologueEffects {
  readonly root = new T.Group();
  private smoke = new T.Group();
  readonly targets = new T.Group();
  private cube = new T.BoxGeometry(1, 1, 1);
  private outline = new T.EdgesGeometry(new T.BoxGeometry(1.3, 0.08, 1.3));
  private glow = new T.LineBasicMaterial({
    color: 0x9cffe4,
    transparent: true,
    depthTest: false,
    toneMapped: false,
  });
  private beacon = new T.MeshBasicMaterial({
    color: 0x9cffe4,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private smokeMaterials: T.MeshBasicMaterial[] = [];
  private signature = "";
  constructor() {
    this.root.add(this.smoke, this.targets);
    for (let i = 0; i < 18; i++) {
      const material = new T.MeshBasicMaterial({
        color: i % 3 ? 0x67747b : 0x343f4b,
        transparent: true,
        depthWrite: false,
      });
      this.smokeMaterials.push(material);
      this.smoke.add(new T.Mesh(this.cube, material));
    }
  }
  update(save: Save) {
    this.root.visible =
      save.planet === "home" && save.prologue.phase !== "complete";
    if (!this.root.visible) return;
    const q = save.prologue,
      pad = landingPad(save, "home");
    this.smoke.visible = ["arrival", "plants", "meteor", "repair"].includes(
      q.phase,
    );
    this.smoke.position.copy(spherePoint(pad, 0.7));
    this.smoke.quaternion.setFromUnitVectors(
      T.Object3D.DEFAULT_UP,
      sphereUp(pad),
    );
    const signature = JSON.stringify([q, pad]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.targets.clear();
    const points =
      q.phase === "plants"
        ? STORY_PLANTS.filter((_, i) => !q.plants.includes(i))
        : q.phase === "meteor"
          ? [STORY_METEOR]
          : ["repair", "launch"].includes(q.phase)
            ? [pad]
            : [];
    points.forEach((point, index) => {
      const target = new T.Group();
      target.position.copy(spherePoint(point, 0.12));
      target.quaternion.setFromUnitVectors(
        T.Object3D.DEFAULT_UP,
        sphereUp(point),
      );
      const ring = new T.LineSegments(this.outline, this.glow);
      ring.renderOrder = 10;
      target.add(ring);
      const beam = new T.Mesh(this.cube, this.beacon);
      beam.scale.set(0.055, 1.5, 0.055);
      beam.position.y = 1.6;
      beam.renderOrder = 10;
      target.add(beam);
      // A downward chevron floats above the next real interaction target.
      for (const side of [-1, 1]) {
        const arrow = new T.Mesh(this.cube, this.beacon);
        arrow.scale.set(0.36, 0.07, 0.07);
        arrow.position.set(side * 0.12, 2.65, 0);
        arrow.rotation.z = (side * Math.PI) / 4;
        arrow.renderOrder = 10;
        target.add(arrow);
      }
      target.userData.phase = index * 1.4;
      target.userData.storyIndex =
        q.phase === "plants"
          ? STORY_PLANTS.indexOf(point as (typeof STORY_PLANTS)[number])
          : q.phase === "meteor"
            ? 3
            : 4;
      this.targets.add(target);
    });
  }
  animate(time: number) {
    this.smoke.children.forEach((puff, i) => {
      const life = (((time * 0.23 + i / 18) % 1) + 1) % 1;
      puff.position.set(
        -0.5 + Math.sin(i * 2.4 + life * 3) * (0.12 + life * 0.5),
        0.5 + life * 4.8,
        -1 + life * 0.8,
      );
      puff.scale.setScalar(0.25 + life * 1.1);
      puff.rotation.set(life + i, life * 1.3, i * 0.3);
      this.smokeMaterials[i].opacity = Math.sin(life * Math.PI) * 0.42;
    });
    const pulse = (Math.sin(time * 3.4) + 1) / 2;
    this.glow.opacity = 0.55 + pulse * 0.45;
    for (const target of this.targets.children) {
      target.children[0].scale.setScalar(1 + pulse * 0.12);
      target.children.slice(2).forEach((arrow) => {
        arrow.position.y =
          2.65 + Math.sin(time * 3 + target.userData.phase) * 0.15;
      });
    }
  }
  get stats() {
    return {
      smoke:
        this.root.visible && this.smoke.visible
          ? this.smoke.children.length
          : 0,
      targets: this.root.visible ? this.targets.children.length : 0,
    };
  }
  dispose() {
    this.cube.dispose();
    this.outline.dispose();
    this.glow.dispose();
    this.beacon.dispose();
    this.smokeMaterials.forEach((m) => m.dispose());
    this.root.removeFromParent();
    this.root.clear();
  }
}
