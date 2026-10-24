import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { GameMap } from '../core/types';

type Place = (
  name: string,
  x: number,
  z: number,
  sx?: number,
  sy?: number,
  sz?: number,
  rotation?: number,
) => Promise<unknown>;
/** Static architecture is instanced; water moves through texture coordinates, not rebuilt meshes. */
export async function buildRiverCastles(
  scene: Scene,
  root: TransformNode,
  map: GameMap,
  place: Place,
) {
  const materials: PBRMaterial[] = [],
    textures: DynamicTexture[] = [];
  const material = (name: string, color: string) => {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = Color3.FromHexString(color).toLinearSpace();
    mat.roughness = 0.85;
    materials.push(mat);
    return mat;
  };
  const stone = material('castle-cut-stone', '#d1d6cc'),
    wood = material('bridge-aged-oak', '#96704b'),
    roof = material('castle-slate-roofs', map.id === 'ash-fortress' ? '#9a5263' : '#3c748c'),
    metal = material('bridge-ironwork', '#4e5a62'),
    water = material('flowing-river', '#37b6ce');
  metal.metallic = 0.7;
  metal.roughness = 0.55;
  water.roughness = 0.32;
  water.metallic = 0.15;
  water.emissiveColor = Color3.FromHexString('#064d6e');
  const masonry = new DynamicTexture('castle-masonry', { width: 256, height: 256 }, scene, false);
  textures.push(masonry);
  const ctx = masonry.getContext();
  ctx.fillStyle = '#53636a';
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++)
    for (let col = -1; col < 5; col++) {
      const x = col * 64 + (row % 2) * 32,
        y = row * 32;
      const shade = 146 + ((row * 19 + col * 11 + 31) % 31);
      const gradient = ctx.createLinearGradient(x, y, x + 64, y + 32);
      gradient.addColorStop(0, `rgb(${shade + 32},${shade + 36},${shade + 31})`);
      gradient.addColorStop(1, `rgb(${shade - 14},${shade - 6},${shade - 4})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 2, y + 2, 60, 28);
      ctx.strokeStyle = '#edf3df55';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3, y + 3, 58, 26);
    }
  masonry.update();
  stone.albedoTexture = masonry;
  const flow = new DynamicTexture(
    'river-current-ripples',
    { width: 256, height: 128 },
    scene,
    false,
  );
  textures.push(flow);
  const fctx = flow.getContext();
  const blue = fctx.createLinearGradient(0, 0, 0, 128);
  blue.addColorStop(0, '#167caa');
  blue.addColorStop(0.5, '#31b7cb');
  blue.addColorStop(1, '#156f9e');
  fctx.fillStyle = blue;
  fctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 35; i++) {
    const x = (i * 71) % 256,
      y = (i * 37) % 128;
    fctx.strokeStyle = i % 3 ? '#b9f2e966' : '#78deda88';
    fctx.lineWidth = 1 + (i % 2);
    fctx.beginPath();
    fctx.moveTo(x, y);
    fctx.bezierCurveTo(x + 10, y - 4, x + 25, y + 4, x + 38, y);
    fctx.stroke();
  }
  flow.update();
  flow.uScale = map.width / 8;
  water.albedoTexture = flow;
  const templates = new Map<string, Mesh>();
  const part = (
    kind: 'box' | 'tower' | 'roof',
    name: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat: PBRMaterial,
    rotation = 0,
  ) => {
    const key = kind + mat.name;
    let base = templates.get(key);
    if (!base) {
      base =
        kind === 'box'
          ? MeshBuilder.CreateBox('architecture-template-' + key, { size: 1 }, scene)
          : MeshBuilder.CreateCylinder(
              'architecture-template-' + key,
              {
                height: 1,
                diameterBottom: 1,
                diameterTop: kind === 'roof' ? 0 : 1,
                tessellation: 12,
              },
              scene,
            );
      base.material = mat;
      base.parent = root;
      base.isPickable = false;
      base.setEnabled(false);
      templates.set(key, base);
    }
    const mesh = base.createInstance(name);
    mesh.parent = root;
    mesh.position.set(x, y, z);
    mesh.scaling.set(sx, sy, sz);
    mesh.rotation.y = rotation;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  };
  const jobs: Promise<unknown>[] = [];
  for (const river of map.rivers ?? []) {
    const surface = MeshBuilder.CreateGround(
      'river-water',
      { width: map.width, height: river.depth },
      scene,
    );
    surface.parent = root;
    surface.position.set(0, 0.015, river.z);
    surface.material = water;
    surface.isPickable = false;
    for (const side of [-1, 1])
      part(
        'box',
        'river-bank-stone',
        0,
        -0.01,
        river.z + side * (river.depth / 2 + 0.2),
        map.width,
        0.12,
        0.4,
        stone,
      );
    for (const bridge of river.bridges) {
      const span = river.depth + 2.4;
      const count = Math.ceil(span / 0.45);
      for (let i = 0; i < count; i++)
        part(
          'box',
          'bridge-oak-plank',
          bridge.x,
          0.06,
          river.z - span / 2 + ((i + 0.5) * span) / count,
          bridge.width,
          0.16,
          span / count - 0.025,
          wood,
        );
      for (const side of [-1, 1]) {
        const x = bridge.x + side * (bridge.width / 2 + 0.18);
        part('box', 'bridge-top-rail', x, 0.65, river.z, 0.16, 0.16, span + 0.4, wood);
        part('box', 'bridge-iron-rail', x, 0.33, river.z, 0.08, 0.08, span, metal);
        for (const end of [-1, 1]) {
          part(
            'box',
            'bridge-carved-endpost',
            x,
            0.4,
            river.z + end * (span / 2),
            0.38,
            0.85,
            0.38,
            stone,
          );
          part(
            'tower',
            'bridge-masonry-pier',
            x,
            -0.2,
            river.z + end * river.depth * 0.3,
            0.8,
            0.85,
            0.8,
            stone,
          );
          jobs.push(place('torch_lit', x, river.z + end * (span / 2), 0.42));
        }
      }
    }
  }
  for (const castle of map.castles ?? []) {
    const { x, z } = castle.position,
      w = castle.width,
      d = castle.depth,
      gate = Math.min(8, w * 0.55),
      wing = (w - gate) / 2;
    const wall = (cx: number, cz: number, ww: number, dd: number) => {
      part('box', 'castle-masonry-wall', cx, 1.1, cz, ww, 2.2, dd, stone);
      const length = Math.max(ww, dd),
        count = Math.max(1, Math.floor(length / 1.8));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count - 0.5;
        part(
          'box',
          'castle-wall-battlement',
          cx + (ww > dd ? t * ww : 0),
          2.45,
          cz + (dd > ww ? t * dd : 0),
          ww > dd ? 0.85 : dd,
          0.55,
          dd > ww ? 0.85 : dd,
          stone,
        );
      }
    };
    wall(x, z + d / 2, w, 1.4);
    wall(x - w / 2, z, 1.4, d);
    wall(x + w / 2, z, 1.4, d);
    wall(x - (gate + wing) / 2, z - d / 2, wing, 1.4);
    wall(x + (gate + wing) / 2, z - d / 2, wing, 1.4);
    part('box', 'castle-gate-lintel', x, 3.15, z - d / 2, gate + 1.2, 0.65, 1.6, stone);
    for (const side of [-1, 1]) {
      part(
        'box',
        'castle-gate-jamb',
        x + side * (gate / 2 + 0.35),
        1.5,
        z - d / 2,
        0.7,
        3,
        1.6,
        stone,
      );
      jobs.push(
        place(
          map.id === 'ash-fortress' ? 'banner_red' : 'banner_blue',
          x + side * (gate / 2 + wing / 2),
          z - d / 2 - 0.85,
          0.8,
        ),
      );
    }
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const tx = x + (side * w) / 2,
          tz = z + (end * d) / 2;
        part('tower', 'castle-round-tower', tx, 2.1, tz, 3.5, 4.2, 3.5, stone);
        part('tower', 'castle-tower-cornice', tx, 4.15, tz, 3.9, 0.35, 3.9, stone);
        part('roof', 'castle-conical-slate-roof', tx, 5.25, tz, 4.2, 2, 4.2, roof);
        part('box', 'castle-tower-finial', tx, 6.42, tz, 0.16, 0.45, 0.16, metal);
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5;
          part(
            'box',
            'castle-tower-window',
            tx + Math.sin(angle) * 1.76,
            3.05,
            tz + Math.cos(angle) * 1.76,
            0.27,
            0.68,
            0.06,
            metal,
            angle,
          );
        }
      }
  }
  await Promise.all(jobs);
  return { materials, textures, flow };
}
