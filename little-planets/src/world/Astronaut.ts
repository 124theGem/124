import * as T from "three";
import { GEAR, type GearKind } from "../../shared/catalog";
import { Models } from "./Models";
export class Astronaut {
  readonly root = new T.Group();
  private body = new T.Group();
  private arms: T.Group[] = [];
  private legs: T.Group[] = [];
  private tool = new T.Group();
  mode: "idle" | "walk" | "plant" | "gather" | "tool" | "attack" = "idle";
  private animation = 0;
  private equipment = new T.Group();
  private armor = new T.Group();
  private equippedKey = "";
  private kit: Models;
  constructor(kit: Models) {
    this.kit = kit;
    const b = (
      p: T.Object3D,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: number,
    ) => kit.box(p, x, y, z, w, h, d, c);
    this.root.add(this.body);
    b(this.body, 0, 0.8, 0, 0.43, 0.46, 0.32, 0xeae5d7);
    b(this.body, 0, 0.83, 0.18, 0.29, 0.2, 0.04, 0xe3a051);
    b(this.body, -0.07, 0.86, 0.21, 0.07, 0.06, 0.03, 0x6ccbdc);
    b(this.body, 0, 1.26, 0, 0.65, 0.59, 0.58, 0xf2ebdd);
    b(this.body, 0, 1.27, 0.3, 0.53, 0.36, 0.08, 0x465563);
    b(this.body, 0, 1.29, 0.35, 0.43, 0.25, 0.035, 0x88d6e5);
    b(this.body, -0.13, 1.37, 0.37, 0.14, 0.04, 0.02, 0xb8eef4);
    b(this.body, 0, 0.83, -0.25, 0.36, 0.42, 0.22, 0xa6b6ba);
    b(this.body, 0, 0.81, -0.38, 0.23, 0.22, 0.04, 0xedac5b);
    for (const side of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(side * 0.32, 0.91, 0);
      b(arm, 0, -0.12, 0, 0.16, 0.34, 0.2, 0xeae5d7);
      b(arm, 0, -0.3, 0.02, 0.17, 0.14, 0.2, 0x60717b);
      b(arm, 0, -0.02, 0, 0.19, 0.1, 0.22, 0xe9ab63);
      this.body.add(arm);
      this.arms.push(arm);
      const leg = new T.Group();
      leg.position.set(side * 0.13, 0.59, 0);
      b(leg, 0, -0.15, 0, 0.18, 0.32, 0.21, 0xe4ddcd);
      b(leg, 0, -0.32, 0.06, 0.22, 0.16, 0.32, 0x6a767e);
      b(leg, 0, -0.2, 0.01, 0.19, 0.08, 0.22, 0xe6a961);
      this.root.add(leg);
      this.legs.push(leg);
    }
    b(this.tool, 0, -0.32, 0.18, 0.06, 0.55, 0.06, 0xa98555);
    b(this.tool, 0, -0.55, 0.18, 0.36, 0.09, 0.09, 0xa9c0c4);
    this.arms[1].add(this.tool, this.equipment);
    this.body.add(this.armor);
    this.tool.visible = false;
    for (const part of this.root.children) part.position.y -= 0.19;
    this.root.scale.setScalar(0.83);
  }
  equip(weapon: GearKind | null, armor: GearKind | null) {
    const key = `${weapon}|${armor}`;
    if (key === this.equippedKey) return;
    this.equippedKey = key;
    this.equipment.clear();
    this.armor.clear();
    if (weapon) {
      const object = this.kit.gear(weapon);
      object.scale.setScalar(0.55);
      object.position.set(0, -0.3, 0.15);
      object.rotation.x = Math.PI / 2;
      this.equipment.add(object);
    }
    if (armor) {
      const color = GEAR[armor].color;
      this.kit.box(this.armor, 0, 0.8, 0.015, 0.49, 0.5, 0.39, color);
      for (const side of [-1, 1])
        this.kit.box(this.armor, side * 0.32, 0.95, 0, 0.22, 0.19, 0.34, color);
      this.kit.box(
        this.armor,
        0,
        0.88,
        0.23,
        0.2,
        0.2,
        0.04,
        armor === "aegis" ? 0x99f4e7 : 0xdec38e,
        true,
      );
    }
  }
  update(time: number, dt: number, moving: boolean) {
    this.animation += dt;
    const work =
      this.mode === "plant" ||
      this.mode === "gather" ||
      this.mode === "tool" ||
      this.mode === "attack";
    const stride = moving ? Math.sin(time * 11) * 0.6 : 0;
    this.legs.forEach((leg, i) => (leg.rotation.x = stride * (i ? 1 : -1)));
    this.arms.forEach(
      (arm, i) =>
        (arm.rotation.x = work
          ? -0.8 + Math.sin(time * 13) * 0.35
          : stride * (i ? -1 : 1) * 0.8),
    );
    this.body.position.y =
      -0.19 +
      (work
        ? -0.12
        : Math.sin(time * (moving ? 22 : 2)) * (moving ? 0.025 : 0.012));
    this.body.rotation.x = work ? 0.22 : 0;
    this.tool.visible = this.mode === "tool";
  }
}
