import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { seeded } from '../core/math';
import type { Vec2 } from '../core/types';

/** One batched mesh for the whole arena: bright, readable stylized leaves without alpha textures. */
export function toonGrass(scene: Scene, parent: TransformNode, patches: Vec2[]) {
  const random = seeded(724),
    positions: number[] = [],
    indices: number[] = [],
    colors: number[] = [],
    normals: number[] = [];
  for (const patch of patches)
    for (let tuft = 0; tuft < 32; tuft++) {
      const a = random() * Math.PI * 2,
        r = Math.sqrt(random()) * 1.75,
        x = patch.x + Math.cos(a) * r,
        z = patch.z + Math.sin(a) * r;
      for (let blade = 0; blade < 3; blade++) {
        const angle = random() * Math.PI * 2,
          w = 0.1 + random() * 0.12,
          h = 0.35 + random() * 0.45,
          dx = Math.cos(angle) * w,
          dz = Math.sin(angle) * w,
          n = positions.length / 3;
        positions.push(
          x - dx,
          0.06,
          z - dz,
          x + dx,
          0.06,
          z + dz,
          x + dx * 0.55,
          h * 0.7,
          z + dz * 0.55,
          x + Math.sin(angle) * 0.2,
          h,
          z - Math.cos(angle) * 0.2,
          x - dx * 0.55,
          h * 0.7,
          z - dz * 0.55,
        );
        indices.push(n, n + 1, n + 2, n, n + 2, n + 4, n + 4, n + 2, n + 3);
        colors.push(
          0.12,
          0.52,
          0.15,
          1,
          0.12,
          0.52,
          0.15,
          1,
          0.35,
          0.83,
          0.2,
          1,
          0.65,
          1,
          0.32,
          1,
          0.35,
          0.83,
          0.2,
          1,
        );
      }
    }
  const mesh = new Mesh('bright-arena-grass', scene),
    data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.colors = colors;
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh);
  mesh.parent = parent;
  mesh.isPickable = false;
  const material = new StandardMaterial('saturated-grass', scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.receiveShadows = true;
  return material;
}
