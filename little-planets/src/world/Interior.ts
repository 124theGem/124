import * as T from "three";
import { Models } from "./Models";
import { ROOM, FURNITURE } from "../../shared/catalog";
import { roomItems, furnitureSize, type Save } from "../../shared/model";
export class Interior {
  readonly root = new T.Group();
  private fixtures = new T.Group();
  private furniture = new T.Group();
  private fires: T.Group[] = [];
  constructor(
    private kit: Models,
    save: Save,
  ) {
    this.root.add(this.fixtures, this.furniture);
    for (let x = 0; x < ROOM.width; x++)
      for (let z = 0; z < ROOM.depth; z++)
        kit.box(
          this.fixtures,
          x,
          -0.12,
          z,
          0.98,
          0.24,
          0.98,
          (x + z) % 2 ? 0xba9369 : 0xc49e75,
        );
    for (let x = 0; x < ROOM.width; x++)
      for (let y = 0; y < 5; y++)
        kit.box(
          this.fixtures,
          x,
          0.3 + y * 0.55,
          -0.45,
          0.98,
          0.5,
          0.2,
          y === 0 ? 0x7d6655 : 0xdfcdb0,
        );
    for (let z = 0; z < ROOM.depth; z++)
      for (let y = 0; y < 5; y++)
        kit.box(
          this.fixtures,
          -0.45,
          0.3 + y * 0.55,
          z,
          0.2,
          0.5,
          0.98,
          y === 0 ? 0x7d6655 : 0xd7c4a8,
        );
    for (const x of [2, 8]) {
      kit.box(this.fixtures, x, 1.6, -0.31, 1.8, 1.25, 0.08, 0x8f775e);
      kit.box(this.fixtures, x, 1.6, -0.24, 1.55, 1, 0.05, 0xa3d5dd, true);
      kit.box(this.fixtures, x, 1.6, -0.19, 0.07, 1.05, 0.05, 0xe8ddc5);
      kit.box(this.fixtures, x, 1.6, -0.19, 1.58, 0.07, 0.05, 0xe8ddc5);
      kit.box(this.fixtures, x, 1, -0.1, 2, 0.1, 0.4, 0xa98c69);
    }
    // Cutaway front/right walls keep the room and the real exit visible at every camera angle.
    for (let x = 0; x < ROOM.width; x++)
      if (Math.abs(x - ROOM.door.x) > 1)
        kit.box(
          this.fixtures,
          x,
          0.22,
          ROOM.depth - 0.5,
          0.98,
          0.45,
          0.18,
          0xaa8a67,
        );
    for (let z = 0; z < ROOM.depth; z++)
      kit.box(
        this.fixtures,
        ROOM.width - 0.5,
        0.22,
        z,
        0.18,
        0.45,
        0.98,
        0xaa8a67,
      );
    kit.box(
      this.fixtures,
      ROOM.door.x,
      0.05,
      ROOM.door.z,
      1.7,
      0.08,
      0.7,
      0x8db8a2,
    );
    for (const x of [-1, 1])
      kit.box(
        this.fixtures,
        ROOM.door.x + x,
        1,
        ROOM.depth - 0.45,
        0.14,
        2,
        0.14,
        0xb9a382,
      );
    kit.box(
      this.fixtures,
      ROOM.door.x,
      2.02,
      ROOM.depth - 0.45,
      2.2,
      0.18,
      0.17,
      0xd6bf99,
    );
    kit.batch(this.fixtures);
    this.rebuild(save);
  }
  rebuild(save: Save) {
    this.furniture.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.furniture.clear();
    for (const fire of this.fires) fire.removeFromParent();
    this.fires = [];
    for (const f of roomItems(save)) {
      const s = furnitureSize(f.kind, f.rotation),
        object = this.kit.furniture(f.kind);
      object.position.set(f.x + (s.w - 1) / 2, 0, f.z + (s.d - 1) / 2);
      object.rotation.y = (f.rotation * Math.PI) / 2;
      this.furniture.add(object);
      if (f.kind === "fireplace") {
        const glow = new T.Group();
        this.kit.box(glow, 0, 0.6, 0.62, 0.6, 0.3, 0.06, 0xffb45f, true);
        glow.position.copy(object.position);
        glow.rotation.y = object.rotation.y;
        this.root.add(glow);
        this.fires.push(glow);
      }
    }
    this.kit.batch(this.furniture);
  }
  animate(time: number) {
    for (const fire of this.fires) {
      fire.scale.y = 0.9 + Math.sin(time * 9) * 0.1;
    }
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.root.clear();
  }
}
