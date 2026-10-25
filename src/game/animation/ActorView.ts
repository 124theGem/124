import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Rendering/outlineRenderer';
import { combatDuration } from '../core/tempo';
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
  private teamMaterial?: StandardMaterial;
  constructor(
    private scene: Scene,
    private library: AssetLibrary,
    public entity: Entity,
  ) {
    this.root = new TransformNode(entity.id, scene);
    this.root.position.set(entity.position.x, 0, entity.position.z);
    this.root.rotation.y = entity.facing;
  }
  async load() {
    if (this.entity.seeker) {
      this.buildSeeker();
      return;
    }
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
        mesh.setEnabled(
          ['sword-shield', 'paladin'].includes(c.weapon) &&
            name === (c.weapon === 'paladin' ? 'badge_shield' : 'round_shield'),
        );
      if (/sword|axe|dagger|knife|crossbow|staff|wand/.test(name) && !name.includes('body')) {
        const wants =
          c.weapon === 'axe'
            ? /2h.*axe|axe.*2h/
            : c.weapon === 'daggers'
              ? /knife|dagger/
              : ['swords', 'spear', 'bow', 'lute', 'totem', 'bombs'].includes(c.weapon)
                ? /^never-enable-source$/
                : c.weapon === 'crossbow'
                  ? /2h.*crossbow/
                  : ['staff', 'ice', 'holy', 'nature'].includes(c.weapon)
                    ? /staff/
                    : c.weapon === 'wand'
                      ? /wand/
                      : /1h.*sword|sword.*1h/;
        mesh.setEnabled(wants.test(name) && (c.weapon === 'daggers' || !name.endsWith('_offhand')));
      }
      if (/spellbook_open|mug|throwable/.test(name)) mesh.setEnabled(false);
      mesh.receiveShadows = false;
      mesh.isPickable = false;
      if (mesh.material instanceof PBRMaterial) {
        mesh.material.roughness = 1;
        mesh.material.metallic = 0;
        const tint = Color3.FromHexString(c.color);
        mesh.material.albedoColor = Color3.Lerp(
          Color3.White(),
          tint,
          e.kind === 'hero' ? 0.08 : 0.02,
        );
        if (e.kind === 'hero' && /cape|mage_hat|barbarian_hat/.test(name)) {
          const cloth = new PBRMaterial(`${e.id}-class-cloth`, this.scene);
          cloth.albedoColor = Color3.FromHexString(c.color).toLinearSpace();
          cloth.roughness = 1;
          cloth.metallic = 0;
          mesh.material = cloth;
        }
      }
    }
    const bounds = modelRoot.getHierarchyBoundingVectors(true);
    const height = bounds.max.y - bounds.min.y;
    if (e.kind === 'hero') equipClassAccessories(modelRoot, c, this.scene);
    this.meshes = modelRoot.getChildMeshes();
    for (const mesh of this.meshes) {
      mesh.renderOutline =
        !mesh.skeleton &&
        /helmet|sword|shield|axe|crossbow|spear|bow|wand|staff|totem/i.test(mesh.name);
      mesh.outlineColor = Color3.FromHexString('#172540');
      mesh.outlineWidth = 0.014;
    }
    const scale = (e.kind === 'boss' ? 4.3 : e.kind === 'summon' ? 1.65 : 2.15) / (height || 2);
    modelRoot.scaling.setAll(scale);
    modelRoot.position.y = -bounds.min.y * scale;
    const circle = MeshBuilder.CreateDisc(
      'team-marker',
      { radius: e.kind === 'boss' ? 1.35 : 0.66, tessellation: 32 },
      this.scene,
    );
    circle.parent = this.root;
    circle.rotation.x = Math.PI / 2;
    circle.position.y = 0.075;
    this.teamMaterial = new StandardMaterial(`${e.id}-team-color`, this.scene);
    this.teamMaterial.diffuseColor = Color3.FromHexString(
      e.team === 'A' ? '#20aaff' : e.team === 'B' ? '#ff4768' : '#8b49dc',
    );
    this.teamMaterial.emissiveColor = this.teamMaterial.diffuseColor.scale(0.6);
    this.teamMaterial.alpha = 0.55;
    this.teamMaterial.disableLighting = true;
    circle.material = this.teamMaterial;
    circle.isPickable = false;
    for (const group of this.groups) {
      group.stop();
      for (const t of group.targetedAnimations) {
        t.animation.enableBlending = false;
        t.animation.blendingSpeed = 0.12;
      }
    }
    this.ready = true;
  }
  private buildSeeker() {
    const shell = new StandardMaterial('seeker-iron', this.scene);
    shell.diffuseColor = Color3.FromHexString('#334354');
    shell.specularColor = Color3.FromHexString('#b1c4c9');
    const brass = new StandardMaterial('seeker-bronze', this.scene);
    brass.diffuseColor = Color3.FromHexString('#d3b06a');
    const glow = new StandardMaterial('seeker-eyes', this.scene);
    glow.emissiveColor = Color3.FromHexString('#ff9f4c');
    glow.disableLighting = true;
    const body = MeshBuilder.CreateSphere(
      'seeking-charge-body',
      { diameter: 1.2, segments: 12 },
      this.scene,
    );
    body.parent = this.root;
    body.position.y = 0.9;
    body.material = shell;
    const band = MeshBuilder.CreateTorus(
      'seeker-bronze-band',
      { diameter: 1.18, thickness: 0.09, tessellation: 20 },
      this.scene,
    );
    band.parent = this.root;
    band.position.y = 0.9;
    band.material = brass;
    for (const side of [-1, 1]) {
      const eye = MeshBuilder.CreateBox(
        'seeker-eye',
        { width: 0.19, height: 0.15, depth: 0.09 },
        this.scene,
      );
      eye.parent = this.root;
      eye.position.set(side * 0.22, 1.02, 0.53);
      eye.material = glow;
      const wheel = MeshBuilder.CreateSphere(
        'seeker-wheel',
        { diameter: 0.45, segments: 8 },
        this.scene,
      );
      wheel.parent = this.root;
      wheel.position.set(side * 0.48, 0.24, 0);
      wheel.scaling.x = 0.5;
      wheel.material = brass;
    }
    const fuse = MeshBuilder.CreateCylinder(
      'seeker-fuse',
      { height: 0.32, diameter: 0.12, tessellation: 8 },
      this.scene,
    );
    fuse.parent = this.root;
    fuse.position.y = 1.6;
    fuse.material = glow;
    const teamMat = new StandardMaterial('seeker-team-marker', this.scene);
    teamMat.emissiveColor = Color3.FromHexString(this.entity.team === 'A' ? '#42c8f5' : '#ff637e');
    teamMat.alpha = 0.6;
    const marker = MeshBuilder.CreateDisc(
      'seeker-team-disc',
      { radius: 0.66, tessellation: 20 },
      this.scene,
    );
    marker.parent = this.root;
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.035;
    marker.material = teamMat;
    this.meshes = this.root.getChildMeshes();
    for (const m of this.meshes) m.isPickable = false;
    this.ready = true;
  }
  update(entity: Entity, dt: number, time: number, alpha: number) {
    this.entity = entity;
    if (!entity.alive && !this.deadAt) this.deadAt = time;
    if (entity.alive) this.deadAt = 0;
    const p = entity.position,
      prev = entity.previous;
    const leap = entity.leap,
      progress = leap ? Math.max(0, (leap.elapsed - (1 - alpha) / 30) / leap.duration) : 0;
    const height = leap
      ? Math.sin(Math.PI * progress) *
        Math.min(
          7,
          3 +
            Math.hypot(leap.destination.x - leap.origin.x, leap.destination.z - leap.origin.z) *
              0.18,
        )
      : 0;
    this.root.position.set(
      prev.x + (p.x - prev.x) * alpha,
      height,
      prev.z + (p.z - prev.z) * alpha,
    );
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
    if (entity.animation === 'attack' && c.weapon === 'bombs') animation = 'Spellcast_Shoot';
    if (entity.animation.startsWith('skill') || entity.animation === 'ultimate') {
      const index =
        entity.animation === 'ultimate'
          ? c.abilities.findIndex((a) => a.ultimate)
          : Number(entity.animation.slice(-1)) - 1;
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
      if (next) {
        if (next !== this.active) {
          this.fading?.stop();
          this.fading = this.active;
        } else {
          // restart() only resumes a paused group; it cannot replay an ended clip.
          next.stop();
          this.fading = undefined;
        }
        this.active = next;
        const looping = ['idle', 'run', 'victory'].includes(entity.animation);
        const fps = next.targetedAnimations[0]?.animation.framePerSecond || 60;
        const nativeDuration = (next.to - next.from) / fps;
        const visualDuration =
          entity.leap?.duration ??
          (entity.animation === 'ultimate'
            ? combatDuration(1.55)
            : entity.animation.startsWith('skill')
              ? combatDuration(1.0)
              : entity.animation === 'attack'
                ? Math.min(combatDuration(0.74), entity.interval * 0.96)
                : 0.4);
        const speed = looping
          ? entity.animation === 'run'
            ? entity.speed / 5
            : 1
          : Math.max(0.2, nativeDuration / visualDuration);
        this.blend = this.fading ? 0 : 1;
        next.start(looping, speed);
        next.setWeightForAllAnimatables(this.blend);
      }
      this.current = animation;
      this.serial = entity.animationSerial;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * 10);
      this.active?.setWeightForAllAnimatables(this.blend);
      this.fading?.setWeightForAllAnimatables(1 - this.blend);
      if (this.blend === 1) {
        this.fading?.stop();
        this.fading = undefined;
      }
    }
    for (const mesh of this.meshes)
      mesh.visibility = entity.statuses.some((t) => t.kind === 'stealth')
        ? 0.28
        : this.deadAt
          ? Math.max(0, 1 - (time - this.deadAt - 2) * 0.8)
          : 1;
  }
  isFaded(time: number) {
    return this.deadAt > 0 && time - this.deadAt > 3.5;
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
    this.teamMaterial?.dispose();
    for (const material of materials) material?.dispose(false, false);
  }
}
