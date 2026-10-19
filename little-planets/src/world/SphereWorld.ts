import * as T from "three";
import { Models } from "./Models";
import { biomeOf, nodes, ship, type PlanetId } from "../../shared/catalog";
import { nodeReady, type Save } from "../../shared/model";
import {
  sphereNormal,
  sphereCoordinates,
  sphereRadius,
  type Point,
} from "../../shared/sphere";
import { tiledSphere } from "./TiledSphere";
import { SphereNature } from "./SphereNature";
import { surfaceRadius, MAX_TERRAIN_HEIGHT } from "../../shared/voxel";
export function spherePoint(p: Point, height = 0, id: PlanetId = "orbis") {
  const n = sphereNormal(p, id);
  return new T.Vector3(n.x, n.y, n.z).multiplyScalar(
    surfaceRadius(p, id) + height,
  );
}
export function sphereUp(p: Point, id: PlanetId = "orbis") {
  const n = sphereNormal(p, id);
  return new T.Vector3(n.x, n.y, n.z);
}
export class SphereWorld {
  readonly root = new T.Group();
  readonly ship: T.Group;
  readonly id: PlanetId;
  readonly tiles: number;
  readonly nature: SphereNature;
  private geometry: T.BufferGeometry;
  private baseGeometry: T.SphereGeometry;
  private material = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    flatShading: true,
  });
  private baseMaterial = new T.MeshStandardMaterial({
    color: 0x77775a,
    roughness: 1,
  });
  private resources = new T.Group();
  private nodeKey = "";
  readonly terrainStats: {
    walls: number;
    minHeight: number;
    maxHeight: number;
  };
  constructor(
    private kit: Models,
    save: Save,
    now: number,
  ) {
    this.id = save.planet;
    const tile = tiledSphere(this.id);
    this.geometry = tile.geometry;
    this.tiles = tile.tiles;
    this.terrainStats = {
      walls: tile.walls,
      minHeight: tile.minHeight,
      maxHeight: tile.maxHeight,
    };
    const ground = new T.Mesh(this.geometry, this.material);
    ground.receiveShadow = true;
    ground.castShadow = true;
    this.baseGeometry = new T.SphereGeometry(
      sphereRadius(this.id) - 0.035,
      32,
      16,
    );
    this.root.add(
      new T.Mesh(this.baseGeometry, this.baseMaterial),
      ground,
      this.resources,
    );
    this.nature = new SphereNature(kit, this.id);
    this.root.add(this.nature.root);
    const pad = ship(this.id),
      base = new T.Group();
    kit.box(base, 0, -0.03, 0, 4, 0.12, 4, 0x899d9f);
    for (const x of [-1.5, 1.5])
      kit.box(base, x, 0.04, 0, 0.1, 0.03, 3, 0xf6d58e, true);
    kit.batch(base);
    base.position.copy(spherePoint(pad, 0.04, this.id));
    base.quaternion.setFromUnitVectors(
      T.Object3D.DEFAULT_UP,
      sphereUp(pad, this.id),
    );
    this.root.add(base);
    this.ship = kit.ship();
    this.ship.position.copy(spherePoint(pad, 0.14, this.id));
    this.ship.quaternion.copy(base.quaternion);
    this.root.add(this.ship);
    this.rebuild(save, now);
  }
  pick(ray: T.Ray) {
    const hit = ray.intersectSphere(
      new T.Sphere(
        new T.Vector3(),
        sphereRadius(this.id) + MAX_TERRAIN_HEIGHT + 0.1,
      ),
      new T.Vector3(),
    );
    if (!hit) return null;
    const start = hit.distanceTo(ray.origin);
    let previous = start;
    for (
      let distance = start;
      distance < start + 2 * (sphereRadius(this.id) + MAX_TERRAIN_HEIGHT + 0.1);
      distance += 0.12
    ) {
      const p = ray.at(distance, new T.Vector3()),
        coords = sphereCoordinates(p, this.id);
      if (p.length() <= surfaceRadius(coords, this.id)) {
        let lo = previous,
          hi = distance;
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) / 2,
            q = ray.at(mid, new T.Vector3());
          if (
            q.length() <= surfaceRadius(sphereCoordinates(q, this.id), this.id)
          )
            hi = mid;
          else lo = mid;
        }
        return sphereCoordinates(ray.at(hi, new T.Vector3()), this.id);
      }
      previous = distance;
    }
    return null;
  }
  rebuild(save: Save, now: number) {
    const ns = nodes(this.id),
      signature = ns
        .map((n) => nodeReady(save.worlds[this.id], n.id, now))
        .join("");
    if (signature === this.nodeKey) return;
    this.nodeKey = signature;
    this.resources.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.resources.clear();
    for (const n of ns) {
      if (!nodeReady(save.worlds[this.id], n.id, now)) continue;
      const model = this.kit.resource(biomeOf(this.id), n.variant);
      model.position.copy(spherePoint(n, 0, this.id));
      model.quaternion.setFromUnitVectors(
        T.Object3D.DEFAULT_UP,
        sphereUp(n, this.id),
      );
      this.resources.add(model);
    }
    this.kit.batch(this.resources);
  }
  updateCrops(save: Save, now: number) {
    this.rebuild(save, now);
  }
  animate(time: number) {
    this.nature.animate(time);
  }
  dispose() {
    this.nature.dispose();
    this.root.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.geometry.dispose();
    this.baseGeometry.dispose();
    this.material.dispose();
    this.baseMaterial.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
