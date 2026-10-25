import { Scene } from '@babylonjs/core/scene';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { getClass } from '../classes/catalog';
import { aimSpec, clippedAim } from '../controls/aim';
import { add, direction, distance } from '../core/math';
import type { Entity, MatchState, Vec2 } from '../core/types';

/** Reuses geometry while dragging, including a sector clipped along each ray. */
export class AimView {
  private root: TransformNode;
  private path;
  private area;
  private rim;
  private sector: Mesh;
  private edge: LinesMesh;
  private mat;
  private points = Array.from({ length: 35 }, () => new Vector3());
  private positions = new Float32Array(34 * 3);
  constructor(private scene: Scene) {
    this.root = new TransformNode('aim-guide', scene);
    this.mat = new StandardMaterial('aim-footprint', scene);
    this.mat.disableLighting = true;
    this.mat.emissiveColor = Color3.White();
    this.mat.alpha = 0.23;
    this.mat.backFaceCulling = false;
    this.path = MeshBuilder.CreateBox(
      'aim-trajectory',
      { width: 1, height: 0.025, depth: 1 },
      scene,
    );
    this.area = MeshBuilder.CreateDisc('aim-impact-area', { radius: 1, tessellation: 64 }, scene);
    this.area.rotation.x = Math.PI / 2;
    this.rim = MeshBuilder.CreateTorus(
      'aim-area-border',
      { diameter: 2, thickness: 0.025, tessellation: 64 },
      scene,
    );
    this.sector = new Mesh('aim-sector', scene);
    const data = new VertexData();
    data.positions = Array.from(this.positions);
    data.indices = Array.from({ length: 32 }, (_, i) => [0, i + 1, i + 2]).flat();
    data.applyToMesh(this.sector, true);
    this.edge = MeshBuilder.CreateLines(
      'aim-sector-border',
      { points: this.points, updatable: true },
      scene,
    );
    for (const mesh of [this.path, this.area, this.rim, this.sector, this.edge]) {
      mesh.parent = this.root;
      if (mesh !== this.edge) mesh.material = this.mat;
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
    const angle = Math.atan2(dir.x, dir.z);
    const range =
      spec.shape === 'area' && preview.aim
        ? Math.min(spec.range, distance(hero.position, preview.aim))
        : spec.range;
    const requested = add(hero.position, dir, range);
    const end = spec.lob ? requested : clippedAim(hero.position, requested, state.map);
    const length = distance(hero.position, end);
    const color = Color3.FromHexString(
      getClass(hero.classId).abilities[preview.index]?.ultimate ? '#ffdc43' : '#c5f8ff',
    );
    this.mat.emissiveColor = color;
    for (const mesh of [this.path, this.area, this.rim, this.sector, this.edge])
      mesh.setEnabled(false);
    if (spec.shape === 'cone') {
      this.sector.setEnabled(true);
      this.edge.setEnabled(true);
      this.edge.color = color;
      this.positions.set([hero.position.x, 0.16, hero.position.z], 0);
      this.points[0].set(hero.position.x, 0.18, hero.position.z);
      for (let i = 0; i <= 32; i++) {
        const a = angle - spec.arc / 2 + (spec.arc * i) / 32;
        const ray = clippedAim(
          hero.position,
          add(hero.position, { x: Math.sin(a), z: Math.cos(a) }, spec.range),
          state.map,
        );
        this.positions.set([ray.x, 0.16, ray.z], (i + 1) * 3);
        this.points[i + 1].set(ray.x, 0.18, ray.z);
      }
      this.points[34].copyFrom(this.points[0]);
      this.sector.updateVerticesData(VertexBuffer.PositionKind, this.positions, true);
      MeshBuilder.CreateLines(
        'aim-sector-border',
        { points: this.points, instance: this.edge },
        this.scene,
      );
      return;
    }
    this.path.setEnabled(spec.shape !== 'self');
    this.path.rotation.y = angle;
    if (spec.shape === 'wall') {
      this.path.position.set(end.x, 0.18, end.z);
      this.path.scaling.set(spec.radius * 2, 1, 0.2);
      return;
    }
    this.path.position.set((hero.position.x + end.x) / 2, 0.16, (hero.position.z + end.z) / 2);
    this.path.scaling.set(spec.shape === 'line' ? spec.radius * 2 : 0.1, 1, Math.max(0.01, length));
    if (spec.shape === 'line') return;
    for (const mesh of [this.area, this.rim]) {
      mesh.setEnabled(true);
      mesh.position.set(
        spec.shape === 'self' ? hero.position.x : end.x,
        0.17,
        spec.shape === 'self' ? hero.position.z : end.z,
      );
    }
    this.area.scaling.set(spec.radius, spec.radius, 1);
    this.rim.scaling.set(spec.radius, 1, spec.radius);
  }
  dispose() {
    this.root.dispose();
    this.mat.dispose();
  }
}
