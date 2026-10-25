import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { Zone } from '../core/types';
export function specialZone(scene: Scene, z: Zone): Mesh | undefined {
  if (!z.arena && !z.barrier && !z.trap) return;
  const root = new Mesh(
    z.arena ? 'titan-arena' : z.barrier ? 'paladin-shield-wall' : 'armed-mine',
    scene,
  );
  root.isPickable = false;
  const mat = (name: string, color: string, alpha = 1) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.emissiveColor = Color3.FromHexString(color).scale(0.55);
    m.specularColor = Color3.Black();
    m.alpha = alpha;
    m.backFaceCulling = false;
    return m;
  };
  if (z.arena && z.abilityId === 'guardian-4') {
    const boundary = MeshBuilder.CreateTorus(
      'titan-arena-ground-boundary',
      { diameter: z.radius * 2, thickness: 0.045, tessellation: 64 },
      scene,
    );
    boundary.parent = root;
    boundary.position.y = 0.03;
    boundary.material = mat('titan-arena-ground', z.color, 0.24);
    boundary.isPickable = false;
    return root;
  }
  const metal = mat('defense-bronze', '#cbb47c'),
    energy = mat('defense-energy', z.color, z.trap ? 1 : 0.27);
  const box = (
    name: string,
    x: number,
    y: number,
    zz: number,
    w: number,
    h: number,
    d: number,
    material: StandardMaterial,
  ) => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.parent = root;
    m.position.set(x, y, zz);
    m.material = material;
    m.isPickable = false;
    return m;
  };
  if (z.barrier) {
    root.rotation.y = z.barrier.facing;
    for (let i = -1; i <= 1; i++) box('shield-wall-panel', i * 3, 1.45, 0, 2.92, 2.9, 0.08, energy);
    box('shield-wall-top', 0, 2.92, 0, z.barrier.width, 0.11, 0.13, metal);
    for (const side of [-1, 1])
      box('shield-wall-edge', (side * z.barrier.width) / 2, 1.45, 0, 0.16, 3.1, 0.18, metal);
    for (let i = -2; i <= 2; i++)
      box('shield-wall-rune', i * 1.5, 1.6, 0.06, 0.13, 0.65, 0.08, metal);
  } else if (z.arena) {
    const count = 20,
      r = z.radius;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const wall = box(
        'arena-energy-boundary',
        Math.sin(a) * r,
        0.95,
        Math.cos(a) * r,
        (Math.PI * 2 * r) / count + 0.08,
        1.9,
        0.06,
        energy,
      );
      wall.rotation.y = a;
      if (i % 2 === 0) {
        const post = MeshBuilder.CreateCylinder(
          'arena-spear',
          { height: 2.7, diameterTop: 0, diameterBottom: 0.35, tessellation: 5 },
          scene,
        );
        post.parent = root;
        post.position.set(Math.sin(a) * r, 1.2, Math.cos(a) * r);
        post.material = metal;
        post.isPickable = false;
      }
    }
  } else {
    const shell = mat('mine-iron', '#384356');
    const body = MeshBuilder.CreateSphere('mine-shell', { diameter: 0.52, segments: 8 }, scene);
    body.parent = root;
    body.position.y = 0.25;
    body.material = shell;
    body.isPickable = false;
    const band = MeshBuilder.CreateTorus(
      'mine-brass-band',
      { diameter: 0.5, thickness: 0.055, tessellation: 12 },
      scene,
    );
    band.parent = root;
    band.position.y = 0.25;
    band.material = metal;
    band.isPickable = false;
    const fuse = box('mine-fuse', 0, 0.58, 0, 0.09, 0.22, 0.09, energy);
    root.metadata = { fuse };
  }
  return root;
}
