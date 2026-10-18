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
    size = box.getSize(new T.Vector3()),
    center = box.getCenter(new T.Vector3());
  model.position.sub(center);
  const isGear = type === "gear",
    ground = -size.y / 2 - 0.12;
  kit.box(
    root,
    0,
    ground,
    0,
    Math.max(size.x + 1.3, 2),
    0.18,
    Math.max(size.z + 1, 1.8),
    isGear ? 0x3a5361 : 0x6f9c65,
  );
  if (type === "kit") {
    for (const x of [-1.5, 1.5]) {
      kit.box(root, x, ground + 0.27, 0.8, 0.13, 0.55, 0.13, 0xb79969);
      kit.box(root, x, ground + 0.8, 0.8, 0.46, 0.65, 0.46, 0x8cbb74);
    }
    kit.box(root, 0.4, ground + 0.13, 1.4, 0.7, 0.07, 0.45, 0xc5b795);
  }
  if (type === "furniture") {
    kit.box(root, -0.8, ground + 0.18, -0.8, 0.3, 0.35, 0.3, 0xb38359);
    kit.box(root, -0.8, ground + 0.55, -0.8, 0.6, 0.5, 0.5, 0x78b482);
  }
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
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(
        o.matrixWorld,
      );
      b.fromBufferAttribute(
        pos,
        index ? index.getX(i + 1) : i + 1,
      ).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(
        pos,
        index ? index.getX(i + 2) : i + 2,
      ).applyMatrix4(o.matrixWorld);
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
  });
  triangles.sort((a, b) => b.d - a.d);
  const uid = id.replace(/[^a-z0-9]/g, ""),
    result = `<svg class="recipe-illustration" viewBox="0 0 320 220" role="img" aria-label="Иллюстрация предмета"><defs><radialGradient id="art${uid}"><stop stop-color="${isGear ? "#52647a" : "#7d9977"}"/><stop offset="1" stop-color="${isGear ? "#203746" : "#294b49"}"/></radialGradient></defs><rect width="320" height="220" rx="14" fill="url(#art${uid})"/><circle cx="266" cy="38" r="37" fill="#e3c78e" opacity=".15"/><path d="M0 178 Q65 147 130 180T320 160V220H0Z" fill="#0d2935" opacity=".25"/><ellipse cx="160" cy="190" rx="101" ry="15" fill="#102733" opacity=".28"/>${triangles.map((t) => `<polygon points="${t.points}" fill="#${t.color}" stroke="#${t.color}" stroke-width=".45" stroke-linejoin="round"/>`).join("")}<path d="M20 22h20M20 22v20M300 198h-20M300 198v-20" fill="none" stroke="#d9d5ad" opacity=".35" stroke-width="1.5"/></svg>`;
  cache.set(id, result);
  return result;
}
