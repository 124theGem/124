import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Entity } from '../core/types';
import { getClass } from '../classes/catalog';
import { AssetLibrary } from '../rendering/assets';
import { equipClassAccessories } from './equipment';
const aliases: Record<string, string> = {
  idle: 'Idle',
  run: 'Running_A',
  attack: '1H_Melee_Attack_Slice_Horizontal',
  skill1: '1H_Melee_Attack_Chop',
  skill2: 'Spellcast_Shoot',
  skill3: 'Spellcast_Long',
  ultimate: 'Spellcast_Raise',
  dodge: 'Dodge_Forward',
  hit: 'Hit_A',
  death: 'Death_A',
  victory: 'Cheer',
};
export class ActorView {
  root: TransformNode;
  private meshes: AbstractMesh[] = [];
  private groups: AnimationGroup[] = [];
  private active?: AnimationGroup;
  private fading?: AnimationGroup;
  private current = '';
  private serial = -1;
  private blend = 1;
  private ready = false;
  private disposed = false;
  private deadAt = 0;
  constructor(
    private scene: Scene,
    private library: AssetLibrary,
    public entity: Entity,
  ) {
    this.root = new TransformNode(entity.id, scene);
  }
  async load() {
    const e = this.entity,
      c = getClass(e.classId),
      model =
        e.kind === 'hero'
          ? c.model
          : e.kind === 'boss'
            ? 'Skeleton_Warrior'
            : e.classId === 'archer'
              ? 'Skeleton_Rogue'
              : e.classId === 'necromancer'
                ? 'Skeleton_Mage'
                : 'Skeleton_Minion';
    const container = await this.library.load(model);
    if (this.disposed) return;
    const instance = container.instantiateModelsToScene((n) => `${e.id}:${n}`, true);
    this.groups = instance.animationGroups;
    const modelRoot = new TransformNode(`${e.id}:model`, this.scene);
    modelRoot.parent = this.root;
    for (const r of instance.rootNodes) r.parent = modelRoot;
    this.meshes = modelRoot.getChildMeshes();
    for (const mesh of this.meshes) {
      const name = mesh.name.split(':').pop()!.toLowerCase();
      // Source packs contain several interchangeable weapons. Equip one coherent set.
      if (/shield/.test(name))
        mesh.setEnabled(['sword-shield', 'paladin'].includes(c.weapon) && /round|badge/.test(name));
      if (/sword|axe|dagger|knife|crossbow|staff|wand/.test(name) && !name.includes('body')) {
        const wants =
          c.weapon === 'axe'
            ? /2h.*axe|axe.*2h/
            : c.weapon === 'daggers'
              ? /knife|dagger/
              : ['swords', 'spear', 'bow', 'lute', 'totem'].includes(c.weapon)
                ? /^never-enable-source$/
                : c.weapon === 'crossbow'
                  ? /2h.*crossbow/
                  : ['staff', 'ice', 'holy', 'nature'].includes(c.weapon)
                    ? /staff/
                    : c.weapon === 'wand'
                      ? /wand/
                      : /1h.*sword|sword.*1h/;
        mesh.setEnabled(wants.test(name));
      }
      if (/spellbook_open|mug|throwable/.test(name)) mesh.setEnabled(false);
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      if (mesh.material instanceof PBRMaterial) {
        mesh.material.roughness = 0.78;
        mesh.material.metallic = 0.12;
        const tint = Color3.FromHexString(c.color);
        mesh.material.albedoColor = Color3.Lerp(
          Color3.White(),
          tint,
          e.kind === 'hero' ? 0.13 : 0.02,
        );
      }
    }
    const bounds = modelRoot.getHierarchyBoundingVectors(true);
    const height = bounds.max.y - bounds.min.y;
    if (e.kind === 'hero') equipClassAccessories(modelRoot, c, this.scene);
    this.meshes = modelRoot.getChildMeshes();
    const scale = (e.kind === 'boss' ? 4.3 : e.kind === 'summon' ? 1.65 : 2.15) / (height || 2);
    modelRoot.scaling.setAll(scale);
    modelRoot.position.y = -bounds.min.y * scale;
    for (const group of this.groups) {
      group.stop();
      for (const t of group.targetedAnimations) {
        t.animation.enableBlending = true;
        t.animation.blendingSpeed = 0.12;
      }
    }
    this.ready = true;
  }
  update(entity: Entity, dt: number, time: number, alpha: number) {
    this.entity = entity;
    const p = entity.position,
      prev = entity.previous;
    this.root.position.set(prev.x + (p.x - prev.x) * alpha, 0, prev.z + (p.z - prev.z) * alpha);
    const angle = entity.facing;
    const delta = Math.atan2(
      Math.sin(angle - this.root.rotation.y),
      Math.cos(angle - this.root.rotation.y),
    );
    this.root.rotation.y += delta * Math.min(1, dt * 16);
    if (!this.ready) return;
    const c = getClass(entity.classId);
    let animation = aliases[entity.animation] ?? 'Idle';
    if (entity.animation === 'attack')
      animation =
        c.range > 5
          ? c.model === 'Mage'
            ? 'Spellcast_Shoot'
            : '2H_Ranged_Shoot'
          : c.weapon === 'axe'
            ? '2H_Melee_Attack_Chop'
            : c.weapon === 'daggers' || c.weapon === 'swords'
              ? 'Dualwield_Melee_Attack_Slice'
              : aliases.attack;
    if (entity.animation.startsWith('skill') || entity.animation === 'ultimate') {
      const index = entity.animation === 'ultimate' ? 3 : Number(entity.animation.slice(-1)) - 1;
      animation = c.abilities[index]?.animation ?? animation;
    }
    if (
      animation !== this.current ||
      (['attack', 'skill1', 'skill2', 'skill3', 'ultimate', 'dodge', 'hit'].includes(
        entity.animation,
      ) &&
        this.serial !== entity.animationSerial)
    ) {
      const next =
        this.groups.find((g) => g.name.split(':').pop() === animation) ??
        this.groups.find((g) => g.name.split(':').pop() === 'Idle');
      if (next && next !== this.active) {
        this.fading?.stop();
        this.fading = this.active;
        this.active = next;
        this.blend = 0;
        next.start(
          ['idle', 'run', 'victory'].includes(entity.animation),
          entity.animation === 'run' ? entity.speed / 5 : 1,
        );
        next.setWeightForAllAnimatables(0);
      } else if (next && !['idle', 'run', 'death'].includes(entity.animation)) {
        next.restart();
      }
      this.current = animation;
      this.serial = entity.animationSerial;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * 7);
      this.active?.setWeightForAllAnimatables(this.blend);
      this.fading?.setWeightForAllAnimatables(1 - this.blend);
      if (this.blend === 1) {
        this.fading?.stop();
        this.fading = undefined;
      }
    }
    if (!entity.alive && !this.deadAt) this.deadAt = time;
    if (entity.alive) this.deadAt = 0;
    for (const mesh of this.meshes)
      mesh.visibility = entity.statuses.some((t) => t.kind === 'stealth')
        ? 0.28
        : this.deadAt
          ? Math.max(0, 1 - (time - this.deadAt - 2) * 0.8)
          : 1;
  }
  get meshList() {
    return this.meshes;
  }
  dispose() {
    this.disposed = true;
    for (const g of this.groups) g.dispose();
    const materials = new Set(this.meshes.map((m) => m.material));
    for (const skeleton of new Set(this.meshes.map((m) => m.skeleton))) skeleton?.dispose();
    this.root.dispose();
    for (const material of materials) material?.dispose(false, false);
  }
}
