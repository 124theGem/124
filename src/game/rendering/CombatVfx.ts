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
import { skillVisual } from './skillVisuals';
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
  private burstIndex = 0;
  private templates = new Map<string, Mesh>();
  private palette = new Map<string, StandardMaterial>();
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
    // Four reusable emitters, including hit sparks. No shader/system allocation on contact.
    for (let i = 0; i < 4; i++) this.makeEmitter();
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
  private makeEmitter() {
    const ps = new ParticleSystem(`pooled-combat-sparks-${this.particles.size}`, 192, this.scene);
    ps.particleTexture = this.sprite;
    ps.emitter = new Vector3();
    ps.minEmitBox.set(-0.2, -0.1, -0.2);
    ps.maxEmitBox.set(0.2, 0.2, 0.2);
    ps.minSize = 0.08;
    ps.maxSize = 0.24;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.55;
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    ps.minEmitPower = 1.1;
    ps.maxEmitPower = 2.8;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.updateSpeed = 0.016;
    this.particles.add(ps);
    ps.start();
  }
  private burst(p: Vec2, color: string, count = 30, y = 0.8, upward = false) {
    const pool = [...this.particles];
    const ps = pool[this.burstIndex++ % pool.length];
    if (!ps) return;
    (ps.emitter as Vector3).copyFrom(point(p, y));
    const c = Color3.FromHexString(color);
    ps.color1.set(c.r, c.g, c.b, 1);
    ps.color2.set(1, 0.95, 0.8, 0.8);
    ps.colorDead.set(c.r, c.g, c.b, 0);
    ps.direction1.set(-1.5, upward ? 2 : 0.4, -1.5);
    ps.direction2.set(1.5, upward ? 4 : 2.2, 1.5);
    ps.gravity.set(0, upward ? 0.4 : -3, 0);
    ps.manualEmitCount = Math.min(
      90,
      ps.manualEmitCount + Math.ceil(count * (this.quality === 'low' ? 0.5 : 1)),
    );
  }
  private shape(kind: string, parent: TransformNode, color: string) {
    let template = this.templates.get(kind);
    if (!template) {
      template =
        kind === 'orb'
          ? MeshBuilder.CreateIcoSphere(
              'vfx-template-orb',
              { radius: 1, subdivisions: 1 },
              this.scene,
            )
          : kind === 'spike'
            ? MeshBuilder.CreateCylinder(
                'vfx-template-spike',
                { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 5 },
                this.scene,
              )
            : MeshBuilder.CreateBox('vfx-template-block', { size: 1 }, this.scene);
      template.setEnabled(false);
      this.templates.set(kind, template);
    }
    let mat = this.palette.get(color);
    if (!mat) {
      mat = this.material('shared-skill-color', color);
      this.palette.set(color, mat);
    }
    const mesh = template.clone('skill-' + kind, parent)!;
    mesh.setEnabled(true);
    mesh.material = mat;
    mesh.isPickable = false;
    return mesh;
  }
  /** Solid silhouettes, with shared geometry/materials. Each style is distinct at phone scale. */
  private sculpt(
    style: string,
    p: Vec2,
    color: string,
    radius: number,
    life: number,
    facing = 0,
    follow?: string,
  ) {
    this.visual(life, (root) => {
      root.position.copyFrom(point(p));
      root.rotation.y = facing;
      root.metadata = follow ? { follow } : undefined;
      const pieces: { mesh: Mesh; x: number; y: number; z: number; phase: number }[] = [];
      const part = (
        kind: string,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        tint = color,
      ) => {
        const mesh = this.shape(kind, root, tint);
        mesh.position.set(x, y, z);
        mesh.scaling.set(sx, sy, sz);
        pieces.push({ mesh, x, y, z, phase: pieces.length * 2.399 });
        return mesh;
      };
      if (/shield|armor|blessing|fortress|guard|parry/.test(style)) {
        const count = style === 'fortress' ? 10 : style === 'parry' ? 2 : 5;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2,
            r = style === 'fortress' ? Math.min(radius, 4) : 1.25;
          const panel = part('block', Math.sin(a) * r, 1.15, Math.cos(a) * r, 0.78, 1.35, 0.13);
          panel.rotation.y = a;
          const crest = part(
            'spike',
            Math.sin(a) * r,
            2,
            Math.cos(a) * r,
            0.65,
            0.5,
            0.14,
            '#fff4bc',
          );
          crest.rotation.y = a;
        }
      } else if (/root|flame|fire|eruption|blizzard|ice-trap|storm|slam/.test(style)) {
        const count = style === 'elemental-storm' ? 18 : 12;
        for (let i = 0; i < count; i++) {
          const a = i * 2.399,
            r = Math.sqrt((i + 1) / count) * radius * 0.85;
          const kind = /root/.test(style) ? 'block' : 'spike';
          const stem = part(
            kind,
            Math.cos(a) * r,
            0.7,
            Math.sin(a) * r,
            0.32,
            1.2 + (i % 3) * 0.6,
            0.32,
            i % 3 === 0 ? '#fff5ba' : color,
          );
          stem.rotation.z = Math.sin(i) * 0.45;
          if (/root/.test(style)) {
            const branch = part(
              'spike',
              Math.cos(a) * r + 0.25,
              1.2,
              Math.sin(a) * r,
              0.3,
              1.3,
              0.3,
            );
            branch.rotation.z = -0.9;
          }
        }
      } else if (/skull|summon|undead/.test(style)) {
        const count = /army/.test(style) ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const x = count > 1 ? Math.cos(i * 2.1) * 2 : 0,
            z = count > 1 ? Math.sin(i * 2.1) * 2 : 0;
          part('orb', x, 1.5, z, 0.7, 0.8, 0.52, '#e5ddff');
          for (const side of [-1, 1])
            part('block', x + side * 0.25, 1.6, z + 0.49, 0.2, 0.25, 0.09, '#28164a');
          for (let t = 0; t < 4; t++)
            part('block', x + (t - 1.5) * 0.16, 0.95, z + 0.35, 0.11, 0.27, 0.15);
        }
      } else if (/song|anthem|wave|challenge/.test(style)) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2,
            r = Math.min(radius, 3) * 0.75;
          if (style === 'challenge') {
            part('block', Math.sin(a) * r, 2.1, Math.cos(a) * r, 0.16, 0.85, 0.16, '#ffcc38');
            part('orb', Math.sin(a) * r, 1.45, Math.cos(a) * r, 0.13, 0.13, 0.13, '#ffcc38');
          } else {
            part('orb', Math.sin(a) * r, 1.1, Math.cos(a) * r, 0.25, 0.16, 0.2);
            part('block', Math.sin(a) * r + 0.2, 1.6, Math.cos(a) * r, 0.08, 0.85, 0.08);
            part('block', Math.sin(a) * r + 0.4, 1.95, Math.cos(a) * r, 0.45, 0.1, 0.1);
          }
        }
      } else if (/heal|cleanse|resurrection|wings/.test(style)) {
        for (let i = 0; i < 6; i++) {
          const a = i * 2.399,
            r = 1 + (i % 2) * 0.5;
          if (/wings|resurrection/.test(style)) {
            const wing = part(
              'spike',
              (i < 3 ? -1 : 1) * (1.1 + (i % 3) * 0.45),
              1.8 + (i % 3) * 0.25,
              -0.4,
              0.8,
              2.1,
              0.22,
              '#fff3ac',
            );
            wing.rotation.z = (i < 3 ? 1 : -1) * 0.6;
          } else {
            part('block', Math.sin(a) * r, 1, Math.cos(a) * r, 0.65, 0.16, 0.15);
            part('block', Math.sin(a) * r, 1, Math.cos(a) * r, 0.16, 0.65, 0.15);
          }
        }
      } else if (/spore|stealth|shadow|rage|reload/.test(style)) {
        for (let i = 0; i < 9; i++) {
          const a = i * 2.399,
            r = 0.7 + (i % 3) * 0.5;
          const m = part(
            /rage/.test(style) ? 'spike' : 'orb',
            Math.sin(a) * r,
            0.6 + (i % 4) * 0.4,
            Math.cos(a) * r,
            0.25,
            0.5,
            0.25,
          );
          m.rotation.z = 0.5;
        }
      } else {
        // Physical weapon silhouettes, including spears and orbiting execution blades.
        const count = /thousand|rain/.test(style) ? 14 : /double|execution/.test(style) ? 4 : 7;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2,
            r = Math.min(radius, 3.6) * 0.75;
          const spear = /spear/.test(style),
            y = /rain/.test(style) ? 4 + (i % 3) : 1.1;
          const blade = part(
            'spike',
            Math.sin(a) * r,
            y,
            Math.cos(a) * r,
            spear ? 0.22 : 0.42,
            spear ? 2.1 : 1.2,
            0.12,
            i % 3 === 0 ? '#fff7df' : color,
          );
          blade.rotation.z = /rain/.test(style) ? Math.PI : Math.PI / 2;
          blade.rotation.y = a;
        }
      }
      return (age, t) => {
        const fade = Math.min(1, (1 - t) * 5),
          grow = Math.min(1, age * 9);
        root.scaling.setAll(grow);
        for (const item of pieces) {
          item.mesh.visibility = fade;
          if (/root|fire|flame|blizzard|storm|slam/.test(style))
            item.mesh.position.y = item.y + Math.sin(age * 9 + item.phase) * 0.22;
          else if (/rain/.test(style))
            item.mesh.position.y = 0.5 + ((((item.y - age * 9) % 5) + 5) % 5);
          else item.mesh.position.y = item.y + Math.sin(age * 4 + item.phase) * 0.14;
        }
        if (/whirl|dance|cuts|song|spore|rage|stealth/.test(style))
          root.rotation.y = facing + age * (/whirl|cuts/.test(style) ? 7 : 1.4);
      };
    });
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
            this.sculpt('fire-eruption', p, '#ff8543', radius, 1.1);
            this.burst(p, '#ff9d43', 90, 0.7);
          }
        };
      });
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
      this.burst(event.position, event.color, 8, 1.1);
      return;
    }
    if (event.type === 'heal') {
      this.burst(event.position, '#a7f3be', 6, 0.8, true);
      return;
    }
    if (event.type === 'dodge') {
      this.sculpt('shadow-step', event.position, '#b7faff', 1, 0.3);
      return;
    }
    if (event.type !== 'cast') return;
    const origin = event.origin ?? event.target ?? event.position,
      to = event.position;
    if (event.abilityId === 'boss-slam') {
      this.sculpt('boss-slam', to, '#ff9643', event.radius ?? 4, 0.65);
      this.burst(to, '#ffc857', 45);
      return;
    }
    const c = getClass(event.classId ?? 'guardian'),
      index = c.abilities.findIndex((a) => a.id === event.abilityId),
      a = c.abilities[index];
    if (!a) {
      if (event.sourceId && c.range <= 5)
        this.slash(origin, event.facing ?? 0, c.color, Math.min(3, c.range));
      return;
    }
    const style = skillVisual(c.id, index)!,
      radius = Math.max(1.2, a.radius || 2),
      facing = event.facing ?? 0;
    const source = state.entities.find((e) => e.id === event.sourceId);
    const life = a.duration ? Math.min(8, a.duration) : event.ultimate ? 1.7 : 0.85;
    this.burst(origin, c.color, event.ultimate ? 24 : 10, 1.1);
    if (a.delay && style !== 'meteor' && event.delay !== 0) {
      const delay = event.delay ?? a.delay;
      this.visual(delay + 0.05, () => {
        let fired = false;
        return (age) => {
          if (!fired && age >= delay) {
            fired = true;
            this.emit({ ...event, delay: 0 }, state);
          }
        };
      });
      return;
    }
    if (a.type === 'projectile') return; // The real simulated projectile supplies travel and impact.
    if (style === 'arrow-rain' || style === 'volley') {
      this.arrows(origin, to, c.color, style === 'arrow-rain', radius, a.duration);
      return;
    }
    if (style === 'meteor') {
      this.fire(to, radius, true, a.delay ?? 1.2);
      return;
    }
    if (style === 'life-tree' || style === 'spirit-totem') {
      this.totem(to, c.color, style === 'life-tree', a.duration);
      return;
    }
    if (style === 'life-drain') {
      this.beam(to, origin, c.color);
      this.sculpt('healing', origin, '#85f5ab', 1, 1);
      this.sculpt('curse-skull', to, c.color, 1, 1);
      return;
    }
    if (style === 'chain-lightning' || style === 'elemental-storm') {
      this.beam(origin, to, c.color, true);
      for (const enemy of state.entities
        .filter(
          (e) =>
            e.alive &&
            e.team !== source?.team &&
            Math.hypot(e.position.x - to.x, e.position.z - to.z) < radius + 1,
        )
        .slice(0, 6))
        this.beam(to, enemy.position, c.color, true);
      this.sculpt(style === 'elemental-storm' ? style : 'sound-wave', to, c.color, radius, 1.2);
      return;
    }
    if (style === 'rail-bolt' || style === 'spear-thrust') {
      this.beam(origin, to, c.color);
      this.sculpt(style, to, c.color, 1.5, 0.6, facing);
      return;
    }
    const support = a.target === 'team' || a.target === 'self';
    if (support && a.target === 'team') {
      for (const ally of state.entities.filter(
        (e) =>
          e.alive &&
          e.team === source?.team &&
          Math.hypot(e.position.x - origin.x, e.position.z - origin.z) <= a.radius,
      ))
        this.sculpt(
          style,
          ally.position,
          c.color,
          style === 'fortress' ? 3 : 1.8,
          life,
          facing,
          ally.id,
        );
    } else {
      const follow = support ? event.sourceId : undefined;
      this.sculpt(style, support ? origin : to, c.color, radius, life, facing, follow);
    }
    if (/cleave|slash|strike|blade|execution|whirl|dance|cuts|sweep|charge/.test(style))
      this.slash(
        origin,
        facing,
        c.color,
        Math.min(radius, 4),
        0,
        event.ultimate || /whirl|dance/.test(style),
      );
  }
  update(dt: number, state: MatchState) {
    for (const visual of [...this.visuals]) {
      const follow = visual.root.metadata?.follow;
      if (follow) {
        const actor = state.entities.find((e) => e.id === follow);
        if (actor) visual.root.position.copyFrom(point(actor.position));
      }
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
    for (const p of this.particles) {
      p.reset();
      p.start();
    }
    for (const shield of this.shields.values()) shield.dispose(false, true);
    this.shields.clear();
  }
  dispose() {
    this.clear();
    for (const p of this.particles) p.dispose(false);
    this.particles.clear();
    for (const mesh of this.templates.values()) mesh.dispose();
    for (const mat of this.palette.values()) mat.dispose();
    this.sprite.dispose();
  }
}
