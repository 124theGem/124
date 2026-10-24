import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { aimSpec, clippedAim } from '../controls/aim';
import { add, direction, distance } from '../core/math';
import type { Entity, MatchState, Vec2 } from '../core/types';

/** Persistent meshes: dragging never creates geometry or compiles new materials. */
export class AimView {
  private root: TransformNode;
  private path;
  private head;
  private area;
  private mat;
  constructor(scene: Scene) {
    this.root = new TransformNode('aim-guide', scene);
    this.mat = new StandardMaterial('aim-white-yellow', scene);
    this.mat.disableLighting = true;
    this.mat.emissiveColor = Color3.White();
    this.mat.alpha = 0.65;
    this.path = MeshBuilder.CreateBox(
      'aim-trajectory',
      { width: 1, height: 0.025, depth: 1 },
      scene,
    );
    this.head = MeshBuilder.CreateCylinder(
      'aim-arrowhead',
      { diameter: 0.9, height: 0.025, tessellation: 3 },
      scene,
    );
    this.area = MeshBuilder.CreateDisc('aim-impact-area', { radius: 1, tessellation: 48 }, scene);
    this.area.rotation.x = Math.PI / 2;
    for (const mesh of [this.path, this.head, this.area]) {
      mesh.parent = this.root;
      mesh.material = this.mat;
      mesh.isPickable = false;
    }
    this.root.setEnabled(false);
  }
  update(preview: { index: number; aim?: Vec2 } | undefined, hero: Entity, state: MatchState) {
    const spec = preview ? aimSpec(hero, preview.index) : undefined;
    const visible = !!preview && hero.alive && (spec?.shape === 'self' || !!preview.aim);
    this.root.setEnabled(visible);
    if (!visible || !preview || !spec) return;
    const dir = preview.aim
      ? direction(hero.position, preview.aim)
      : { x: Math.sin(hero.facing), z: Math.cos(hero.facing) };
    const range =
      spec.shape === 'area' && preview.aim
        ? Math.min(spec.range, distance(hero.position, preview.aim))
        : spec.range;
    const requested = add(hero.position, dir, range);
    const end = spec.lob ? requested : clippedAim(hero.position, requested, state.map);
    const length = distance(hero.position, end),
      angle = Math.atan2(dir.x, dir.z);
    this.mat.emissiveColor = Color3.FromHexString(preview.index === 3 ? '#ffdc43' : '#efffff');
    if (spec.shape === 'wall') {
      this.path.setEnabled(true);
      this.head.setEnabled(false);
      this.area.setEnabled(false);
      this.path.position.set(end.x, 0.18, end.z);
      this.path.scaling.set(spec.radius * 2, 1, 0.2);
      this.path.rotation.y = angle;
      return;
    }
    this.path.setEnabled(spec.shape !== 'self');
    this.path.position.set((hero.position.x + end.x) / 2, 0.18, (hero.position.z + end.z) / 2);
    this.path.scaling.set(
      spec.shape === 'line' ? Math.max(0.18, spec.radius * 2) : 0.12,
      1,
      Math.max(0.01, length),
    );
    this.path.rotation.y = angle;
    this.head.setEnabled(spec.shape === 'line');
    this.head.position.set(end.x, 0.2, end.z);
    this.head.rotation.y = angle;
    this.area.setEnabled(spec.shape !== 'line');
    this.area.position.set(
      spec.shape === 'self' ? hero.position.x : end.x,
      0.16,
      spec.shape === 'self' ? hero.position.z : end.z,
    );
    this.area.scaling.set(spec.radius, spec.radius, 1);
  }
  dispose() {
    this.root.dispose();
    this.mat.dispose();
  }
}
