import { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Entity, MatchState } from '../core/types';

/** One 36-frame healing burst per recipient, following that actor for its full life. */
export class HealVfx {
  private manager: SpriteManager;
  private active = new Map<Sprite, string>();
  constructor(private scene: Scene) {
    this.manager = new SpriteManager(
      'priest-healing',
      `${import.meta.env.BASE_URL}vfx/healing/heal_vfx_atlas_6x6.png`,
      20,
      { width: 320, height: 320 },
      scene,
      0.002,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    this.manager.texture.hasAlpha = true;
    this.manager.texture.wrapU = this.manager.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.manager.isPickable = false;
  }
  private place(sprite: Sprite, actor: Entity) {
    // Retain the requested fivefold size, accounting for padding and camera pitch.
    const up = this.scene.activeCamera?.getDirection(Vector3.Up()) ?? Vector3.Up();
    sprite.size = (5 * 2.15 * 1.12 * Math.max(0.45, Math.abs(up.y))) / (189 / 320);
    const offset = sprite.size * (263 / 320 - 0.5);
    const leap = actor.leap;
    const height = leap
      ? Math.sin((Math.PI * leap.elapsed) / leap.duration) *
        Math.min(
          7,
          3 +
            Math.hypot(leap.destination.x - leap.origin.x, leap.destination.z - leap.origin.z) *
              0.18,
        )
      : 0;
    sprite.position.set(actor.position.x, height + 0.06, actor.position.z);
    sprite.position.addInPlace(up.scale(offset));
  }
  play(actor: Entity) {
    for (const [sprite, id] of this.active)
      if (id === actor.id) {
        this.active.delete(sprite);
        sprite.dispose();
      }
    if (this.active.size >= 20) {
      const oldest = this.active.keys().next().value!;
      this.active.delete(oldest);
      oldest.dispose();
    }
    const sprite = new Sprite('priest-heal-burst', this.manager);
    this.place(sprite, actor);
    this.active.set(sprite, actor.id);
    sprite.playAnimation(0, 35, false, 1000 / 24, () => {
      this.active.delete(sprite);
      sprite.dispose();
    });
  }
  update(state: MatchState) {
    for (const [sprite, id] of this.active) {
      const actor = state.entities.find((e) => e.id === id && e.alive);
      if (actor) this.place(sprite, actor);
      else {
        this.active.delete(sprite);
        sprite.dispose();
      }
    }
  }
  clear() {
    for (const sprite of this.active.keys()) sprite.dispose();
    this.active.clear();
  }
  dispose() {
    this.clear();
    this.manager.dispose();
  }
}
