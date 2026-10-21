import * as T from "three";
import { Models } from "./Models";
import { SphereWorld } from "./SphereWorld";
import { StarSky } from "./StarSky";
import { sphereRadius } from "../../shared/sphere";
import { MAX_TERRAIN_HEIGHT } from "../../shared/voxel";
import { bodyCenter } from "../../shared/space";
import { PLANETS, type PlanetId } from "../../shared/catalog";
import { freshWorld, type Save } from "../../shared/model";
import { SECTOR_PLANETS, constellationIndex } from "../../shared/sector";
export const REVEAL_DURATION = 14;
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
  private planetInstances?: T.InstancedMesh;
  private visiblePlanets = 1;
  private visibleConstellations = 1;
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
      // One lightweight instance per real catalog world, at its real relative position.
      // The reveal is an optical flight: it does not discover all these resources.
      const center = bodyCenter("home"),
        bounds = new T.Box3().expandByPoint(new T.Vector3()),
        ids = SECTOR_PLANETS.filter((p) => p !== "home"),
        geo = new T.BoxGeometry(42, 42, 42),
        mat = new T.MeshStandardMaterial({
          roughness: 0.85,
          emissive: 0x253a45,
          emissiveIntensity: 0.3,
        }),
        instances = new T.InstancedMesh(geo, mat, ids.length),
        dummy = new T.Object3D(),
        dust: number[] = [],
        dustColors: number[] = [];
      this.geometries.push(geo);
      this.materials.push(mat);
      this.planetInstances = instances;
      this.visiblePlanets = ids.length + 1;
      this.visibleConstellations = new Set(
        SECTOR_PLANETS.map(constellationIndex),
      ).size;
      ids.forEach((p, i) => {
        const c = bodyCenter(p);
        dummy.position.set(
          (c.x - center.x) * 0.4,
          (c.y - center.y) * 0.4,
          (c.z - center.z) * 0.4,
        );
        dummy.scale.setScalar(0.65 + (((i * 17) % 19) / 19) * 0.65);
        dummy.rotation.set((i % 5) * 0.08, i * 0.37, (i % 3) * 0.1);
        dummy.updateMatrix();
        instances.setMatrixAt(i, dummy.matrix);
        instances.setColorAt(
          i,
          new T.Color(PLANETS[p].soil).lerp(new T.Color(PLANETS[p].rock), 0.35),
        );
        bounds.expandByPoint(dummy.position);
        // Spiral dust around the actual constellation centers adds depth while passing them.
        if (!p.startsWith("wild-") || Number(p.slice(5)) % 20 !== 1) return;
        const hue = new T.Color(i % 3 ? 0x406c9d : 0x936b85).multiplyScalar(
          0.45,
        );
        for (let j = 0; j < 160; j++) {
          const a = j * 2.399963,
            r = 30 + Math.sqrt(j / 160) * 180;
          dust.push(
            dummy.position.x + Math.cos(a) * r,
            dummy.position.y + Math.sin(j * 9.3) * 16,
            dummy.position.z + Math.sin(a) * r,
          );
          dustColors.push(hue.r, hue.g, hue.b);
        }
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.instanceColor!.needsUpdate = true;
      instances.computeBoundingSphere();
      this.scene.add(instances);
      const nebulaGeo = new T.BufferGeometry();
      nebulaGeo.setAttribute("position", new T.Float32BufferAttribute(dust, 3));
      nebulaGeo.setAttribute(
        "color",
        new T.Float32BufferAttribute(dustColors, 3),
      );
      const nebulaMat = new T.PointsMaterial({
        vertexColors: true,
        size: 1.8,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      this.geometries.push(nebulaGeo);
      this.materials.push(nebulaMat);
      this.scene.add(new T.Points(nebulaGeo, nebulaMat));
      bounds.getCenter(this.focus);
      this.systemDistance = bounds.getSize(new T.Vector3()).length() * 1.45;
      this.camera.far = Math.max(20000, this.systemDistance * 3);
      this.sky.root.scale.setScalar(this.systemDistance / 55);
    }
  }
  get finished() {
    return !this.reveal || this.elapsed >= REVEAL_DURATION;
  }
  get stats() {
    this.camera.updateMatrixWorld();
    const frustum = new T.Frustum().setFromProjectionMatrix(
      new T.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    );
    const matrix = new T.Matrix4(),
      point = new T.Vector3();
    let inFrame = 0;
    if (this.planetInstances)
      for (let i = 0; i < this.planetInstances.count; i++) {
        this.planetInstances.getMatrixAt(i, matrix);
        point.setFromMatrixPosition(matrix);
        if (frustum.containsPoint(point)) inFrame++;
      }
    return {
      planets: this.visiblePlanets,
      constellations: this.visibleConstellations,
      planetsInFrame: inFrame,
      distance: this.camera.position.length(),
      finished: this.finished,
    };
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
    const progress = this.reveal
      ? T.MathUtils.clamp(this.elapsed / REVEAL_DURATION, 0, 1)
      : 0;
    // First leave the tiny home; then accelerate through the surrounding star fields.
    const t =
      progress < 0.23
        ? T.MathUtils.smoothstep(progress, 0, 0.23) * 0.055
        : 0.055 + T.MathUtils.smoothstep(progress, 0.23, 1) * 0.945;
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
    if (this.reveal) {
      const sweep = Math.sin(t * Math.PI);
      this.camera.position.x += sweep * this.systemDistance * 0.12;
      this.camera.position.y +=
        Math.sin(t * Math.PI * 2) * this.systemDistance * 0.025;
    }
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
