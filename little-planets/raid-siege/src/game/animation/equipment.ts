import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { ClassDef } from '../core/types';
/** Original accessories on the imported rig; no substitute humanoid geometry. */
export function equipClassAccessories(
  root: TransformNode,
  c: ClassDef,
  scene: Scene,
): StandardMaterial[] {
  const nodes = root.getChildTransformNodes();
  const right = nodes.find((n) => n.name.endsWith(':handslot.r')),
    left = nodes.find((n) => n.name.endsWith(':handslot.l')),
    head = nodes.find((n) => n.name.endsWith(':head'));
  if (!right) return [];
  const metal = new StandardMaterial(`${c.id}-steel`, scene);
  metal.diffuseColor = Color3.FromHexString('#b4c7ca');
  metal.specularColor = new Color3(0.5, 0.5, 0.5);
  const wood = new StandardMaterial(`${c.id}-wood`, scene);
  wood.diffuseColor = Color3.FromHexString('#5e4936');
  const magic = new StandardMaterial(`${c.id}-magic`, scene);
  magic.diffuseColor = Color3.FromHexString(c.color);
  magic.emissiveColor = Color3.FromHexString(c.color).scale(0.45);
  const tube = (
    name: string,
    points: number[][],
    radius: number,
    parent: TransformNode,
    material: StandardMaterial,
  ) => {
    const m = MeshBuilder.CreateTube(
      name,
      {
        path: points.map((p) => new Vector3(...(p as [number, number, number]))),
        radius,
        tessellation: 8,
      },
      scene,
    );
    m.parent = parent;
    m.material = material;
    return m;
  };
  const sword = (parent: TransformNode, scale = 1) => {
    const h = MeshBuilder.CreateCylinder(
      'sword-hilt',
      { height: 0.32, diameter: 0.07, tessellation: 8 },
      scene,
    );
    h.parent = parent;
    h.material = wood;
    const g = MeshBuilder.CreateCapsule(
      'crossguard',
      { height: 0.42, radius: 0.035, tessellation: 8 },
      scene,
    );
    g.rotation.z = Math.PI / 2;
    g.position.y = 0.17;
    g.parent = parent;
    g.material = metal;
    const blade = MeshBuilder.CreateCylinder(
      'forged-blade',
      { height: 1.15 * scale, diameterTop: 0, diameterBottom: 0.15, tessellation: 4 },
      scene,
    );
    blade.parent = parent;
    blade.position.y = 0.2 + 0.55 * scale;
    blade.material = metal;
  };
  if (c.weapon === 'bombs')
    for (const slot of [right, left].filter(Boolean) as TransformNode[]) {
      const body = MeshBuilder.CreateSphere('hand-bomb', { diameter: 0.35, segments: 10 }, scene);
      body.parent = slot;
      body.position.y = 0.1;
      body.material = metal;
      const band = MeshBuilder.CreateTorus(
        'hand-bomb-band',
        { diameter: 0.34, thickness: 0.035, tessellation: 12 },
        scene,
      );
      band.parent = slot;
      band.position.y = 0.1;
      band.material = magic;
      const fuse = MeshBuilder.CreateCylinder(
        'hand-bomb-fuse',
        { height: 0.18, diameter: 0.035, tessellation: 6 },
        scene,
      );
      fuse.parent = slot;
      fuse.position.y = 0.34;
      fuse.material = magic;
    }
  if (c.weapon === 'swords') {
    sword(right);
    if (left) sword(left, 0.85);
  }
  if (c.weapon === 'spear') {
    tube(
      'spear-shaft',
      [
        [0, -0.65, 0],
        [0, 1.7, 0],
      ],
      0.035,
      right,
      wood,
    );
    const blade = MeshBuilder.CreateCylinder(
      'spear-tip',
      { height: 0.55, diameterTop: 0, diameterBottom: 0.18, tessellation: 6 },
      scene,
    );
    blade.position.y = 1.95;
    blade.parent = right;
    blade.material = metal;
  }
  if (c.weapon === 'bow') {
    const pts = Array.from({ length: 19 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 18;
      return [0.36 * Math.cos(a), 0.8 * Math.sin(a), 0];
    });
    tube('longbow', pts, 0.035, right, wood);
    tube(
      'bow-string',
      [
        [0, -0.8, 0],
        [-0.08, 0, 0],
        [0, 0.8, 0],
      ],
      0.006,
      right,
      metal,
    );
  }
  if (c.weapon === 'lute') {
    if (left) {
      const body = MeshBuilder.CreateLathe(
        'lute-body',
        {
          shape: [
            new Vector3(0, -0.3, 0),
            new Vector3(0.18, -0.25, 0),
            new Vector3(0.28, 0, 0),
            new Vector3(0.22, 0.2, 0),
            new Vector3(0.08, 0.32, 0),
          ],
          tessellation: 16,
        },
        scene,
      );
      body.parent = left;
      body.scaling.z = 0.45;
      body.material = wood;
      tube(
        'lute-neck',
        [
          [0, 0.2, 0],
          [0, 0.85, 0],
        ],
        0.045,
        left,
        wood,
      );
      for (let i = 0; i < 4; i++)
        tube(
          'lute-string',
          [
            [i * 0.015 - 0.02, -0.1, -0.13],
            [i * 0.015 - 0.02, 0.85, -0.04],
          ],
          0.003,
          left,
          metal,
        );
    }
    sword(right, 0.65);
  }
  if (c.weapon === 'totem') {
    tube(
      'totem-staff',
      [
        [0, -0.6, 0],
        [0, 1.6, 0],
      ],
      0.05,
      right,
      wood,
    );
    for (const y of [1, 1.3, 1.6]) {
      const ring = MeshBuilder.CreateTorus(
        'totem-ring',
        { diameter: 0.32, thickness: 0.055, tessellation: 16 },
        scene,
      );
      ring.parent = right;
      ring.position.y = y;
      ring.material = magic;
    }
  }
  if (['firemage', 'icemage', 'necromancer', 'priest', 'druid'].includes(c.id) && head) {
    const crown = new TransformNode('class-crown', scene);
    crown.parent = head;
    crown.position.y = 0.6;
    const ring = MeshBuilder.CreateTorus(
      'arcane-crown',
      { diameter: c.id === 'druid' ? 0.8 : 0.65, thickness: 0.025, tessellation: 32 },
      scene,
    );
    ring.parent = crown;
    ring.material = magic;
    if (c.id === 'icemage')
      for (let i = 0; i < 5; i++) {
        const crystal = MeshBuilder.CreateCylinder(
          'ice-crystal',
          { height: 0.24, diameterTop: 0, diameterBottom: 0.09, tessellation: 5 },
          scene,
        );
        crystal.parent = crown;
        crystal.position.set(Math.cos(i * 1.25) * 0.3, 0.12, Math.sin(i * 1.25) * 0.3);
        crystal.material = magic;
      }
    if (c.id === 'priest') ring.rotation.x = Math.PI / 2;
  }
  return [metal, wood, magic];
}
