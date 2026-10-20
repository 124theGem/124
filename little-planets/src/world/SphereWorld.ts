import { STORY_PLANTS, STORY_ROBOT, STORY_METEOR } from "../../shared/prologue";
import { gardenBeds } from "../../shared/model";
import { voxelCell, surfaceHeight } from "../../shared/voxel";
import { landingPad } from "../../shared/model";
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
  private blockHighlight = new T.LineSegments(
    new T.EdgesGeometry(new T.BoxGeometry(1.02, 0.46, 1.02)),
    new T.LineBasicMaterial({ color: 0x89fff0, depthTest: true }),
  );
  readonly ship: T.Group;
  private landingBase!: T.Group;
  private shipVisualKey = "";
  readonly id: PlanetId;
  private storyProps = new T.Group();
  private storyKey = "";
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
    this.blockHighlight.visible = false;
    this.root.add(this.blockHighlight, this.storyProps);
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
    const pad = landingPad(save, this.id),
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
    this.landingBase = base;
    this.ship = new T.Group();
    this.ship.visible = save.worlds[this.id].launchPad?.shipId !== null;
    this.ship.position.copy(spherePoint(pad, 0.14, this.id));
    this.ship.quaternion.copy(base.quaternion);
    this.root.add(this.ship);
    this.rebuild(save, now);
  }
  highlightBlock(point: { x: number; z: number; level?: number } | null) {
    this.blockHighlight.visible = !!point;
    if (!point) return;
    const normal = voxelCell(sphereNormal(point, this.id), this.id).normal;
    const center = sphereCoordinates(normal, this.id);
    this.blockHighlight.position.copy(spherePoint(center, 0, this.id));
    if (point.level !== undefined)
      this.blockHighlight.position.addScaledVector(
        sphereUp(center, this.id),
        point.level * 0.45 - surfaceHeight(center, this.id),
      );
    this.blockHighlight.position.addScaledVector(
      sphereUp(center, this.id),
      -0.225,
    );
    this.blockHighlight.quaternion.setFromUnitVectors(
      T.Object3D.DEFAULT_UP,
      sphereUp(center, this.id),
    );
  }
  pickFence(ray: T.Ray): number | null {
    this.root.updateMatrixWorld(true);
    const caster = new T.Raycaster();
    caster.ray.copy(ray);
    const hit = caster.intersectObject(this.structures, true)[0];
    const ground = caster.intersectObject(this.ground, false)[0];
    if (!hit || (ground && ground.distance + 0.05 < hit.distance)) return null;
    let o: T.Object3D | null = hit.object;
    while (o) {
      if (o.userData.fenceIndex !== undefined) return o.userData.fenceIndex;
      o = o.parent;
    }
    return null;
  }
  pickStory(ray: T.Ray): number | null {
    this.root.updateMatrixWorld(true);
    const caster = new T.Raycaster();
    caster.ray.copy(ray);
    const hit = caster.intersectObject(this.storyProps, true)[0];
    if (!hit) return null;
    const ground = caster.intersectObject(this.ground, false)[0];
    if (ground && ground.distance + 0.05 < hit.distance) return null;
    let o: T.Object3D | null = hit.object;
    while (o) {
      if (o.userData.storyIndex !== undefined) return o.userData.storyIndex;
      o = o.parent;
    }
    return null;
  }
  pickShip(ray: T.Ray) {
    if (!this.ship.visible) return false;
    this.root.updateMatrixWorld(true);
    const caster = new T.Raycaster();
    caster.ray.copy(ray);
    const hit = caster.intersectObject(this.ship, true)[0],
      ground = caster.intersectObject(this.ground, false)[0];
    const structure = caster.intersectObject(this.structures, true)[0];
    return (
      !!hit &&
      (!ground || hit.distance <= ground.distance + 0.05) &&
      (!structure || hit.distance <= structure.distance)
    );
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
    if (!save.flight) {
      const pad = landingPad(save, this.id),
        record = save.worlds[this.id].launchPad;
      const design = save.fleet.find(
        (sh) => sh.id === (record?.shipId ?? save.activeShip),
      );
      const key = JSON.stringify([pad, design, save.prologue.phase]);
      if (key !== this.shipVisualKey) {
        this.shipVisualKey = key;
        this.ship.traverse((o) => {
          if (o instanceof T.InstancedMesh) o.dispose();
        });
        this.ship.clear();
        const model = this.kit.ship(design);
        if (
          this.id === "home" &&
          ["arrival", "plants", "meteor", "repair"].includes(
            save.prologue.phase,
          )
        ) {
          model.rotation.z = 0.16;
          this.kit.box(model, 0.6, 0.9, -1, 0.3, 0.3, 0.6, 0xe58b48, true);
          for (let i = 0; i < 4; i++)
            this.kit.box(
              model,
              -0.7 + i * 0.4,
              0.5,
              -1.7,
              0.12,
              0.22,
              0.5,
              0x29343b,
            );
        }
        this.ship.add(model);
        this.ship.visible = record?.shipId !== null;
        this.landingBase.position.copy(spherePoint(pad, 0.04, this.id));
        this.landingBase.quaternion.setFromUnitVectors(
          T.Object3D.DEFAULT_UP,
          sphereUp(pad, this.id),
        );
        this.ship.position.copy(spherePoint(pad, 0.14, this.id));
        this.ship.quaternion.copy(this.landingBase.quaternion);
      }
    }
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
        save.worlds[this.id].gardens,
        save.worlds[this.id].fences,
        save.worlds[this.id].crops,
        Object.values(save.worlds[this.id].crops).map((c) => stage(c, now)),
      ]);
    if (buildingKey !== this.buildingKey) {
      this.buildingKey = buildingKey;
      this.structures.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      this.structures.clear();
      for (const b of gardenBeds(save, this.id)) {
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
      for (const [index, f] of save.worlds[this.id].fences.entries()) {
        const g = new T.Group(),
          color =
            f.kind === "wood"
              ? 0xb5966c
              : f.kind === "stone"
                ? 0xd0d9cb
                : 0x425b65;
        for (const x of [-0.48, 0.48])
          this.kit.box(g, x, 0.38, 0, 0.12, 0.8, 0.12, color);
        for (const y of [0.28, 0.6])
          this.kit.box(
            g,
            0,
            y,
            0,
            1.05,
            0.1,
            0.1,
            f.kind === "energy" ? 0x72e5dc : color,
            f.kind === "energy",
          );
        if (f.kind === "stone")
          this.kit.box(g, 0, 0.2, 0, 0.9, 0.4, 0.18, color);
        g.position.copy(spherePoint(f, 0.02, this.id));
        g.quaternion.setFromUnitVectors(
          T.Object3D.DEFAULT_UP,
          sphereUp(f, this.id),
        );
        g.rotateY((f.rotation * Math.PI) / 2);
        g.userData.fenceIndex = index;
        this.structures.add(g);
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

    const storyKey = JSON.stringify(save.prologue);
    if (this.id === "home" && storyKey !== this.storyKey) {
      this.storyKey = storyKey;
      this.storyProps.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      this.storyProps.clear();
      const add = (g: T.Group, p: { x: number; z: number }, index: number) => {
        g.position.copy(spherePoint(p, 0.05, this.id));
        g.quaternion.setFromUnitVectors(
          T.Object3D.DEFAULT_UP,
          sphereUp(p, this.id),
        );
        g.userData.storyIndex = index;
        this.storyProps.add(g);
      };
      if (save.prologue.phase !== "complete") {
        const robot = new T.Group();
        this.kit.box(robot, 0, 0.35, 0, 0.5, 0.55, 0.38, 0xd9e3d3);
        this.kit.box(robot, 0, 0.7, 0, 0.65, 0.3, 0.45, 0x344e5a);
        this.kit.box(robot, 0, 0.73, 0.24, 0.4, 0.08, 0.03, 0x8ceee0, true);
        for (const x of [-0.27, 0.27])
          this.kit.box(robot, x, 0.12, 0, 0.16, 0.24, 0.4, 0x55757d);
        this.kit.box(robot, 0.2, 1, 0, 0.035, 0.35, 0.035, 0x7fe9de, true);
        add(robot, STORY_ROBOT, -1);
      }
      STORY_PLANTS.forEach((p, i) => {
        if (
          save.prologue.phase === "complete" ||
          save.prologue.plants.includes(i)
        )
          return;
        const g = this.kit.plant(p.plant);
        this.kit.box(g, 0, 0.05, 0, 0.8, 0.07, 0.8, 0x80efd5, true);
        add(g, p, i);
      });
      if (!save.prologue.meteor && save.prologue.phase !== "complete") {
        const g = new T.Group();
        this.kit.box(g, 0, 0.35, 0, 1.1, 0.7, 0.85, 0x576675);
        for (const x of [-0.3, 0, 0.3])
          this.kit.box(g, x, 0.65, 0.18, 0.1, 0.18, 0.6, 0xefac64, true);
        add(g, STORY_METEOR, 3);
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
    this.blockHighlight.geometry.dispose();
    this.blockHighlight.material.dispose();
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
