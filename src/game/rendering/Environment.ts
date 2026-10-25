import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { GameMap, Vec2 } from '../core/types';
import { seeded } from '../core/math';

type Shape = 'box' | 'round' | 'rock' | 'cone' | 'disc';
const THEMES = {
  'forgotten-ruins': {
    ground: '#8cd653',
    path: '#f7d687',
    wall: '#d79958',
    cap: '#ffe1a1',
    bush: '#31aa59',
    leaf: '#79e55c',
    edge: '#4b994d',
    roof: '#617ee5',
  },
  'ash-fortress': {
    ground: '#f1bd77',
    path: '#ffe1a0',
    wall: '#9b7ed5',
    cap: '#d9b7fc',
    bush: '#22b683',
    leaf: '#60e4a5',
    edge: '#b27b63',
    roof: '#ed668c',
  },
  'titan-sanctuary': {
    ground: '#6bd3a0',
    path: '#caec9a',
    wall: '#678dd4',
    cap: '#b1d5ff',
    bush: '#1fac76',
    leaf: '#71e998',
    edge: '#308f7d',
    roof: '#9c71df',
  },
};

/** Flat colors, chunky silhouettes and shared meshes keep combat readable on a phone. */
export class Environment {
  root: TransformNode;
  private materials = new Map<string, StandardMaterial>();
  private templates = new Map<string, Mesh>();
  private waterTexture?: DynamicTexture;
  constructor(private scene: Scene) {
    this.root = new TransformNode('environment', scene);
  }
  private material(color: string) {
    let material = this.materials.get(color);
    if (!material) {
      material = new StandardMaterial(`arena-${color}`, this.scene);
      material.diffuseColor = Color3.FromHexString(color);
      material.emissiveColor = Color3.FromHexString(color).scale(0.08);
      material.specularColor = Color3.Black();
      this.materials.set(color, material);
    }
    return material;
  }
  private part(
    shape: Shape,
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    rotation = 0,
  ) {
    const key = `${shape}-${color}`;
    let base = this.templates.get(key);
    if (!base) {
      base =
        shape === 'box'
          ? MeshBuilder.CreateBox(`arena-template-${key}`, { size: 1 }, this.scene)
          : shape === 'round'
            ? MeshBuilder.CreateSphere(
                `arena-template-${key}`,
                { diameter: 1, segments: 8 },
                this.scene,
              )
            : shape === 'rock'
              ? MeshBuilder.CreateIcoSphere(
                  `arena-template-${key}`,
                  { radius: 0.5, subdivisions: 1, flat: true },
                  this.scene,
                )
              : MeshBuilder.CreateCylinder(
                  `arena-template-${key}`,
                  {
                    height: 1,
                    diameter: 1,
                    diameterTop: shape === 'cone' ? 0 : 1,
                    tessellation: shape === 'disc' ? 24 : 8,
                  },
                  this.scene,
                );
      base.parent = this.root;
      base.material = this.material(color);
      base.isPickable = false;
      base.setEnabled(false);
      this.templates.set(key, base);
    }
    const mesh = base.createInstance(name);
    mesh.parent = this.root;
    mesh.position.set(x, y, z);
    mesh.scaling.set(w, h, d);
    mesh.rotation.y = rotation;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }
  private flag(x: number, z: number, color: string) {
    this.part('box', 'banner-pole', x, 1.25, z, 0.1, 2.5, 0.1, '#fff0c5');
    this.part('box', 'bright-banner', x + 0.4, 1.95, z, 0.8, 0.75, 0.08, color);
    this.part('round', 'banner-finial', x, 2.57, z, 0.22, 0.22, 0.22, '#ffd35b');
  }
  private bush(x: number, z: number, color: string, tip: string, size = 1) {
    this.part('disc', 'bush-ground-shade', x, -0.015, z, size * 2.8, 0.04, size * 2.2, color);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.399;
      this.part(
        'round',
        'rounded-bush',
        x + Math.sin(a) * size * 0.65,
        size * (0.35 + (i % 2) * 0.1),
        z + Math.cos(a) * size * 0.5,
        size * 1.45,
        size * 0.9,
        size * 1.2,
        i === 4 ? tip : color,
      );
    }
  }
  async build(map: GameMap) {
    const t = THEMES[map.id as keyof typeof THEMES] ?? THEMES['forgotten-ruins'];
    const random = seeded(123);
    const ground = MeshBuilder.CreateGround(
      'bright-arena-floor',
      { width: map.width + 6, height: map.depth + 6 },
      this.scene,
    );
    ground.parent = this.root;
    ground.position.y = -0.08;
    ground.material = this.material(t.ground);
    ground.receiveShadows = true;
    ground.isPickable = false;
    // Large, quiet color areas replace repeated high-frequency flagstone textures.
    this.part('box', 'main-sand-lane', 0, -0.055, 0, 11, 0.035, map.depth, t.path);
    for (const z of [map.spawns.A.z, ...map.points.map((p) => p.z), map.spawns.B.z]) {
      this.part('disc', 'open-arena-clearing', 0, -0.045, z, 22, 0.035, 15, t.path);
      this.part('box', 'cross-lane', 0, -0.05, z, map.width - 4, 0.035, 5, t.path);
    }
    // The footprint of every solid cover comes directly from the simulation map.
    for (const o of map.obstacles) {
      if (o.landmark || o.kind === 'river') continue;
      if (o.kind === 'rock') {
        this.part('rock', 'chunky-cover-rock', o.x, 0.72, o.z, o.w, 1.65, o.d, t.wall, 0.35);
        this.part(
          'rock',
          'sunlit-rock-cap',
          o.x - o.w * 0.08,
          1.14,
          o.z + 0.08,
          o.w * 0.75,
          0.65,
          o.d * 0.75,
          t.cap,
          0.35,
        );
      } else {
        const count = Math.max(1, Math.ceil(o.w / 2.6));
        for (let i = 0; i < count; i++) {
          const width = o.w / count;
          const x = o.x - o.w / 2 + width * (i + 0.5);
          const height = o.kind === 'pillar' ? 1.85 : 1.35;
          this.part('box', 'solid-cover', x, height / 2, o.z, width - 0.025, height, o.d, t.wall);
          this.part(
            'box',
            'cover-light-top',
            x,
            height,
            o.z,
            width - 0.055,
            0.16,
            o.d - 0.04,
            t.cap,
          );
        }
      }
      if (o.kind === 'wall' && o.w === 3.6 && o.d === 1.6)
        this.bush(o.x, o.z + 2.3, t.bush, t.leaf, 1.1);
    }
    // Low shrubs frame the lanes; there is no decorative rubble in the firing corridors.
    for (let z = -map.depth / 2 + 3; z < map.depth / 2; z += 6)
      for (const side of [-1, 1]) {
        this.bush(side * (map.width / 2 + 0.35), z, t.edge, t.leaf, 1.45);
        if (random() > 0.45) {
          const x = side * (map.width / 2 - 4.5);
          const clear = map.obstacles.every(
            (o) => Math.abs(o.x - x) > o.w / 2 + 2 || Math.abs(o.z - z) > o.d / 2 + 2,
          );
          const dry = (map.rivers ?? []).every((r) => Math.abs(r.z - z) > r.depth / 2 + 2);
          if (clear && dry) this.bush(x, z, t.bush, t.leaf, 0.85);
        }
      }
    for (const side of [-1, 1]) {
      this.part(
        'box',
        'arena-side-boundary',
        side * (map.width / 2 + 1.25),
        0.25,
        0,
        1,
        0.6,
        map.depth + 3,
        t.edge,
      );
      this.part(
        'box',
        'arena-end-boundary',
        0,
        0.25,
        side * (map.depth / 2 + 1.25),
        map.width + 3,
        0.6,
        1,
        t.edge,
      );
    }
    for (const landmark of map.landmarks ?? []) {
      const { x, z } = landmark.position;
      const r = landmark.radius;
      if (landmark.kind === 'garden') {
        for (let i = 0; i < 5; i++) {
          const a = i * 2.399,
            px = x + Math.sin(a) * (r - 1),
            pz = z + Math.cos(a) * (r - 1);
          this.part('disc', 'tree-ground-shade', px, -0.015, pz, 2.4, 0.04, 1.8, t.bush);
          this.part('disc', 'simple-tree-trunk', px, 0.9, pz, 0.45, 1.8, 0.45, '#a96f43');
          this.part('round', 'rounded-tree-crown', px, 2.05, pz, 2.3, 2.0, 2.2, t.bush);
          this.part('round', 'tree-lit-crown', px - 0.2, 2.65, pz + 0.1, 1.65, 1.1, 1.5, t.leaf);
        }
      } else if (landmark.kind === 'gate') {
        for (const side of [-1, 1]) this.flag(x + side * 4, z, '#637df3');
        // Existing map pillars provide the actual collision at each gate.
      } else if (landmark.kind === 'altar') {
        this.part('disc', 'sunlit-sanctum', x, -0.005, z, r * 1.55, 0.1, r * 1.55, t.cap);
        this.part('disc', 'sanctum-inlay', x, 0.052, z, r * 1.3, 0.025, r * 1.3, t.path);
        for (const side of [-1, 1]) {
          this.part(
            'box',
            'sanctum-pillar',
            x + side * (r + 0.5),
            0.65,
            z + 1,
            1.1,
            1.3,
            1.1,
            t.wall,
          );
          this.part(
            'rock',
            'sanctum-crystal',
            x + side * (r + 0.5),
            1.6,
            z + 1,
            0.8,
            1.2,
            0.8,
            '#72eaff',
          );
        }
      } else if (landmark.kind === 'fountain') {
        this.part('disc', 'simple-fountain-basin', x, 0.15, z, 5, 0.5, 5, t.cap);
        this.part('disc', 'clear-fountain-pool', x, 0.42, z, 4.2, 0.04, 4.2, '#42d9fa');
        this.part('rock', 'fountain-crystal', x, 1.0, z, 0.8, 1.6, 0.8, '#abf7ff');
      } else {
        for (const side of [-1, 1]) {
          this.part(
            'box',
            'camp-supply-crate',
            x + side * 2,
            0.55,
            z + 1,
            1.1,
            1.1,
            1.1,
            '#dc9450',
          );
          this.part(
            'box',
            'crate-bright-lid',
            x + side * 2,
            1.13,
            z + 1,
            1.1,
            0.12,
            1.1,
            '#ffe4a1',
          );
          this.part(
            'box',
            'crate-strap',
            x + side * 2,
            0.57,
            z + 0.435,
            0.16,
            1.0,
            0.035,
            '#ffe4a1',
          );
        }
        this.flag(x - 3.2, z + 2.5, '#f36b85');
      }
    }
    // Castle walls and river gaps use the same source data as the colliders.
    this.buildWater(map, t.cap);
    for (const castle of map.castles ?? []) {
      const { x, z } = castle.position,
        w = castle.width,
        d = castle.depth;
      const gate = Math.min(8, w * 0.55),
        wing = (w - gate) / 2;
      const wall = (cx: number, cz: number, ww: number, dd: number) => {
        this.part('box', 'pastel-castle-wall', cx, 0.85, cz, ww, 1.7, dd, t.wall);
        this.part('box', 'castle-sunlit-coping', cx, 1.75, cz, ww, 0.2, dd, t.cap);
        const count = Math.max(1, Math.floor(Math.max(ww, dd) / 2.2));
        for (let i = 0; i < count; i++) {
          const offset = (i + 0.5) / count - 0.5;
          this.part(
            'box',
            'chunky-castle-battlement',
            cx + (ww > dd ? offset * ww : 0),
            2.0,
            cz + (dd > ww ? offset * dd : 0),
            ww > dd ? 0.9 : dd,
            0.4,
            dd > ww ? 0.9 : dd,
            t.cap,
          );
        }
      };
      wall(x, z + d / 2, w, 1.4);
      wall(x - w / 2, z, 1.4, d);
      wall(x + w / 2, z, 1.4, d);
      wall(x - (gate + wing) / 2, z - d / 2, wing, 1.4);
      wall(x + (gate + wing) / 2, z - d / 2, wing, 1.4);
      for (const side of [-1, 1]) {
        this.flag(x + side * (gate / 2 + wing / 2), z - d / 2 - 0.8, t.roof);
        for (const end of [-1, 1]) {
          const tx = x + (side * w) / 2,
            tz = z + (end * d) / 2;
          this.part('disc', 'toy-castle-tower', tx, 1.25, tz, 3.4, 2.5, 3.4, t.wall);
          this.part('disc', 'tower-cream-rim', tx, 2.5, tz, 3.5, 0.22, 3.5, t.cap);
          this.part('cone', 'bright-castle-roof', tx, 3.25, tz, 3.7, 1.3, 3.7, t.roof);
          this.part('round', 'gold-roof-tip', tx, 3.95, tz, 0.3, 0.3, 0.3, '#ffe17b');
          this.part('box', 'tower-window', tx, 1.55, tz - 1.705, 0.45, 0.75, 0.04, '#52679c');
        }
      }
    }
  }
  private buildWater(map: GameMap, bank: string) {
    if (!map.rivers?.length) return;
    const texture = new DynamicTexture(
      'simple-blue-current',
      { width: 256, height: 128 },
      this.scene,
      false,
    );
    const ctx = texture.getContext();
    ctx.fillStyle = '#2fb9f1';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#97efff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const x = (i * 71) % 256,
        y = 12 + ((i * 37) % 104);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 9, y + 3, x + 23, y);
      ctx.stroke();
    }
    texture.update();
    texture.uScale = map.width / 12;
    this.waterTexture = texture;
    const water = this.material('#ffffff');
    water.diffuseTexture = texture;
    water.emissiveColor.setAll(0.12);
    for (const river of map.rivers) {
      const surface = MeshBuilder.CreateGround(
        'bright-blue-river',
        { width: map.width, height: river.depth },
        this.scene,
      );
      surface.parent = this.root;
      surface.position.set(0, 0.015, river.z);
      surface.material = water;
      surface.isPickable = false;
      for (const side of [-1, 1])
        this.part(
          'box',
          'clean-river-bank',
          0,
          0.025,
          river.z + side * (river.depth / 2 + 0.18),
          map.width,
          0.16,
          0.36,
          bank,
        );
      for (const bridge of river.bridges) {
        const length = river.depth + 1.2;
        this.part(
          'box',
          'bridge-flat-deck',
          bridge.x,
          0.02,
          river.z,
          bridge.width,
          0.16,
          length,
          '#dc9a54',
        );
        for (let i = 0; i < Math.ceil(length / 0.75); i++)
          this.part(
            'box',
            'bridge-wide-plank',
            bridge.x,
            0.12,
            river.z - length / 2 + ((i + 0.5) * length) / Math.ceil(length / 0.75),
            bridge.width - 0.1,
            0.08,
            0.65,
            '#ffce7d',
          );
        for (const side of [-1, 1]) {
          const x = bridge.x + side * (bridge.width / 2 + 0.1);
          this.part(
            'box',
            'bridge-low-rail',
            x,
            0.55,
            river.z,
            0.18,
            0.18,
            length + 0.3,
            '#f8dc9a',
          );
          for (const end of [-1, 1])
            this.part(
              'box',
              'bridge-end-post',
              x,
              0.35,
              river.z + (end * length) / 2,
              0.4,
              0.8,
              0.4,
              '#bd7c47',
            );
        }
      }
    }
  }
  update(time: number, _focus?: Vec2) {
    if (this.waterTexture) this.waterTexture.uOffset = (time * 0.035) % 1;
  }
  dispose() {
    this.root.dispose();
    this.waterTexture?.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.templates.clear();
  }
}
