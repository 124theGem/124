import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Entity, MatchState, Projectile } from '../core/types';
import frames from './projectileFrames.json';

type Art = keyof typeof frames;
export const BASIC_PROJECTILE_ART: Partial<Record<string, Art>> = {
  druid: 'nature',
  firemage: 'fire',
  icemage: 'ice',
  crossbow: 'arrow',
  archer: 'lightning',
  shaman: 'lightning',
  priest: 'magic',
  bard: 'magic',
  necromancer: 'nature',
};
export function basicProjectileArt(projectile: Projectile, source?: Entity): Art | undefined {
  if (projectile.abilityId || projectile.area || source?.kind !== 'hero') return;
  return BASIC_PROJECTILE_ART[source.classId];
}
interface Shot {
  art: Art;
  mesh: Mesh;
  material: StandardMaterial;
  texture: Texture;
  startedAt: number;
}
const PIXEL_SCALE = 2.4 / 362;
const FPS = 18;

/** Uploaded flight loops follow real projectiles. Skills, mines and damage stay in simulation. */
export class BasicProjectileVfx {
  private textures = new Map<Art, Texture>();
  private active = new Map<number, Shot>();
  private template: Mesh;
  constructor(private scene: Scene) {
    this.template = MeshBuilder.CreatePlane('basic-projectile-template', { size: 1 }, scene);
    this.template.isPickable = false;
    this.template.setEnabled(false);
    for (const art of Object.keys(frames) as Art[]) {
      const texture = new Texture(
        `${import.meta.env.BASE_URL}vfx/basic-projectiles/${frames[art].file}`,
        scene,
        true,
        false,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      texture.hasAlpha = true;
      texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      this.textures.set(art, texture);
    }
  }
  handles(projectile: Projectile, source?: Entity) {
    return basicProjectileArt(projectile, source) !== undefined;
  }
  private create(art: Art, time: number): Shot {
    // Clones share the GPU atlas; each shot keeps independent frame coordinates.
    const texture = this.textures.get(art)!.clone()!;
    const material = new StandardMaterial(`basic-${art}-material`, this.scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.emissiveColor = Color3.White();
    material.specularColor = Color3.Black();
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    const mesh = this.template.clone(`basic-${art}-flight`)!;
    mesh.setEnabled(true);
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.material = material;
    return { art, mesh, material, texture, startedAt: time };
  }
  update(state: MatchState) {
    const seen = new Set<number>();
    const sources = new Map(state.entities.map((e) => [e.id, e]));
    const camera = this.scene.activeCamera;
    const right = camera?.getDirection(Vector3.Right()) ?? Vector3.Right();
    const up = camera?.getDirection(Vector3.Up()) ?? Vector3.Up();
    for (const projectile of state.projectiles) {
      const art = basicProjectileArt(projectile, sources.get(projectile.source));
      if (!art || (projectile.warmup ?? 0) > 0) continue;
      seen.add(projectile.id);
      let shot = this.active.get(projectile.id);
      if (!shot || shot.art !== art) {
        if (shot) this.remove(projectile.id, shot);
        shot = this.create(art, state.time);
        this.active.set(projectile.id, shot);
      }
      const atlas = frames[art];
      const index =
        Math.floor(Math.max(0, state.time - shot.startedAt) * FPS) % atlas.frames.length;
      const frame = atlas.frames[index];
      // These strips have uneven frame widths and large transparent margins.
      // Sample their measured rectangles instead of cutting a regular grid.
      const inset = 0.5;
      shot.texture.uScale = (frame.w - inset * 2) / atlas.width;
      shot.texture.vScale = (frame.h - inset * 2) / atlas.height;
      shot.texture.uOffset = (frame.x + inset) / atlas.width;
      shot.texture.vOffset = 1 - (frame.y + frame.h - inset) / atlas.height;
      shot.mesh.scaling.set(frame.w * PIXEL_SCALE, frame.h * PIXEL_SCALE, 1);
      const dx = projectile.direction.x * right.x + projectile.direction.z * right.z;
      const dy = projectile.direction.x * up.x + projectile.direction.z * up.z;
      const angle = Math.atan2(dy, dx);
      shot.mesh.rotation.z = angle;
      // The bright head, rather than the middle of its tail, marks the collision point.
      const ax = (frame.tip - frame.w / 2) * PIXEL_SCALE;
      const ay = (frame.h / 2 - frame.axis) * PIXEL_SCALE;
      const ox = Math.cos(angle) * ax - Math.sin(angle) * ay;
      const oy = Math.sin(angle) * ax + Math.cos(angle) * ay;
      shot.mesh.position.set(
        projectile.position.x - right.x * ox - up.x * oy,
        1.25 - right.y * ox - up.y * oy,
        projectile.position.z - right.z * ox - up.z * oy,
      );
    }
    for (const [id, shot] of this.active) if (!seen.has(id)) this.remove(id, shot);
  }
  private remove(id: number, shot: Shot) {
    this.active.delete(id);
    shot.mesh.dispose();
    shot.material.dispose(false, false);
    shot.texture.dispose();
  }
  clear() {
    for (const [id, shot] of this.active) this.remove(id, shot);
  }
  dispose() {
    this.clear();
    this.template.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
