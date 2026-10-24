import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { GameMap, Vec2 } from '../core/types';
import { seeded } from '../core/math';
import { AssetLibrary } from './assets';
import { ancientStoneTextures } from './stoneTexture';
import { toonGrass } from './toonFoliage';
export class Environment {
  root: TransformNode;
  private disposed = false;
  private effects: Mesh[] = [];
  private ownedMaterials: (PBRMaterial | StandardMaterial)[] = [];
  private textures: DynamicTexture[] = [];
  private lights: PointLight[] = [];
  private torchPositions: Vec2[] = [];
  constructor(
    private scene: Scene,
    private assets: AssetLibrary,
  ) {
    this.root = new TransformNode('environment', scene);
  }
  async build(map: GameMap) {
    const random = seeded(123);
    const ground = MeshBuilder.CreateGround(
      'foundation',
      { width: map.width + 4, height: map.depth + 4 },
      this.scene,
    );
    ground.parent = this.root;
    ground.position.y = -0.16;
    ground.receiveShadows = true;
    const mat = new PBRMaterial('foundation-stone', this.scene);
    this.ownedMaterials.push(mat);
    mat.albedoColor = Color3.FromHexString('#384544');
    mat.roughness = 1;
    ground.material = mat;
    const names = [
      'floor_tile_large',
      'floor_tile_small_weeds_A',
      'pillar_decorated',
      'wall_broken',
      'wall',
      'wall_arched',
      'rubble_large',
      'torch_lit',
      'banner_blue',
      'chest_gold',
    ];
    await Promise.all(names.map((n) => this.assets.load(n)));
    if (this.disposed) return;
    const stoneMaps = ancientStoneTextures(this.scene);
    this.textures.push(stoneMaps.albedo, stoneMaps.normal);
    const floor = new PBRMaterial('detailed-dungeon-stone', this.scene);
    floor.albedoTexture = stoneMaps.albedo;
    floor.bumpTexture = stoneMaps.normal;
    floor.roughness = 0.88;
    floor.metallic = 0.04;
    floor.albedoColor.setAll(1);
    this.ownedMaterials.push(floor);
    for (const mesh of (await this.assets.load('floor_tile_large')).meshes) {
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      if (!positions) continue;
      const uv: number[] = [];
      for (let i = 0; i < positions.length; i += 3)
        uv.push(positions[i] / 4 + 0.5, positions[i + 2] / 4 + 0.5);
      mesh.setVerticesData(VertexBuffer.UVKind, uv);
      mesh.material = floor;
    }
    const place = async (
      name: string,
      x: number,
      z: number,
      sx = 1,
      sy = sx,
      sz = sx,
      rotation = 0,
    ) => {
      const container = await this.assets.load(name);
      if (this.disposed) return undefined;
      const inst = container.instantiateModelsToScene((n) => `${name}-${x}-${z}:${n}`, false, {
        doNotInstantiate: false,
      });
      const r = new TransformNode(`${name}-instance`, this.scene);
      r.parent = this.root;
      r.position.set(x, 0, z);
      r.scaling.set(sx, sy, sz);
      r.rotation.y = rotation;
      for (const node of inst.rootNodes) node.parent = r;
      for (const mesh of r.getChildMeshes()) {
        mesh.receiveShadows = true;
        mesh.isPickable = false;
      }
      return r;
    };
    const jobs: Promise<unknown>[] = [];
    for (let x = -map.width / 2 + 2; x < map.width / 2; x += 4)
      for (let z = -map.depth / 2 + 2; z < map.depth / 2; z += 4)
        jobs.push(place('floor_tile_large', x, z, 1, 1, 1, random() > 0.5 ? Math.PI : 0));
    for (const o of map.obstacles) {
      if (o.kind === 'pillar') jobs.push(place('pillar_decorated', o.x, o.z, 0.75, 1.1, 0.75));
      else if (o.kind === 'rock') jobs.push(place('rubble_large', o.x, o.z, 1.4, 1.4, 1.4));
      else
        for (let x = o.x - o.w / 2 + 1; x < o.x + o.w / 2; x += 2)
          jobs.push(place(random() > 0.6 ? 'wall_broken' : 'wall', x, o.z, 0.5, 0.55, 1));
    }
    // Broken arcades and silhouettes frame the arena; all combat blockers match map obstacles.
    for (let z = -map.depth / 2; z <= map.depth / 2; z += 4) {
      jobs.push(
        place(
          random() > 0.35 ? 'wall_broken' : 'wall_arched',
          -map.width / 2 - 0.7,
          z,
          1.5,
          0.8,
          1.5,
          Math.PI / 2,
        ),
      );
      jobs.push(
        place(
          random() > 0.35 ? 'wall_broken' : 'wall_arched',
          map.width / 2 + 0.7,
          z,
          1.5,
          0.8,
          1.5,
          Math.PI / 2,
        ),
      );
    }
    for (let x = -map.width / 2; x <= map.width / 2; x += 4)
      jobs.push(place('wall_arched', x, map.depth / 2 + 0.5, 1.7, 0.9, 1.7));
    for (let i = 0; i < 16; i++) {
      const x = (random() > 0.5 ? 1 : -1) * (map.width / 2 - 2),
        z = (random() - 0.5) * map.depth;
      jobs.push(
        place('rubble_large', x, z, 0.5 + random(), 0.4 + random(), 0.5 + random(), random() * 6),
      );
    }
    for (const z of [-map.depth / 2 + 5, -6, 10, map.depth / 2 - 5])
      for (const x of [-7.5, 7.5]) {
        this.torchPositions.push({ x, z });
        jobs.push(place('torch_lit', x, z, 1.4));
        const flame = MeshBuilder.CreateSphere('flame', { diameter: 0.2, segments: 6 }, this.scene);
        flame.parent = this.root;
        flame.position.set(x, 0.95, z);
        const fmat = new StandardMaterial('ember', this.scene);
        this.ownedMaterials.push(fmat);
        fmat.emissiveColor = Color3.FromHexString('#ffa24f');
        fmat.disableLighting = true;
        flame.material = fmat;
        this.effects.push(flame);
      }
    for (let i = 0; i < 2; i++) {
      const light = new PointLight('warm-brazier-' + i, new Vector3(0, 1.3, 0), this.scene);
      light.diffuse = Color3.FromHexString('#ffab58');
      light.specular = Color3.FromHexString('#ffc078');
      light.range = 10;
      light.intensity = 8;
      this.lights.push(light);
    }
    for (const side of [-1, 1]) {
      jobs.push(place('pillar_decorated', side * 6, -map.depth / 2 + 7, 0.7, 1, 0.7));
      jobs.push(place('banner_blue', side * 5.7, -map.depth / 2 + 7, 0.9));
      for (const z of [-18, 2, 17])
        jobs.push(place('floor_tile_small_weeds_A', side * (9 + random() * 4), z, 1));
    }
    const patches: Vec2[] = [];
    for (const z of [-map.depth / 2 + 5, -map.depth / 2 + 14, -5, 6, map.depth / 2 - 7])
      for (const x of [-9, 9]) patches.push({ x, z });
    this.ownedMaterials.push(toonGrass(this.scene, this.root, patches));
    const gemMat = new PBRMaterial('bright-enchanted-crystals', this.scene);
    gemMat.albedoColor = Color3.FromHexString('#32d5f4').toLinearSpace();
    gemMat.emissiveColor = Color3.FromHexString('#1687b7').scale(0.25);
    gemMat.metallic = 0.1;
    gemMat.roughness = 0.4;
    this.ownedMaterials.push(gemMat);
    for (const z of [-map.depth / 2 + 8, 8, map.depth / 2 - 5])
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const gem = MeshBuilder.CreatePolyhedron(
            'arena-crystal',
            { type: 1, size: 0.35 + i * 0.12 },
            this.scene,
          );
          gem.parent = this.root;
          gem.position.set(side * (6.2 + i * 0.4), 0.5 + i * 0.12, z + i * 0.25);
          gem.scaling.y = 1.5;
          gem.rotation.z = side * 0.2;
          gem.material = gemMat;
        }
    // A raised rune dais and concentric inlays establish the destination.
    const z = map.points[0]?.z ?? 25;
    const stone = MeshBuilder.CreateCylinder(
      'dais',
      { diameter: 11, height: 0.16, tessellation: 64 },
      this.scene,
    );
    stone.parent = this.root;
    stone.position.set(0, -0.025, z);
    stone.material = mat;
    stone.receiveShadows = true;
    for (const diameter of [9, 10.4]) {
      const ring = MeshBuilder.CreateTorus(
        'inlay',
        { diameter, thickness: 0.035, tessellation: 80 },
        this.scene,
      );
      ring.parent = this.root;
      ring.position.set(0, 0.07, z);
      const rmat = new StandardMaterial('rune', this.scene);
      this.ownedMaterials.push(rmat);
      rmat.emissiveColor = Color3.FromHexString('#7d9f98').scale(0.5);
      rmat.diffuseColor = Color3.FromHexString('#829d93');
      ring.material = rmat;
    }
    await Promise.all(jobs);
  }
  update(time: number, focus?: Vec2) {
    for (let i = 0; i < this.effects.length; i++) {
      const f = this.effects[i];
      f.scaling.setAll(1 + Math.sin(time * 7 + i) * 0.15);
    }
    if (focus) {
      const nearest = [...this.torchPositions].sort(
        (a, b) =>
          Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z),
      );
      this.lights.forEach((light, i) => {
        const p = nearest[i];
        if (p) light.position.set(p.x, 1.3, p.z);
        light.intensity = 8 + Math.sin(time * 7 + i) * 0.5;
      });
    }
  }
  dispose() {
    this.disposed = true;
    this.root.dispose();
    for (const light of this.lights) light.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials = [];
  }
}
