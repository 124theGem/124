import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vec2 } from '../core/types';

interface LandingVisual {
  root: TransformNode;
  age: number;
  radius: number;
  hd: boolean;
  impact?: Mesh;
  atlas: Texture;
  materials: StandardMaterial[];
  ward?: TransformNode;
  shieldMaterial?: StandardMaterial;
  shields: Mesh[];
  rings: StandardMaterial[];
}
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** New uploaded package: a ground impact for 1s, eight separate shields for 3s. */
export class TankJumpVfx {
  private textures = new Map<string, Texture>();
  private active = new Set<LandingVisual>();
  constructor(private scene: Scene) {
    this.texture('impact_mobile_2k_4x4.png');
    this.texture('shield_emblem_mobile_512.png');
  }
  private texture(file: string) {
    let texture = this.textures.get(file);
    if (!texture) {
      texture = new Texture(
        `${import.meta.env.BASE_URL}vfx/tank-ultimate/${file}`,
        this.scene,
        true,
        !file.startsWith('impact_'),
        Texture.BILINEAR_SAMPLINGMODE,
      );
      texture.hasAlpha = true;
      texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      this.textures.set(file, texture);
    }
    return texture;
  }
  private material(name: string, color: string, texture?: Texture) {
    const material = new StandardMaterial(name, this.scene);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(color);
    material.specularColor = Color3.Black();
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.disableDepthWrite = true;
    if (texture) {
      material.diffuseTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
    }
    return material;
  }
  play(center: Vec2, radius: number, hd = false) {
    if (this.active.size >= 16) this.remove(this.active.values().next().value!);
    const root = new TransformNode('titan-landing', this.scene);
    root.position.set(center.x, 0.06, center.z);
    const atlas = this.texture(hd ? 'impact_hd_4k_4x4.png' : 'impact_mobile_2k_4x4.png').clone()!;
    const inset = 2 / (hd ? 4096 : 2048);
    atlas.uScale = atlas.vScale = 0.25 - inset * 2;
    atlas.uOffset = inset;
    atlas.vOffset = 0.75 + inset;
    const impactMaterial = this.material('titan-impact', '#ffffff', atlas);
    const impact = MeshBuilder.CreatePlane(
      'titan-ground-impact',
      { size: radius * 2.18 },
      this.scene,
    );
    impact.parent = root;
    impact.rotation.x = -Math.PI / 2;
    impact.isPickable = false;
    impact.material = impactMaterial;
    this.active.add({
      root,
      age: 0,
      radius,
      hd,
      impact,
      atlas,
      materials: [impactMaterial],
      shields: [],
      rings: [],
    });
  }
  private startWard(entry: LandingVisual) {
    const ward = new TransformNode('titan-shield-ward', this.scene);
    ward.parent = entry.root;
    entry.ward = ward;
    const shieldTexture = this.texture(
      entry.hd ? 'shield_emblem_hd_1024.png' : 'shield_emblem_mobile_512.png',
    );
    const shieldMaterial = this.material('titan-shield-emblems', '#ffffff', shieldTexture);
    entry.shieldMaterial = shieldMaterial;
    entry.materials.push(shieldMaterial);
    const size = Math.min(2.1, Math.max(1, entry.radius * 0.33));
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const shield = MeshBuilder.CreatePlane('titan-shield-emblem', { size }, this.scene);
      shield.parent = ward;
      shield.billboardMode = Mesh.BILLBOARDMODE_ALL;
      shield.position.set(
        Math.cos(angle) * entry.radius,
        size * 0.58,
        Math.sin(angle) * entry.radius,
      );
      shield.material = shieldMaterial;
      shield.isPickable = false;
      entry.shields.push(shield);
    }
    for (const [offset, thickness, color] of [
      [0, 0.075, '#4be8ff'],
      [-0.11, 0.045, '#ffc659'],
    ] as const) {
      const ring = MeshBuilder.CreateTorus(
        'titan-ward-ring',
        { diameter: (entry.radius + offset) * 2, thickness, tessellation: 64 },
        this.scene,
      );
      ring.parent = ward;
      ring.position.y = 0.04;
      ring.isPickable = false;
      const material = this.material('titan-ward-ring', color);
      ring.material = material;
      entry.materials.push(material);
      entry.rings.push(material);
    }
  }
  update(dt: number) {
    for (const entry of this.active) {
      entry.age += dt;
      if (entry.age >= 4) {
        this.remove(entry);
        continue;
      }
      if (entry.age < 1) {
        const frame = Math.min(15, Math.floor(entry.age * 16)),
          inset = 2 / (entry.hd ? 4096 : 2048);
        entry.atlas.uOffset = (frame % 4) * 0.25 + inset;
        entry.atlas.vOffset = 1 - (Math.floor(frame / 4) + 1) * 0.25 + inset;
        entry.materials[0].alpha = Math.min(1, (1 - entry.age) / 0.22);
      } else {
        if (entry.impact) {
          entry.impact.dispose();
          entry.impact = undefined;
        }
        if (!entry.ward) this.startWard(entry);
        const time = entry.age - 1;
        const alpha = smooth(time / 0.24) * (1 - smooth((time - 2.68) / 0.32));
        entry.shieldMaterial!.alpha = alpha;
        entry.rings.forEach((material, i) => {
          material.alpha = alpha * (i ? 0.9 : 0.82 + 0.17 * Math.sin(time * 8));
        });
        const size = Math.min(2.1, Math.max(1, entry.radius * 0.33));
        entry.shields.forEach((shield, i) => {
          shield.scaling.setAll(
            (1 + 0.045 * Math.sin(time * 7 + i * 0.8)) * (0.8 + 0.2 * smooth(time / 0.2)),
          );
          shield.position.y = size * 0.58 + 0.07 * Math.sin(time * 4 + i * 0.9);
        });
      }
    }
  }
  private remove(entry: LandingVisual) {
    this.active.delete(entry);
    entry.root.dispose();
    for (const material of entry.materials) material.dispose(false, false);
    entry.atlas.dispose();
  }
  clear() {
    for (const entry of this.active) this.remove(entry);
  }
  dispose() {
    this.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
