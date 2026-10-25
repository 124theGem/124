import { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import atlasFrames from './tankJumpFrames.json';
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
      // Packed rectangles account for the nonuniform rows and shifted artwork in the supplied files.
      const manager = new SpriteManager(
        name,
        `${import.meta.env.BASE_URL}vfx/tank-jump/${file}`,
        16,
        { width: 1254 / columns, height: 1254 / rows },
        scene,
        0.002,
        Texture.BILINEAR_SAMPLINGMODE,
        true,
        {
          frames: Object.fromEntries(
            (columns === 6 ? atlasFrames.impact : atlasFrames.shields).map((rect, index) => [
              String(index),
              { frame: rect },
            ]),
          ),
        },
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
    const camera = this.scene.activeCamera;
    const up = camera?.getDirection(Vector3.Up()) ?? Vector3.Up();
    const center = new Vector3(entry.center.x, 0.08, entry.center.z);
    const frameIndex = entry.shields
      ? Math.min(24, Math.floor(((entry.age - 1) * 25) / 3))
      : Math.min(29, Math.floor(entry.age * 30));
    const rect = (entry.shields ? atlasFrames.shields : atlasFrames.impact)[frameIndex];
    entry.sprite.cellRef = String(frameIndex);
    const cellWidth = 1254 / (entry.shields ? 5 : 6),
      cellHeight = 1254 / 5;
    const baseHeight = entry.diameter * (entry.shields ? 1 : 1.2);
    const width = (entry.diameter * rect.w) / cellWidth,
      height = (baseHeight * rect.h) / cellHeight;
    const offsetX = (entry.diameter * (rect.x + rect.w / 2 - rect.anchorX)) / cellWidth;
    const offsetY = (baseHeight * (rect.anchorY - rect.y - rect.h / 2)) / cellHeight;
    const right = camera?.getDirection(Vector3.Right()) ?? Vector3.Right();
    let fit = 1;
    if (camera) {
      const engine = this.scene.getEngine();
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      const transform = camera.getViewMatrix().multiply(camera.getProjectionMatrix());
      const project = (p: Vector3) =>
        Vector3.Project(p, Matrix.IdentityReadOnly, transform, viewport);
      const anchor = project(center);
      const above = project(center.add(up));
      const beside = project(center.add(camera.getDirection(Vector3.Right())));
      const pixelsUp = Math.max(0.001, Math.hypot(above.x - anchor.x, above.y - anchor.y));
      const pixelsRight = Math.max(0.001, Math.hypot(beside.x - anchor.x, beside.y - anchor.y));
      const marginX = viewport.width * 0.035,
        marginY = viewport.height * 0.08;
      const roomLeft = anchor.x - viewport.x - marginX;
      const roomRight = viewport.x + viewport.width - marginX - anchor.x;
      const roomTop = anchor.y - viewport.y - marginY;
      const roomBottom = viewport.y + viewport.height - marginY - anchor.y;
      fit = Math.max(
        0,
        Math.min(
          1,
          roomLeft / ((width / 2 - offsetX) * pixelsRight),
          roomRight / ((width / 2 + offsetX) * pixelsRight),
          roomTop / ((height / 2 + offsetY) * pixelsUp),
          roomBottom / ((height / 2 - offsetY) * pixelsUp),
          (viewport.height * 0.66) / (height * pixelsUp),
        ),
      );
    }
    entry.sprite.isVisible = fit > 0;
    entry.sprite.width = width * fit;
    entry.sprite.height = height * fit;
    entry.sprite.position.copyFrom(center);
    entry.sprite.position.addInPlace(right.scale(offsetX * fit));
    entry.sprite.position.addInPlace(up.scale(offsetY * fit));
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
      }
      this.place(entry);
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
