import { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { MatchState, Entity } from '../core/types';

/** User-supplied activation and looping aura, bound to the real self-buff. */
export class BerserkerVfx {
  private activation: SpriteManager;
  private loop: SpriteManager;
  private active = new Map<string, { sprite: Sprite }>();
  constructor(scene: Scene) {
    const create = (name: string, file: string) => {
      const manager = new SpriteManager(
        name,
        `${import.meta.env.BASE_URL}vfx/berserker/${file}`,
        16,
        { width: 320, height: 400 },
        scene,
        0.002,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      manager.texture.hasAlpha = true;
      manager.texture.wrapU = manager.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      manager.isPickable = false;
      return manager;
    };
    this.activation = create('berserker-rage-activation', 'berserker_activation_atlas.png');
    this.loop = create('berserker-rage-loop', 'berserker_aura_loop_atlas.png');
  }
  private place(sprite: Sprite, actor: Entity) {
    sprite.width = 2.5;
    sprite.height = 3.12;
    sprite.position.set(actor.position.x, 1.48, actor.position.z);
  }
  start(actorId: string, state: MatchState) {
    const actor = state.entities.find((e) => e.id === actorId && e.alive);
    if (!actor) return;
    this.stop(actorId);
    const sprite = new Sprite('berserker-rage-start', this.activation);
    this.place(sprite, actor);
    const entry = { sprite };
    this.active.set(actorId, entry);
    sprite.playAnimation(0, 47, false, 1000 / 30, () => {
      if (this.active.get(actorId) !== entry) return;
      sprite.dispose();
      entry.sprite = new Sprite('berserker-rage-aura', this.loop);
      this.place(entry.sprite, actor);
      entry.sprite.playAnimation(0, 23, true, 1000 / 30);
    });
  }
  update(state: MatchState) {
    for (const [id, entry] of this.active) {
      const actor = state.entities.find((e) => e.id === id && e.alive);
      const buff = actor?.statuses.some(
        (status) =>
          status.source === id &&
          (status.kind === 'power' || status.kind === 'haste') &&
          status.remaining > 0,
      );
      if (!actor || !buff) this.stop(id);
      else this.place(entry.sprite, actor);
    }
  }
  private stop(id: string) {
    const entry = this.active.get(id);
    this.active.delete(id);
    entry?.sprite.dispose();
  }
  clear() {
    for (const id of this.active.keys()) this.stop(id);
  }
  dispose() {
    this.clear();
    this.activation.dispose();
    this.loop.dispose();
  }
}
