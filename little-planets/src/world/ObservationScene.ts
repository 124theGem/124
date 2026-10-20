import * as T from "three";
import { Models } from "./Models";
import { SphereWorld } from "./SphereWorld";
import { StarSky } from "./StarSky";
import { sphereRadius } from "../../shared/sphere";
import { MAX_TERRAIN_HEIGHT } from "../../shared/voxel";
import { bodyCenter } from "../../shared/space";
import { PLANETS, type PlanetId } from "../../shared/catalog";
import { freshWorld, type Save } from "../../shared/model";
import { SYSTEM_PLANETS } from "../../shared/prologue";
/** Read-only optics. Never changes the player's position or discovered resources. */
export class ObservationScene {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(45, 1, 0.1, 20000);
  private sky = new StarSky();
  private worlds: SphereWorld[] = [];
  private rotation = new T.Quaternion().setFromEuler(new T.Euler(-0.4, 0.5, 0));
  private focus = new T.Vector3();
  private home = new T.Vector3();
  private distance = 80;
  private systemDistance = 120;
  private zoom = 1;
  private surfaceBound = 0;
  private geometries: T.BufferGeometry[] = [];
  private materials: T.Material[] = [];
  elapsed = 0;
  constructor(
    kit: Models,
    save: Save,
    readonly target: PlanetId,
    readonly reveal = false,
  ) {
    this.scene.background = new T.Color(0x030c19);
    this.scene.add(this.sky.root, new T.HemisphereLight(0xe8f6e4, 0x496579, 2));
    this.sky.root.scale.setScalar(15);
    const sun = new T.DirectionalLight(0xffedcb, 3);
    sun.position.set(-50, 150, 100);
    this.scene.add(sun);
    const id = reveal ? "home" : target;
    const world = new SphereWorld(
      kit,
      {
        ...save,
        planet: id,
        worlds: {
          ...save.worlds,
          [id]: save.worlds[id] ?? freshWorld(id, save.updatedAt),
        },
      },
      save.updatedAt,
    );
    this.surfaceBound =
      sphereRadius(id) +
      Math.max(
        MAX_TERRAIN_HEIGHT,
        ...Object.values(save.worlds[id]?.terrain ?? {}).map((t) => t.height),
      ) +
      2;
    this.worlds.push(world);
    this.scene.add(world.root);
    const radius = PLANETS[id].id === "home" ? 46 : 34;
    this.distance = radius * 2.4;
    if (reveal) {
      // Use real system positions, scaled uniformly to fit the optical display.
      const center = bodyCenter("home"),
        bounds = new T.Box3().expandByPoint(new T.Vector3());
      for (const p of SYSTEM_PLANETS.filter((p) => p !== "home")) {
        const c = bodyCenter(p),
          g = new T.Group();
        g.position.set(
          (c.x - center.x) * 0.4,
          (c.y - center.y) * 0.4,
          (c.z - center.z) * 0.4,
        );
        const geo = new T.BoxGeometry(20, 20, 20),
          mat = new T.MeshStandardMaterial({
            color: PLANETS[p].soil,
            roughness: 0.95,
          });
        this.geometries.push(geo);
        this.materials.push(mat);
        g.add(new T.Mesh(geo, mat));
        for (let i = 0; i < 10; i++)
          kit.box(
            g,
            -8 + (i % 5) * 3.5,
            10.6 + (i % 3),
            -5 + Math.floor(i / 5) * 7,
            2.4,
            2,
            3,
            PLANETS[p].rock,
          );
        this.scene.add(g);
        bounds.expandByPoint(g.position);
      }
      bounds.getCenter(this.focus);
      this.systemDistance = Math.max(
        180,
        bounds.getSize(new T.Vector3()).length() * 1.3,
      );
    }
  }
  rotate(dx: number, dy: number) {
    this.rotation
      .premultiply(
        new T.Quaternion().setFromEuler(
          new T.Euler(dy * 0.007, dx * 0.007, 0, "YXZ"),
        ),
      )
      .normalize();
  }
  magnify(factor: number) {
    this.zoom = T.MathUtils.clamp(this.zoom * factor, 0.32, 2.4);
  }
  update(dt: number, aspect: number) {
    this.elapsed += dt;
    const t = this.reveal ? T.MathUtils.smoothstep(this.elapsed, 0, 7) : 0;
    const focus = this.home.clone().lerp(this.focus, t);
    const requestedDistance =
      T.MathUtils.lerp(this.distance, this.systemDistance, t) *
      this.zoom *
      Math.max(1, 0.8 / aspect);
    const offset = new T.Vector3(0, 0.25, 1)
      .normalize()
      .applyQuaternion(this.rotation);
    const minDistance =
      this.surfaceBound /
      Math.max(Math.abs(offset.x), Math.abs(offset.y), Math.abs(offset.z));
    const distance = Math.max(requestedDistance, minDistance);
    this.camera.position.copy(focus).addScaledVector(offset, distance);
    this.camera.up.set(0, 1, 0).applyQuaternion(this.rotation);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(focus);
  }
  dispose() {
    for (const w of this.worlds) w.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.sky.dispose();
  }
}
