import { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Vec2 } from '../core/types';

/** User-supplied 6 × 6 RGBA atlas: 36 frames at 24 FPS, played once per heal. */
export class HealVfx {
  private manager: SpriteManager;
  private active = new Set<Sprite>();
  constructor(scene: Scene) {
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
    sprite.position.set(position.x, 1.05, position.z);
    sprite.size = 3.2;
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
