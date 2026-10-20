import * as T from "three";
import { Models } from "./Models";
import {
  biomeOf,
  beds,
  nodes,
  ship,
  PLANTS,
  type PlanetId,
} from "../../shared/catalog";
import { nodeReady, stage, type Save } from "../../shared/model";
import {
  cubeUp,
  sphereNormal,
  sphereCoordinates,
  sphereRadius,
  type Point,
} from "../../shared/sphere";
import { tiledSphere } from "./TiledSphere";
import { SphereNature } from "./SphereNature";
import {
  surfacePoint,
  surfaceCoordinates,
  cubeNormal,
  setTerrainEdits,
  cellKey,
  surfaceRadius,
  MAX_TERRAIN_HEIGHT,
} from "../../shared/voxel";
export function spherePoint(p: Point, height = 0, id: PlanetId = "home") {
  const p3 = surfacePoint(p, id),
    up = cubeUp(sphereNormal(p, id));
  return new T.Vector3(p3.x, p3.y, p3.z).addScaledVector(
    new T.Vector3(up.x, up.y, up.z),
    height,
  );
}
export function sphereUp(p: Point, id: PlanetId = "home") {
  const n = cubeUp(sphereNormal(p, id));
  return new T.Vector3(n.x, n.y, n.z);
}
export class SphereWorld {
  readonly root = new T.Group();
  readonly ship: T.Group;
  readonly id: PlanetId;
  readonly tiles: number;
  nature: SphereNature;
  private clearingKey = "";
  private geometry: T.BufferGeometry;
  private baseGeometry: T.BoxGeometry;
  private ground: T.Mesh;
  private terrainKey = "";
  private structures = new T.Group();
  private buildingKey = "";
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
    setTerrainEdits(this.id, save.worlds[this.id].terrain);
    const tile = tiledSphere(this.id);
    this.geometry = tile.geometry;
    this.terrainKey = JSON.stringify(save.worlds[this.id].terrain);
    this.tiles = tile.tiles;
    this.terrainStats = {
      walls: tile.walls,
      minHeight: tile.minHeight,
      maxHeight: tile.maxHeight,
    };
    const ground = (this.ground = new T.Mesh(this.geometry, this.material));
    ground.receiveShadow = true;
    ground.castShadow = true;
    const width = sphereRadius(this.id) * 2 - 4;
    this.baseGeometry = new T.BoxGeometry(width, width, width);
    this.root.add(
      new T.Mesh(this.baseGeometry, this.baseMaterial),
      ground,
      this.resources,
      this.structures,
    );
    this.nature = new SphereNature(kit, this.id, save.worlds[this.id].cleared);
    this.clearingKey = JSON.stringify(save.worlds[this.id].cleared);
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
    this.ship = kit.ship(save.fleet.find((s) => s.id === save.activeShip));
    this.ship.position.copy(spherePoint(pad, 0.14, this.id));
    this.ship.quaternion.copy(base.quaternion);
    this.root.add(this.ship);
    this.rebuild(save, now);
  }
  pickBuilding(ray: T.Ray) {
    this.root.updateMatrixWorld(true);
    const caster = new T.Raycaster();
    caster.ray.copy(ray);
    const hit = caster.intersectObject(this.structures, true)[0],
      ground = caster.intersectObject(this.ground, false)[0];
    if (ground && hit && ground.distance + 0.05 < hit.distance) return null;
    let o: T.Object3D | null = hit?.object ?? null;
    while (o) {
      if (o.userData.buildingId) return o.userData.buildingId as string;
      o = o.parent;
    }
    return null;
  }
  pick(ray: T.Ray, place = false) {
    this.root.updateMatrixWorld(true);
    const caster = new T.Raycaster();
    caster.ray.copy(ray);
    const hit = caster.intersectObject(this.ground, false)[0];
    if (!hit) return null;
    const attr = this.geometry.getAttribute("cubeSide"),
      face = attr.getX(hit.face!.a),
      normal = cubeUp(cubeNormal(face, 0, 0));
    const level = this.geometry.getAttribute("blockLevel").getX(hit.face!.a),
      up = new T.Vector3(normal.x, normal.y, normal.z),
      top = hit.face!.normal.dot(up) > 0.5;
    const point = hit.point.clone();
    if (place) point.addScaledVector(hit.face!.normal, 0.08);
    return {
      ...surfaceCoordinates(point, this.id, normal),
      level: place && top ? level + 1 : level,
    };
  }
  rebuild(save: Save, now: number) {
    setTerrainEdits(this.id, save.worlds[this.id].terrain);
    const clearingKey = JSON.stringify(save.worlds[this.id].cleared);
    if (clearingKey !== this.clearingKey) {
      this.clearingKey = clearingKey;
      this.nature.dispose();
      this.nature = new SphereNature(
        this.kit,
        this.id,
        save.worlds[this.id].cleared,
      );
      this.root.add(this.nature.root);
    }
    const terrainKey = JSON.stringify(save.worlds[this.id].terrain);
    if (terrainKey !== this.terrainKey) {
      this.terrainKey = terrainKey;
      const tile = tiledSphere(this.id);
      this.geometry.dispose();
      this.geometry = tile.geometry;
      this.ground.geometry = this.geometry;
    }
    const buildingKey =
      terrainKey +
      JSON.stringify([
        save.worlds[this.id].buildings.map(
          ({ id, kind, x, z, rotation, level }) => ({
            id,
            kind,
            x,
            z,
            rotation,
            level,
          }),
        ),
        save.worlds[this.id].crops,
        Object.values(save.worlds[this.id].crops).map((c) => stage(c, now)),
      ]);
    if (buildingKey !== this.buildingKey) {
      this.buildingKey = buildingKey;
      this.structures.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      this.structures.clear();
      for (const b of beds(this.id)) {
        const bed = new T.Group();
        this.kit.box(bed, 0, 0.04, 0, 0.85, 0.1, 0.85, 0x8b7552);
        const crop = save.worlds[this.id].crops[`${b.x},${b.z}`];
        if (crop) {
          const plant = this.kit.plant(crop.plant);
          plant.scale.setScalar(0.3 + stage(crop, now) * 0.35);
          bed.add(plant);
        }
        bed.position.copy(spherePoint(b, 0.02, this.id));
        bed.quaternion.setFromUnitVectors(
          T.Object3D.DEFAULT_UP,
          sphereUp(b, this.id),
        );
        this.structures.add(bed);
      }
      for (const b of save.worlds[this.id].buildings) {
        const model = this.kit.building(b.kind, this.id, b.level ?? 1);
        model.position.copy(spherePoint(b, 0, this.id));
        model.quaternion.setFromUnitVectors(
          T.Object3D.DEFAULT_UP,
          sphereUp(b, this.id),
        );
        model.userData.buildingId = b.id;
        this.structures.add(model);
      }
    }

    const ns = nodes(this.id),
      signature =
        terrainKey +
        ns.map((n) => nodeReady(save.worlds[this.id], n.id, now)).join("");
    if (signature === this.nodeKey) return;
    this.nodeKey = signature;
    this.resources.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.resources.clear();
    for (const n of ns) {
      if (
        !nodeReady(save.worlds[this.id], n.id, now) ||
        save.worlds[this.id].cleared.includes(
          cellKey(sphereNormal(n, this.id), this.id),
        )
      )
        continue;
      const model = this.kit.resource(biomeOf(this.id), n.variant, n.resource);
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
