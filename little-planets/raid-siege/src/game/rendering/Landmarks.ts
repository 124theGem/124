import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { GameMap } from '../core/types';
import { toonGrass } from './toonFoliage';

type Place = (
  name: string,
  x: number,
  z: number,
  sx?: number,
  sy?: number,
  sz?: number,
  rotation?: number,
) => Promise<unknown>;
/** Named destinations use the same licensed architectural models as the rest of the world. */
export async function buildLandmarks(
  scene: Scene,
  root: TransformNode,
  map: GameMap,
  place: Place,
) {
  const materials: (PBRMaterial | StandardMaterial)[] = [],
    textures: DynamicTexture[] = [];
  const stone = new PBRMaterial('landmark-carved-marble', scene);
  stone.albedoColor = Color3.FromHexString(
    map.id === 'ash-fortress' ? '#a98677' : '#c4c8ac',
  ).toLinearSpace();
  stone.roughness = 0.88;
  materials.push(stone);
  const bronze = new PBRMaterial('landmark-aged-bronze', scene);
  bronze.albedoColor = Color3.FromHexString('#dba859').toLinearSpace();
  bronze.metallic = 0.55;
  bronze.roughness = 0.55;
  materials.push(bronze);
  const canopy = new PBRMaterial('silver-grove-leaves', scene);
  canopy.albedoColor = Color3.FromHexString(
    map.id === 'titan-sanctuary' ? '#54b8a2' : '#699643',
  ).toLinearSpace();
  canopy.roughness = 1;
  materials.push(canopy);
  const bark = new PBRMaterial('grove-bark', scene);
  bark.albedoColor = Color3.FromHexString('#795e49').toLinearSpace();
  bark.roughness = 1;
  materials.push(bark);
  const trunk = MeshBuilder.CreateCylinder(
    'grove-tree-template',
    { height: 3, diameterBottom: 0.5, diameterTop: 0.25, tessellation: 7 },
    scene,
  );
  trunk.parent = root;
  trunk.material = bark;
  trunk.setEnabled(false);
  const crown = MeshBuilder.CreateIcoSphere(
    'grove-crown-template',
    { radius: 1, subdivisions: 2 },
    scene,
  );
  crown.parent = root;
  crown.material = canopy;
  crown.setEnabled(false);
  const water = new StandardMaterial('moonwell-water', scene);
  water.diffuseColor = Color3.FromHexString('#31bed9');
  water.emissiveColor = Color3.FromHexString('#146a9b');
  water.specularColor = Color3.FromHexString('#d4f8ff');
  materials.push(water);
  const ripples = new DynamicTexture(
    'engraved-water-ripples',
    { width: 256, height: 256 },
    scene,
    false,
  );
  textures.push(ripples);
  const ctx = ripples.getContext();
  ctx.fillStyle = '#18798f';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = i % 2 ? '#4bdbdb88' : '#c9fbf233';
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.ellipse(128, 128, 9 + i * 7, 9 + i * 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ripples.update();
  water.diffuseTexture = ripples;
  const jobs: Promise<unknown>[] = [];
  for (const landmark of map.landmarks ?? []) {
    const { x, z } = landmark.position,
      r = landmark.radius;
    if (landmark.kind === 'gate') {
      jobs.push(place('wall_arched', x, z, 1.7, 1.35, 1.1));
      for (const side of [-1, 1]) {
        jobs.push(place('pillar_decorated', x + side * 4, z, 0.75, 1.1, 0.75));
        jobs.push(
          place(
            map.id === 'ash-fortress' ? 'banner_red' : 'banner_blue',
            x + side * 4,
            z - 0.8,
            0.85,
          ),
        );
        jobs.push(place('torch_lit', x + side * 5.3, z - 2, 0.9));
      }
      for (let i = 0; i < 4; i++)
        jobs.push(place('floor_tile_small_broken_A', x + (i - 1.5) * 1.2, z + 2.5, 0.8));
    } else if (landmark.kind === 'altar') {
      const dais = MeshBuilder.CreateCylinder(
        'engraved-sanctum-platform',
        { diameter: r * 1.55, height: 0.15, tessellation: 12 },
        scene,
      );
      dais.parent = root;
      dais.position.set(x, -0.015, z);
      dais.material = stone;
      dais.receiveShadows = true;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4,
          marker = MeshBuilder.CreateBox(
            'sanctum-gold-inlay',
            { width: 0.16, height: 0.025, depth: 0.8 },
            scene,
          );
        marker.parent = root;
        marker.position.set(x + Math.sin(a) * r * 0.62, 0.075, z + Math.cos(a) * r * 0.62);
        marker.rotation.y = a;
        marker.material = bronze;
      }
      for (const side of [-1, 1]) {
        jobs.push(place('column', x + side * (r + 0.5), z + 1, 0.9));
        jobs.push(place('torch_lit', x + side * (r - 1), z + 3, 1.15));
      }
      jobs.push(place('stairs_wide', x, z - r, 1.4, 0.15, 0.5));
    } else if (landmark.kind === 'fountain') {
      const basin = MeshBuilder.CreateCylinder(
        'moonwell-carved-basin',
        { diameter: 5.1, height: 0.4, tessellation: 12 },
        scene,
      );
      basin.parent = root;
      basin.position.set(x, 0.08, z);
      basin.material = stone;
      basin.receiveShadows = true;
      const pool = MeshBuilder.CreateDisc(
        'moonwell-reflecting-pool',
        { radius: 2.15, tessellation: 48 },
        scene,
      );
      pool.parent = root;
      pool.rotation.x = Math.PI / 2;
      pool.position.set(x, 0.3, z);
      pool.material = water;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        jobs.push(place('column', x + Math.sin(a) * 2.7, z + Math.cos(a) * 2.7, 0.28, 0.45, 0.28));
      }
    } else if (landmark.kind === 'garden') {
      const patches = [];
      for (let i = 0; i < 5; i++) {
        const a = i * 2.399,
          px = x + Math.sin(a) * (r - 1),
          pz = z + Math.cos(a) * (r - 1);
        const stem = trunk.createInstance('grove-tree-trunk');
        stem.parent = root;
        stem.position.set(px, 1.5, pz);
        stem.isPickable = false;
        for (let j = 0; j < 3; j++) {
          const leaves = crown.createInstance('layered-grove-canopy');
          leaves.parent = root;
          leaves.position.set(
            px + Math.sin(j * 2.1) * 0.6,
            3 + j * 0.35,
            pz + Math.cos(j * 2.1) * 0.6,
          );
          leaves.scaling.set(1.3, 0.7, 1.15);
          leaves.isPickable = false;
        }
        patches.push({ x: px, z: pz });
      }
      materials.push(toonGrass(scene, root, patches));
      jobs.push(place('rubble_large', x, z + 1, 0.45));
    } else {
      for (const side of [-1, 1]) {
        jobs.push(place('barrel_large', x + side * 2, z + 1, 0.8));
        jobs.push(place('chest', x + side * 1.7, z - 1.4, 0.75, 0.75, 0.75, side * 0.35));
        jobs.push(place('banner_red', x + side * 3, z + 2.5, 0.85));
      }
      jobs.push(place('torch_lit', x, z + 3, 1));
    }
  }
  await Promise.all(jobs);
  return { materials, textures };
}
