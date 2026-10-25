import { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Vec2 } from '../core/types';

interface LandingVisual {
  sprite: Sprite;
  age: number;
  shields: boolean;
  center: Vec2;
  diameter: number;
}
/** A fixed landing point: 1s impact, followed by 3s of shields. */
export class TankJumpVfx {
  private impact: SpriteManager;
  private shields: SpriteManager;
  private active = new Set<LandingVisual>();
  constructor(private scene: Scene) {
    const create = (name: string, file: string, columns: number, rows: number) => {
      // Both supplied atlases are 1254px square; fractional cells retain their full grids.
      const manager = new SpriteManager(
        name,
        `${import.meta.env.BASE_URL}vfx/tank-jump/${file}`,
        16,
        { width: 1254 / columns, height: 1254 / rows },
        scene,
        0.002,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      manager.texture.hasAlpha = true;
      manager.texture.wrapU = manager.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      manager.isPickable = false;
      return manager;
    };
    this.impact = create('titan-landing-impact', 'tank_jump_impact_explosion_atlas.png', 6, 5);
    this.shields = create('titan-landing-shields', 'tank_jump_shield_ring_loop_atlas.png', 5, 5);
  }
  private place(entry: LandingVisual) {
    entry.sprite.width = entry.diameter;
    entry.sprite.height = entry.diameter * (entry.shields ? 1 : 1.2);
    const up = this.scene.activeCamera?.getDirection(Vector3.Up()) ?? Vector3.Up();
    entry.sprite.position.set(entry.center.x, 0.08, entry.center.z);
    entry.sprite.position.addInPlace(up.scale(entry.sprite.height * 0.15));
  }
  play(center: Vec2, radius: number) {
    if (this.active.size >= 16) {
      const oldest = this.active.values().next().value!;
      oldest.sprite.dispose();
      this.active.delete(oldest);
    }
    const entry = {
      sprite: new Sprite('titan-impact', this.impact),
      age: 0,
      shields: false,
      center: { ...center },
      diameter: radius * 2.1,
    };
    this.place(entry);
    this.active.add(entry);
  }
  update(dt: number) {
    for (const entry of this.active) {
      entry.age += dt;
      if (entry.age >= 4) {
        entry.sprite.dispose();
        this.active.delete(entry);
        continue;
      }
      if (!entry.shields && entry.age >= 1) {
        entry.sprite.dispose();
        entry.sprite = new Sprite('titan-shield-ring', this.shields);
        entry.shields = true;
        this.place(entry);
      }
      entry.sprite.cellIndex = entry.shields
        ? Math.min(24, Math.floor(((entry.age - 1) * 25) / 3))
        : Math.min(29, Math.floor(entry.age * 30));
    }
  }
  clear() {
    for (const entry of this.active) entry.sprite.dispose();
    this.active.clear();
  }
  dispose() {
    this.clear();
    this.impact.dispose();
    this.shields.dispose();
  }
}
