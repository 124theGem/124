import { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Vec2 } from '../core/types';

type Phase = 'intro' | 'loop' | 'outro';
interface Beam {
  center: Vec2;
  age: number;
  hd: boolean;
  phase: Phase;
  sprite: Sprite;
}

/** Uploaded three-phase beam; simulation alone owns the taunt and its duration. */
export class ArcaneBeamVfx {
  private managers = new Map<string, SpriteManager>();
  private active = new Set<Beam>();
  constructor(private scene: Scene) {
    for (const phase of ['intro', 'loop', 'outro'] as const) this.manager(phase, false);
  }
  private manager(phase: Phase, hd: boolean) {
    const key = `${phase}-${hd}`;
    let manager = this.managers.get(key);
    if (!manager) {
      const px = hd ? 768 : 512;
      manager = new SpriteManager(
        `tank-arcane-${key}`,
        `${import.meta.env.BASE_URL}vfx/arcane-beam/${hd ? 'hd' : 'optimized'}/arcane_${phase}_${px}px.png`,
        16,
        { width: px, height: px },
        this.scene,
        0.002,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      manager.texture.hasAlpha = true;
      manager.texture.wrapU = manager.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      manager.isPickable = false;
      this.managers.set(key, manager);
    }
    return manager;
  }
  private place(beam: Beam) {
    // Anchor the painted impact (74% down the frame) to the actual cast point.
    const up = this.scene.activeCamera?.getDirection(Vector3.Up()) ?? Vector3.Up();
    beam.sprite.size = 6;
    beam.sprite.position.set(beam.center.x, 0.06, beam.center.z);
    beam.sprite.position.addInPlace(up.scale((0.74 - 0.5) * beam.sprite.size));
  }
  play(center: Vec2, hd = false) {
    if (this.active.size >= 16) this.remove(this.active.values().next().value!);
    const sprite = new Sprite('tank-arcane-beam', this.manager('intro', hd));
    sprite.isPickable = false;
    sprite.cellIndex = 0;
    const beam: Beam = { center: { ...center }, age: 0, hd, phase: 'intro', sprite };
    this.place(beam);
    this.active.add(beam);
  }
  update(dt: number) {
    for (const beam of this.active) {
      beam.age += dt;
      const frame = Math.floor(beam.age * 24);
      if (frame >= 76) {
        this.remove(beam);
        continue;
      }
      const phase: Phase = frame < 12 ? 'intro' : frame < 68 ? 'loop' : 'outro';
      if (phase !== beam.phase) {
        beam.sprite.dispose();
        beam.sprite = new Sprite('tank-arcane-beam', this.manager(phase, beam.hd));
        beam.sprite.isPickable = false;
        beam.phase = phase;
      }
      beam.sprite.cellIndex =
        phase === 'intro' ? frame : phase === 'loop' ? (frame - 12) % 16 : frame - 68;
      this.place(beam);
    }
  }
  private remove(beam: Beam) {
    this.active.delete(beam);
    beam.sprite.dispose();
  }
  clear() {
    for (const beam of this.active) this.remove(beam);
  }
  dispose() {
    this.clear();
    for (const manager of this.managers.values()) manager.dispose();
    this.managers.clear();
  }
}
