import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { GameEvent, MatchState } from '../core/types';

const ATLASES = {
  fireball_comet: [6, 4, 24],
  fireball_impact: [4, 4, 16],
  fire_nova: [6, 6, 36],
  meteor_warning: [4, 4, 16],
  meteor_fall: [4, 4, 16],
  meteor_impact: [6, 6, 36],
} as const;
type Art = keyof typeof ATLASES;
interface Atlas {
  mesh: Mesh;
  material: StandardMaterial;
  texture: Texture;
  art: Art;
  age: number;
  life: number;
}
interface Shot {
  body?: Atlas;
  warning?: Atlas;
}

/** Uploaded art follows simulation projectiles/zones. It never schedules damage. */
export class FireMageVfx {
  private textures = new Map<Art, Texture>();
  private timed = new Set<Atlas>();
  private shots = new Map<number, Shot>();
  private zones = new Map<number, Atlas>();
  constructor(private scene: Scene) {
    for (const art of Object.keys(ATLASES) as Art[]) {
      const texture = new Texture(
        `${import.meta.env.BASE_URL}vfx/fire-mage/${art}.png`,
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
  private frame(atlas: Atlas, progress: number) {
    const [columns, rows, count] = ATLASES[atlas.art];
    const index = Math.max(0, Math.min(count - 1, Math.floor(progress * count)));
    atlas.texture.uOffset = (index % columns) / columns;
    atlas.texture.vOffset = 1 - (Math.floor(index / columns) + 1) / rows;
  }
  private create(
    art: Art,
    center: Vector3,
    diameter: number,
    ground: boolean,
    life: number,
  ): Atlas {
    // Texture clones share the GPU image, but keep independent frame offsets.
    const texture = this.textures.get(art)!.clone()!;
    const [columns, rows] = ATLASES[art];
    texture.uScale = 1 / columns;
    texture.vScale = 1 / rows;
    const material = new StandardMaterial(`mage-${art}`, this.scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.emissiveColor = Color3.White();
    material.specularColor = Color3.Black();
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.disableDepthWrite = true;
    const mesh = MeshBuilder.CreatePlane(`mage-${art}`, { size: diameter }, this.scene);
    mesh.material = material;
    mesh.isPickable = false;
    if (ground) mesh.rotation.x = -Math.PI / 2;
    else mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.position.copyFrom(center);
    const atlas = { mesh, material, texture, art, age: 0, life };
    this.frame(atlas, 0);
    return atlas;
  }
  private dispose(atlas?: Atlas) {
    if (!atlas) return;
    atlas.mesh.dispose();
    atlas.material.dispose();
    atlas.texture.dispose();
  }
  emit(event: GameEvent) {
    if (event.castStage !== 'impact') return;
    let effect: Atlas | undefined;
    if (event.abilityId === 'firemage-1')
      effect = this.create(
        'fireball_impact',
        new Vector3(event.position.x, 1, event.position.z),
        3.2,
        false,
        16 / 24,
      );
    else if (event.abilityId === 'firemage-4')
      effect = this.create(
        'meteor_impact',
        new Vector3(event.position.x, 0.09, event.position.z),
        (event.radius ?? 6) * 2.3,
        true,
        1.2,
      );
    if (effect) {
      if (this.timed.size >= 32) {
        const oldest = this.timed.values().next().value!;
        this.timed.delete(oldest);
        this.dispose(oldest);
      }
      this.timed.add(effect);
    }
  }
  update(dt: number, state: MatchState) {
    for (const effect of this.timed) {
      effect.age += dt;
      if (effect.age >= effect.life) {
        this.timed.delete(effect);
        this.dispose(effect);
      } else this.frame(effect, effect.age / effect.life);
    }
    const active = new Set<number>();
    for (const p of state.projectiles) {
      if ((p.warmup ?? 0) > 0 || (p.abilityId !== 'firemage-1' && p.abilityId !== 'firemage-4'))
        continue;
      active.add(p.id);
      let shot = this.shots.get(p.id);
      if (!shot) {
        shot = {};
        this.shots.set(p.id, shot);
      }
      if (p.abilityId === 'firemage-1') {
        shot.body ??= this.create('fireball_comet', Vector3.Zero(), 2.5, false, 1);
        const body = shot.body;
        body.age += dt;
        this.frame(body, body.age % 1);
        body.mesh.position.set(
          p.position.x - p.direction.x * 0.55,
          1.25,
          p.position.z - p.direction.z * 0.55,
        );
        const camera = this.scene.activeCamera;
        if (camera) {
          const right = camera.getDirection(Vector3.Right()),
            up = camera.getDirection(Vector3.Up());
          body.mesh.rotation.z = Math.atan2(
            p.direction.x * up.x + p.direction.z * up.z,
            p.direction.x * right.x + p.direction.z * right.z,
          );
        }
      } else if (p.area) {
        const area = p.area;
        const progress = area.elapsed / area.flightTime;
        shot.warning ??= this.create(
          'meteor_warning',
          new Vector3(area.destination.x, 0.08, area.destination.z),
          area.radius * 2.1,
          true,
          area.flightTime,
        );
        this.frame(shot.warning, progress);
        // Scale the supplied warning/fall phases to the real flight, so impact agrees with damage.
        const split = 0.7 / 1.6;
        if (progress >= split) {
          shot.body ??= this.create('meteor_fall', Vector3.Zero(), 2.75, false, 1);
          const fall = Math.min(1, (progress - split) / (1 - split));
          this.frame(shot.body, fall);
          const t = 1 - fall * fall;
          shot.body.mesh.position.set(
            area.destination.x - 4.2 * t,
            0.25 + 10 * t,
            area.destination.z - 3.2 * t,
          );
        }
      }
    }
    for (const [id, shot] of this.shots)
      if (!active.has(id)) {
        this.dispose(shot.body);
        this.dispose(shot.warning);
        this.shots.delete(id);
      }
    const activeZones = new Set<number>();
    for (const zone of state.zones) {
      if (zone.abilityId !== 'firemage-2' || zone.delay > 0 || zone.remaining <= 0) continue;
      activeZones.add(zone.id);
      let effect = this.zones.get(zone.id);
      if (!effect) {
        effect = this.create(
          'fire_nova',
          new Vector3(zone.position.x, 0.09, zone.position.z),
          zone.radius * 2.25,
          true,
          1.2,
        );
        this.zones.set(zone.id, effect);
      }
      effect.age += dt;
      this.frame(effect, (effect.age % effect.life) / effect.life);
    }
    for (const [id, effect] of this.zones)
      if (!activeZones.has(id)) {
        this.dispose(effect);
        this.zones.delete(id);
      }
  }
  clear() {
    for (const effect of this.timed) this.dispose(effect);
    for (const shot of this.shots.values()) {
      this.dispose(shot.body);
      this.dispose(shot.warning);
    }
    for (const effect of this.zones.values()) this.dispose(effect);
    this.timed.clear();
    this.shots.clear();
    this.zones.clear();
  }
  dispose() {
    this.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
