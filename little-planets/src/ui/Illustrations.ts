import * as T from "three";
import { Models } from "../world/Models";
import {
  GEAR,
  type GearKind,
  type BuildingKind,
  type FurnitureKind,
} from "../../shared/catalog";
const kit = new Models(),
  cache = new Map<string, string>();
/** Illustrated recipe plates rendered from the actual 3D models as shaded vector scenes. */
export function illustration(id: string): string {
  if (cache.has(id)) return cache.get(id)!;
  const [type, value] = id.split(":"),
    root = new T.Group();
  let model: T.Group;
  if (type === "gear") model = kit.gear(value as GearKind);
  else if (type === "kit") model = kit.building(value as BuildingKind, "home");
  else if (type === "furniture") model = kit.furniture(value as FurnitureKind);
  else model = kit.plant(value);
  root.add(model);
  const box = new T.Box3().setFromObject(model),
    center = box.getCenter(new T.Vector3());
  model.position.sub(center);
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root),
    span = bounds.getSize(new T.Vector3()).length() * 0.57,
    camera = new T.OrthographicCamera(
      -span * 1.4,
      span * 1.4,
      span,
      -span,
      0.1,
      100,
    );
  camera.position.set(7, 5.6, 8);
  camera.lookAt(0, -0.05, 0);
  camera.updateMatrixWorld();
  const triangles: { d: number; points: string; color: string }[] = [],
    a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    normal = new T.Vector3(),
    light = new T.Vector3(-0.5, 1, 0.8).normalize(),
    toCamera = new T.Vector3().copy(camera.position).normalize();
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const pos = o.geometry.getAttribute("position"),
      index = o.geometry.index,
      material = o.material as T.MeshStandardMaterial,
      n = index ? index.count : pos.count;
    const count = o instanceof T.InstancedMesh ? o.count : 1;
    for (let instance = 0; instance < count; instance++) {
      const matrix = o.matrixWorld.clone();
      if (o instanceof T.InstancedMesh) {
        const local = new T.Matrix4();
        o.getMatrixAt(instance, local);
        matrix.multiply(local);
      }
      for (let i = 0; i < n; i += 3) {
        a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(
          matrix,
        );
        b.fromBufferAttribute(
          pos,
          index ? index.getX(i + 1) : i + 1,
        ).applyMatrix4(matrix);
        c.fromBufferAttribute(
          pos,
          index ? index.getX(i + 2) : i + 2,
        ).applyMatrix4(matrix);
        normal
          .crossVectors(
            new T.Vector3().subVectors(b, a),
            new T.Vector3().subVectors(c, a),
          )
          .normalize();
        if (normal.dot(toCamera) < 0.001) continue;
        const d =
            a.distanceToSquared(camera.position) +
            b.distanceToSquared(camera.position) +
            c.distanceToSquared(camera.position),
          color = material.color
            .clone()
            .multiplyScalar(0.72 + Math.max(0, normal.dot(light)) * 0.48)
            .getHexString(T.SRGBColorSpace);
        const points = [a, b, c]
          .map((v) => {
            const p = v.clone().project(camera);
            return `${((p.x + 1) * 160).toFixed(1)},${((1 - p.y) * 110).toFixed(1)}`;
          })
          .join(" ");
        triangles.push({ d, points, color });
      }
    }
  });
  triangles.sort((a, b) => b.d - a.d);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#78ddd1" opacity=".07"/></pattern></defs><rect width="320" height="220" fill="#101b25"/><rect width="320" height="220" fill="url(#grid)"/><path d="M160 15V205M15 110H305" stroke="#78ddd1" opacity=".12" stroke-dasharray="3 6"/><ellipse cx="160" cy="183" rx="87" ry="12" fill="#030a10" opacity=".5"/>${triangles.map((t) => `<polygon points="${t.points}" fill="#${t.color}" stroke="#${t.color}" stroke-width=".35"/>`).join("")}<path d="M15 30V15H30M290 15h15v15M15 190v15h15M290 205h15v-15" fill="none" stroke="#78ddd1" opacity=".45"/><text x="20" y="198" fill="#78ddd1" opacity=".5" font-family="monospace" font-size="7">AURORA / MODEL PREVIEW</text></svg>`;
  const result = `<img class="recipe-illustration" src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="Модель предмета" loading="lazy">`;
  cache.set(id, result);
  return result;
}
