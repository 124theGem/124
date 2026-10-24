import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { GameEvent, MatchState, Vec2 } from '../core/types';
import type { Quality } from './WorldRenderer';
import { getClass } from '../classes/catalog';

interface SpellVisual {
  root: TransformNode;
  age: number;
  life: number;
  materials: StandardMaterial[];
  update: (age: number, progress: number) => void;
}
const point = (p: Vec2, y = 0) => new Vector3(p.x, y, p.z);

/** All skill visuals consume simulation events. Effects never apply damage or alter the match. */
export class CombatVfx {
  private visuals: SpellVisual[] = [];
  private particles = new Set<ParticleSystem>();
  private shields = new Map<string, Mesh>();
  private sprite: DynamicTexture;
  private serial = 0;
  quality: Quality = 'medium';
  constructor(private scene: Scene) {
    this.sprite = new DynamicTexture(
      'spell-particle-atlas',
      { width: 64, height: 64 },
      scene,
      false,
    );
    const ctx = this.sprite.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.22, '#ffffffeb');
    gradient.addColorStop(0.6, '#ffffff50');
    gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this.sprite.hasAlpha = true;
    this.sprite.update();
  }
  private material(name: string, color: string, alpha = 1) {
    const mat = new StandardMaterial(`vfx-${name}-${this.serial++}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(color);
    mat.emissiveColor = Color3.FromHexString(color);
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.alpha = alpha;
    mat.backFaceCulling = false;
    return mat;
  }
  private visual(
    life: number,
    build: (root: TransformNode, materials: StandardMaterial[]) => SpellVisual['update'],
  ) {
    const limit = this.quality === 'low' ? 24 : 48;
    while (this.visuals.length >= limit) this.disposeVisual(this.visuals.shift()!);
    const root = new TransformNode(`spell-${this.serial++}`, this.scene),
      materials: StandardMaterial[] = [];
    const update = build(root, materials);
    const visual = { root, age: 0, life, materials, update };
    update(0, 0);
    this.visuals.push(visual);
  }
  private ring(p: Vec2, radius: number, color: string, life = 0.7, start = 0.2, vertical = false) {
    this.visual(life, (root, materials) => {
      root.position.copyFrom(point(p, vertical ? 1.2 : 0.12));
      const mat = this.material('shockwave', color, 0.85);
      materials.push(mat);
      const ring = MeshBuilder.CreateTorus(
        'expanding-spell-ring',
        { diameter: radius * 2, thickness: 0.065, tessellation: 48 },
        this.scene,
      );
      ring.parent = root;
      ring.material = mat;
      if (vertical) ring.rotation.x = Math.PI / 2;
      return (_, t) => {
        const s = start + (1 - start) * (1 - Math.pow(1 - t, 2));
        root.scaling.setAll(s);
        mat.alpha = 0.9 * (1 - t);
      };
    });
  }
  private burst(p: Vec2, color: string, count = 30, y = 0.8, upward = false) {
    if (this.particles.size >= (this.quality === 'low' ? 5 : 10)) return;
    const ps = new ParticleSystem(
      `spell-burst-${this.serial++}`,
      Math.min(count * 2, 160),
      this.scene,
    );
    ps.particleTexture = this.sprite;
    ps.emitter = point(p, y);
    ps.minEmitBox.set(-0.25, -0.1, -0.25);
    ps.maxEmitBox.set(0.25, 0.2, 0.25);
    const c = Color3.FromHexString(color);
    ps.color1 = new Color4(c.r, c.g, c.b, 1);
    ps.color2 = new Color4(1, 0.95, 0.8, 0.8);
    ps.colorDead = new Color4(c.r, c.g, c.b, 0);
    ps.minSize = 0.07;
    ps.maxSize = 0.3;
    ps.minLifeTime = 0.25;
    ps.maxLifeTime = 0.85;
    ps.emitRate = 0;
    ps.manualEmitCount = this.quality === 'low' ? Math.ceil(count / 2) : count;
    ps.direction1.set(-1.5, upward ? 2 : 0.4, -1.5);
    ps.direction2.set(1.5, upward ? 4 : 2.2, 1.5);
    ps.minEmitPower = 1.1;
    ps.maxEmitPower = 2.8;
    ps.gravity.set(0, upward ? 0.4 : -3, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.updateSpeed = 0.016;
    ps.disposeOnStop = false;
    ps.targetStopDuration = 0.9;
    ps.onStoppedObservable.addOnce(() => ps.dispose(false));
    this.particles.add(ps);
    ps.onDisposeObservable.addOnce(() => this.particles.delete(ps));
    ps.start();
  }
  private slash(p: Vec2, facing: number, color: string, radius = 2.2, delay = 0, spin = false) {
    this.visual(0.52 + delay, (root, materials) => {
      root.position.copyFrom(point(p, 0.9));
      root.rotation.y = facing;
      const mat = this.material('weapon-trail', color, 0.9);
      materials.push(mat);
      const arc = spin ? Math.PI * 1.8 : Math.PI * 0.95;
      const outer: Vector3[] = [],
        inner: Vector3[] = [];
      for (let i = 0; i <= 30; i++) {
        const a = -arc / 2 + (arc * i) / 30;
        outer.push(
          new Vector3(
            Math.sin(a) * radius,
            Math.sin((i / 30) * Math.PI) * 0.2,
            Math.cos(a) * radius,
          ),
        );
        inner.push(new Vector3(Math.sin(a) * (radius - 0.34), 0, Math.cos(a) * (radius - 0.34)));
      }
      const blade = MeshBuilder.CreateRibbon(
        'weapon-arc',
        { pathArray: [inner, outer], sideOrientation: Mesh.DOUBLESIDE },
        this.scene,
      );
      blade.parent = root;
      blade.material = mat;
      return (age, t) => {
        root.setEnabled(age >= delay);
        const u = Math.max(0, (age - delay) / 0.52);
        root.rotation.y = facing + (spin ? u * Math.PI * 2 : (u - 0.5) * 0.65);
        root.scaling.setAll(0.75 + Math.min(1, u) * 0.3);
        mat.alpha = 0.95 * (1 - Math.min(1, u));
      };
    });
  }
  private beam(from: Vec2, to: Vec2, color: string, lightning = false) {
    this.visual(lightning ? 0.65 : 0.4, (root, materials) => {
      const mat = this.material(lightning ? 'lightning' : 'beam', color, 0.95);
      materials.push(mat);
      const path: Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12,
          jitter = lightning && i > 0 && i < 12 ? Math.sin(i * 7.3) * 0.45 : 0;
        path.push(
          new Vector3(
            from.x + (to.x - from.x) * t + jitter,
            1.2 + Math.sin(t * Math.PI) * 0.3,
            from.z + (to.z - from.z) * t - jitter,
          ),
        );
      }
      const mesh = MeshBuilder.CreateTube(
        'spell-beam',
        { path, radius: lightning ? 0.065 : 0.045, tessellation: 6 },
        this.scene,
      );
      mesh.parent = root;
      mesh.material = mat;
      return (age, t) => {
        mat.alpha = (1 - t) * (lightning ? 0.65 + Math.sin(age * 50) * 0.3 : 0.95);
      };
    });
  }
  private pillar(p: Vec2, color: string, radius = 1.5, life = 1.2) {
    this.visual(life, (root, materials) => {
      root.position.copyFrom(point(p));
      const mat = this.material('light-column', color, 0.22);
      materials.push(mat);
      const column = MeshBuilder.CreateCylinder(
        'holy-light-column',
        { diameter: radius * 2, height: 4.5, tessellation: 32, hasRings: false, cap: Mesh.NO_CAP },
        this.scene,
      );
      column.parent = root;
      column.position.y = 2.1;
      column.material = mat;
      const halo = MeshBuilder.CreateTorus(
        'holy-halo',
        { diameter: radius * 2, thickness: 0.075, tessellation: 40 },
        this.scene,
      );
      halo.parent = root;
      halo.material = this.material('halo', color, 0.9);
      materials.push(halo.material as StandardMaterial);
      return (age, t) => {
        mat.alpha = Math.sin(t * Math.PI) * 0.25;
        halo.position.y = 0.2 + t * 2.4;
        (halo.material as StandardMaterial).alpha = 1 - t;
        root.scaling.x = root.scaling.z = 0.7 + t * 0.3;
      };
    });
    this.ring(p, radius, color, 0.9);
    this.burst(p, color, 36, 0.4, true);
  }
  private ice(p: Vec2, radius: number, ultimate: boolean) {
    this.ring(p, radius, '#9cecff', 1.1);
    this.visual(ultimate ? 2.4 : 1.3, (root, materials) => {
      root.position.copyFrom(point(p));
      const mat = this.material('ice-crystals', '#a4e9ff', 0.9);
      materials.push(mat);
      const spikes: Mesh[] = [];
      for (let i = 0; i < (ultimate ? 14 : 7); i++) {
        const a = i * 2.399,
          r = Math.sqrt((i + 1) / (ultimate ? 14 : 7)) * radius * 0.8;
        const spike = MeshBuilder.CreateCylinder(
          'rising-ice-spike',
          { height: 1.4 + (i % 3) * 0.5, diameterTop: 0, diameterBottom: 0.4, tessellation: 5 },
          this.scene,
        );
        spike.parent = root;
        spike.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        spike.rotation.z = Math.sin(i) * 0.2;
        spike.material = mat;
        spikes.push(spike);
      }
      return (_, t) => {
        const grow = Math.min(1, t * 6),
          fade = Math.min(1, (1 - t) * 4);
        for (const spike of spikes) {
          spike.scaling.y = grow * fade;
          spike.position.y = spike.getBoundingInfo().boundingBox.extendSize.y * spike.scaling.y;
        }
        mat.alpha = fade * 0.85;
      };
    });
    this.burst(p, '#b7f7ff', 45, 0.4);
  }
  private fire(p: Vec2, radius: number, meteor: boolean, delay = 1.2) {
    if (meteor)
      this.visual(delay + 1.1, (root, materials) => {
        root.position.copyFrom(point(p));
        const mat = this.material('meteor-core', '#ffb35b');
        materials.push(mat);
        const rock = MeshBuilder.CreateIcoSphere(
          'descending-meteor',
          { radius: 0.95, subdivisions: 2, flat: true },
          this.scene,
        );
        rock.parent = root;
        rock.material = mat;
        let exploded = false;
        return (age, t) => {
          const fall = Math.min(1, age / Math.max(0.1, delay));
          rock.position.set((1 - fall) * 3, 0.6 + (1 - fall) * 12, (1 - fall) * -3);
          rock.rotation.z += 0.08;
          rock.setEnabled(fall < 1);
          if (fall === 1 && !exploded) {
            exploded = true;
            this.ring(p, radius, '#ff8543', 1);
            this.ring(p, radius * 0.7, '#ffdb83', 0.7);
            this.burst(p, '#ff9d43', 90, 0.7);
            this.pillar(p, '#ffb25c', radius * 0.55, 0.65);
          }
        };
      });
    else {
      this.ring(p, radius, '#ff964b', 0.85);
      this.ring(p, radius * 0.7, '#ffd285', 0.55, 0.1, true);
      this.burst(p, '#ff8f41', 48, 0.5);
    }
  }
  private arrows(
    from: Vec2,
    to: Vec2,
    color: string,
    rain: boolean,
    radius: number,
    duration: number,
  ) {
    this.visual(rain ? Math.min(5.5, duration || 3) : 0.75, (root, materials) => {
      const mat = this.material('enchanted-arrows', color, 1);
      materials.push(mat);
      const arrows: { mesh: Mesh; offset: number; end: Vector3 }[] = [];
      const count = rain ? 24 : 7;
      for (let i = 0; i < count; i++) {
        const shaft = MeshBuilder.CreateCylinder(
          'skill-arrow',
          { height: 0.95, diameter: 0.055, diameterTop: 0.025, tessellation: 5 },
          this.scene,
        );
        shaft.parent = root;
        shaft.material = mat;
        const a = i * 2.399,
          r = rain ? Math.sqrt((i + 1) / count) * radius : 0.4;
        arrows.push({
          mesh: shaft,
          offset: rain ? (i / count) * 1.2 : i * 0.025,
          end: new Vector3(to.x + Math.cos(a) * r, 0.3, to.z + Math.sin(a) * r),
        });
      }
      return (age, t) => {
        for (const arrow of arrows) {
          const local = rain ? (((age - arrow.offset) % 1.3) + 1.3) % 1.3 : age - arrow.offset;
          arrow.mesh.setEnabled(age >= arrow.offset && local < 0.6);
          const f = Math.min(1, Math.max(0, local / 0.6));
          const start = rain ? arrow.end.add(new Vector3(-2, 10, -1)) : point(from, 1.4);
          Vector3.LerpToRef(start, arrow.end, f, arrow.mesh.position);
          const d = arrow.end.subtract(start);
          arrow.mesh.rotation.set(Math.atan2(Math.hypot(d.x, d.z), d.y), Math.atan2(d.x, d.z), 0);
        }
        mat.alpha = Math.min(1, (1 - t) * 5);
      };
    });
    if (rain) this.ring(to, radius, color, 1.2);
  }
  private totem(p: Vec2, color: string, tree: boolean, duration: number) {
    this.visual(Math.min(duration || 5, 10), (root, materials) => {
      root.position.copyFrom(point(p));
      const wood = this.material('totem-wood', '#796044');
      wood.disableLighting = false;
      wood.emissiveColor.setAll(0.03);
      materials.push(wood);
      const magic = this.material('totem-runes', color);
      materials.push(magic);
      const trunk = MeshBuilder.CreateCylinder(
        tree ? 'life-tree' : 'spirit-totem',
        { height: 2.9, diameterTop: 0.16, diameterBottom: 0.34, tessellation: 10 },
        this.scene,
      );
      trunk.parent = root;
      trunk.position.y = 1.45;
      trunk.material = wood;
      const rings: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const ring = MeshBuilder.CreateTorus(
          'totem-magic',
          { diameter: tree ? 2.2 - i * 0.4 : 0.9, thickness: 0.065, tessellation: 32 },
          this.scene,
        );
        ring.parent = root;
        ring.position.y = 1 + i * 0.7;
        ring.material = magic;
        rings.push(ring);
      }
      if (tree)
        for (let i = 0; i < 7; i++) {
          const a = i * 2.399;
          const branch = MeshBuilder.CreateTube(
            'living-branch',
            {
              path: [
                new Vector3(0, 1.5, 0),
                new Vector3(Math.cos(a) * 0.8, 2.5, Math.sin(a) * 0.8),
                new Vector3(Math.cos(a) * 1.5, 2.8, Math.sin(a) * 1.5),
              ],
              radius: 0.055,
              tessellation: 6,
            },
            this.scene,
          );
          branch.parent = root;
          branch.material = wood;
          const leaf = MeshBuilder.CreateIcoSphere(
            'spirit-foliage',
            { radius: 0.5, subdivisions: 1 },
            this.scene,
          );
          leaf.parent = root;
          leaf.position.set(Math.cos(a) * 1.2, 2.7, Math.sin(a) * 1.2);
          leaf.scaling.set(1, 0.55, 1);
          leaf.material = magic;
        }
      return (age, t) => {
        root.scaling.setAll(Math.min(1, age * 3) * Math.min(1, (1 - t) * 8));
        for (const r of rings) r.rotation.y = age;
        magic.alpha = 0.65 + Math.sin(age * 3) * 0.15;
      };
    });
    this.ring(p, tree ? 6 : 4, color, 1.2);
    this.burst(p, color, 48, 0.7, true);
  }
  emit(event: GameEvent, state: MatchState) {
    if (event.type === 'damage') {
      const c = event.classId ? getClass(event.classId) : undefined;
      this.burst(event.position, c?.color ?? event.color, c?.model === 'Mage' ? 18 : 6, 1.1);
      if (c?.model === 'Mage') this.ring(event.position, 1.1, c.color, 0.4);
      return;
    }
    if (event.type === 'heal') {
      this.burst(event.position, '#a7f3be', 9, 0.8, true);
      return;
    }
    if (event.type === 'dodge') {
      this.ring(event.position, 1.5, '#b7e6e6', 0.35);
      return;
    }
    if (event.type !== 'cast') return;
    const origin = event.origin ?? event.target ?? event.position,
      to = event.position;
    const c = getClass(event.classId ?? 'guardian');
    const ability = c.abilities.find((a) => a.id === event.abilityId);
    const radius = Math.max(1.5, event.radius || 2.4),
      facing = event.facing ?? 0;
    if (!ability) {
      if (event.sourceId && c.range <= 5) this.slash(origin, facing, c.color, Math.min(3, c.range));
      return;
    }
    const kinds = ability.effects.map((f) => f.kind),
      ultimate = !!event.ultimate;
    // Every skill has both a caster cue and its own travelling/impact/area treatment.
    this.ring(origin, ultimate ? 1.8 : 1, c.color, ultimate ? 0.9 : 0.45);
    if (c.id === 'archer' || c.id === 'crossbow') {
      if (kinds.includes('haste') && !kinds.includes('damage'))
        this.pillar(origin, '#e6d7a0', 1.3, 0.8);
      else if (c.id === 'archer' && ability.id.endsWith('-4'))
        this.arrows(origin, to, '#e7d6a0', true, radius, event.duration ?? 5);
      else if (ability.target === 'line') this.beam(origin, to, '#fff0b7');
      else if (ability.type === 'projectile') this.burst(origin, c.color, 12, 1.2);
      else this.arrows(origin, to, c.color, false, radius, 0);
      if (c.id === 'crossbow' && ability.id.endsWith('-2')) this.fire(to, radius, false);
    } else if (c.id === 'firemage') {
      if (ability.type === 'projectile') this.burst(origin, c.color, 18, 1.2);
      else this.fire(to, radius, ultimate, event.delay ?? 1.2);
    } else if (c.id === 'icemage') {
      if (kinds.includes('shield')) this.pillar(origin, c.color, 1.3);
      else if (ability.type === 'projectile') this.burst(origin, c.color, 18, 1.2);
      else this.ice(to, radius, ultimate);
    } else if (c.id === 'shaman') {
      if (ability.id.endsWith('-2')) this.totem(to, c.color, false, event.duration ?? 10);
      else if (kinds.includes('damage')) {
        let previous = origin;
        for (const enemy of state.entities
          .filter(
            (e) =>
              e.alive &&
              e.team !== state.entities.find((s) => s.id === event.sourceId)?.team &&
              Math.hypot(e.position.x - to.x, e.position.z - to.z) < radius + 3,
          )
          .slice(0, ultimate ? 6 : 3)) {
          this.beam(previous, enemy.position, '#a1f0ee', true);
          this.burst(enemy.position, c.color, 18);
          previous = enemy.position;
        }
        this.ring(to, radius, c.color, 0.9);
      } else this.pillar(origin, c.color, radius * 0.5);
    } else if (c.id === 'druid' && ultimate) this.totem(origin, c.color, true, event.duration ?? 8);
    else if (kinds.includes('heal') || kinds.includes('revive') || kinds.includes('cleanse')) {
      const team = state.entities.find((e) => e.id === event.sourceId)?.team;
      const targets =
        ability.target === 'team'
          ? state.entities.filter((e) => e.team === team && e.alive)
          : [{ position: ability.target === 'ally' ? to : origin }];
      for (const ally of targets)
        this.pillar(ally.position, c.color, ultimate ? 1.8 : 1.2, ultimate ? 1.8 : 1);
    } else if (kinds.includes('shield') || kinds.includes('defense')) {
      this.pillar(origin, c.color, ultimate ? 3 : 1.4, ultimate ? 1.8 : 1);
      if (ultimate) this.ring(origin, Math.min(radius, 9), c.color, 1.5);
    } else if (
      c.id === 'necromancer' ||
      kinds.includes('summon') ||
      kinds.includes('stealth') ||
      kinds.includes('poison') ||
      kinds.includes('root')
    ) {
      this.ring(to, radius, c.color, 1.3);
      this.burst(to, c.color, ultimate ? 75 : 35, 0.4, true);
      if (kinds.includes('summon'))
        for (let i = 0; i < (ultimate ? 3 : 1); i++)
          this.pillar(
            { x: origin.x + Math.cos(i * 2) * 2, z: origin.z + Math.sin(i * 2) * 2 },
            c.color,
            0.8,
            1.4,
          );
      if (kinds.includes('damage')) this.beam(origin, to, c.color);
    } else if (c.id === 'bard') {
      for (let i = 0; i < 3; i++) this.ring(origin, 2 + i * 1.7, c.color, 0.8 + i * 0.2);
      this.burst(origin, c.color, 40, 1.4, true);
    } else if (kinds.includes('damage')) {
      this.slash(origin, facing, c.color, Math.min(radius, 4.8), 0, ultimate);
      if (ultimate) {
        this.slash(origin, facing + Math.PI, c.color, Math.min(radius, 4.8), 0.18, true);
        this.burst(to, c.color, 60);
      } else this.burst(to, c.color, 20);
      if (ability.target === 'line') this.beam(origin, to, c.color);
    } else {
      this.ring(origin, 3, c.color, 1);
      this.burst(origin, c.color, 35, 1.2, true);
    }
  }
  update(dt: number, state: MatchState) {
    for (const visual of [...this.visuals]) {
      visual.age += dt;
      visual.update(visual.age, Math.min(1, visual.age / visual.life));
    }
    this.visuals = this.visuals.filter((v) => {
      if (v.age >= v.life) {
        this.disposeVisual(v);
        return false;
      }
      return true;
    });
    for (const entity of state.entities) {
      const protectedNow =
        entity.alive &&
        (entity.shield > 0 ||
          entity.statuses.some((s) => s.kind === 'defense' || s.kind === 'invulnerable'));
      let mesh = this.shields.get(entity.id);
      if (protectedNow && !mesh) {
        mesh = MeshBuilder.CreateSphere(
          'visible-magic-shield',
          { diameter: 2.85, segments: 16 },
          this.scene,
        );
        const mat = this.material('shield', getClass(entity.classId).color, 0.17);
        mat.emissiveFresnelParameters = new FresnelParameters({
          bias: 0.1,
          power: 2,
          leftColor: Color3.White(),
          rightColor: Color3.Black(),
        });
        mesh.material = mat;
        this.shields.set(entity.id, mesh);
      }
      if (mesh) {
        if (!protectedNow) {
          mesh.dispose(false, true);
          this.shields.delete(entity.id);
        } else {
          mesh.position.copyFrom(point(entity.position, 1.1));
          mesh.rotation.y += dt * 0.6;
        }
      }
    }
  }
  get activeCount() {
    return this.visuals.length;
  }
  private disposeVisual(v: SpellVisual) {
    v.root.dispose();
    for (const m of v.materials) m.dispose();
  }
  clear() {
    for (const v of this.visuals) this.disposeVisual(v);
    this.visuals = [];
    for (const p of [...this.particles]) p.dispose(false);
    this.particles.clear();
    for (const shield of this.shields.values()) shield.dispose(false, true);
    this.shields.clear();
  }
  dispose() {
    this.clear();
    this.sprite.dispose();
  }
}
