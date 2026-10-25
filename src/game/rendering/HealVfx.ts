import { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Vec2 } from '../core/types';

/** User-supplied 6 × 6 RGBA atlas: 36 frames at 24 FPS, played once per heal. */
export class HealVfx {
  private manager: SpriteManager;
  private active = new Set<Sprite>();
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
    this.manager.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.manager.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.manager.isPickable = false;
  }
  play(position: Vec2) {
    if (this.active.size >= 20) {
      const oldest = this.active.values().next().value!;
      this.active.delete(oldest);
      oldest.dispose();
    }
    const sprite = new Sprite('priest-heal-burst', this.manager);
    // The atlas has transparent padding: visible artwork occupies 189/320 of a cell.
    // Match its visible height to 112% of the projected 2.15m hero, rather than
    // treating the entire transparent square as the visible effect.
    const up = this.scene.activeCamera?.getDirection(Vector3.Up()) ?? Vector3.Up();
    sprite.size = (2.15 * 1.12 * Math.max(0.45, Math.abs(up.y))) / (189 / 320);
    const floorOffset = sprite.size * (263 / 320 - 0.5);
    sprite.position.set(position.x, 0.06, position.z);
    sprite.position.addInPlace(up.scale(floorOffset));
    this.active.add(sprite);
    sprite.playAnimation(0, 35, false, 1000 / 24, () => {
      this.active.delete(sprite);
      sprite.dispose();
    });
  }
  clear() {
    for (const sprite of this.active) sprite.dispose();
    this.active.clear();
  }
  dispose() {
    this.clear();
    this.manager.dispose();
  }
}
