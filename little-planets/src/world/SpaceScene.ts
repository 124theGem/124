import { cockpit } from "./Cockpit";
import * as T from "three";
import { Models } from "./Models";
import { Planet } from "./Planet";
import { SphereWorld } from "./SphereWorld";
import { tiledSphere } from "./TiledSphere";
import { StarSky } from "./StarSky";
import {
  PLANETS,
  isSphere,
  planetSize,
  type PlanetId,
} from "../../shared/catalog";
import {
  bodyCenter,
  bodyRadius,
  padPoint,
  padNormal,
  len,
  sub as subPosition,
  type FlightState,
} from "../../shared/space";
import type { Save } from "../../shared/model";
export class SpaceScene {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(53, 1, 0.1, 30000);
  readonly ship: T.Group;
  private sky = new StarSky();
  private proxies = new Map<PlanetId, T.Group>();
  private detailed = new Map<PlanetId, SphereWorld | Planet>();
  private geometries: T.BufferGeometry[] = [];
  private materials: T.Material[] = [];
  private beacon: T.Group = new T.Group();
  private beaconMaterial = new T.MeshBasicMaterial({
    color: 0xa6f1c6,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  private beaconGeo = new T.TorusGeometry(3.1, 0.08, 6, 32);
  private exhaustGeo = new T.BoxGeometry(1, 1, 1);
  private exhaustMaterial = new T.MeshBasicMaterial({
    color: 0x8bd5f7,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  private exhaust = new T.InstancedMesh(
    this.exhaustGeo,
    this.exhaustMaterial,
    32,
  );
  private target: PlanetId;
  private cabin: T.Group;
  constructor(
    private kit: Models,
    private save: Save,
  ) {
    this.scene.background = new T.Color(0x020916);
    this.scene.add(new T.HemisphereLight(0xcbdcff, 0x7e8a9e, 2.5));
    const light = new T.DirectionalLight(0xffe4b5, 3);
    light.position.set(-180, 250, 130);
    this.scene.add(light, this.sky.root);
    this.sky.root.scale.setScalar(10);
    for (const id of save.discovered
      .slice(0, 100)
      .concat(
        save.discovered.includes(save.flight!.target) &&
          save.discovered.indexOf(save.flight!.target) >= 100
          ? [save.flight!.target]
          : [],
      )) {
      const root = new T.Group(),
        c = bodyCenter(id);
      root.position.set(c.x, c.y, c.z);
      if (isSphere(id)) {
        const data = tiledSphere(id, 12),
          material = new T.MeshStandardMaterial({
            vertexColors: true,
            roughness: 1,
          });
        this.geometries.push(data.geometry);
        this.materials.push(material);
        root.add(new T.Mesh(data.geometry, material));
      } else {
        const size = planetSize(id);
        kit.box(
          root,
          0,
          bodyRadius(id) - 2.5,
          0,
          size,
          5,
          size,
          PLANETS[id].rock,
        );
        kit.box(
          root,
          0,
          bodyRadius(id) + 0.02,
          0,
          size,
          0.25,
          size,
          PLANETS[id].soil,
        );
        root.position.set(0, 0, 0);
        kit.batch(root);
        root.position.set(c.x, c.y, c.z);
      }
      this.scene.add(root);
      this.proxies.set(id, root);
    }
    this.target = save.flight!.target;
    this.ship = kit.ship(save.fleet.find((s) => s.id === save.activeShip));
    this.ship.visible = false;
    this.cabin = cockpit(kit);
    this.scene.add(this.cabin);
    this.scene.add(this.ship, this.exhaust);
    this.exhaust.frustumCulled = false;
    for (const offset of [0, 1]) {
      const ring = new T.Mesh(this.beaconGeo, this.beaconMaterial);
      ring.position.y = offset * 0.55;
      ring.rotation.x = Math.PI / 2;
      this.beacon.add(ring);
    }
    this.scene.add(this.beacon);
    this.resize();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  private detail(id: PlanetId) {
    if (this.detailed.has(id)) return;
    if (!this.proxies.has(id)) {
      const proxy = new T.Group();
      this.proxies.set(id, proxy);
      this.scene.add(proxy);
    }
    const state = { ...this.save, planet: id, flight: null };
    const view = isSphere(id)
        ? new SphereWorld(this.kit, state, Date.now())
        : new Planet(id, this.kit, state, Date.now()),
      c = bodyCenter(id);
    view.ship.visible = false;
    if (isSphere(id)) view.root.position.set(c.x, c.y, c.z);
    else {
      const off = (planetSize(id) - 1) / 2;
      view.root.position.set(c.x - off, c.y + bodyRadius(id), c.z - off);
    }
    this.scene.add(view.root);
    this.detailed.set(id, view);
    this.proxies.get(id)!.visible = false;
  }
  update(f: FlightState, dt: number, time: number, landing = false) {
    this.target = f.target;
    this.ship.position.set(f.position.x, f.position.y, f.position.z);
    const forward = new T.Vector3(
        f.forward.x,
        f.forward.y,
        f.forward.z,
      ).normalize(),
      upVector = new T.Vector3(f.up.x, f.up.y, f.up.z);
    const right = new T.Vector3().crossVectors(upVector, forward).normalize(),
      up = new T.Vector3().crossVectors(forward, right);
    this.ship.quaternion.setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, forward),
    );
    for (const id of [f.origin, f.target]) {
      const c = bodyCenter(id);
      if (
        this.ship.position.distanceTo(new T.Vector3(c.x, c.y, c.z)) <
        bodyRadius(id) + 78
      )
        this.detail(id);
    }
    for (const [id, view] of [...this.detailed]) {
      const c = bodyCenter(id);
      if (
        id !== f.target &&
        this.ship.position.distanceTo(new T.Vector3(c.x, c.y, c.z)) >
          bodyRadius(id) + 100
      ) {
        view.dispose();
        this.detailed.delete(id);
        this.proxies.get(id)!.visible = true;
      } else view.animate(time);
    }
    const pad = padPoint(f.target, 9, f.pads?.[f.target]),
      normal = padNormal(f.target);
    this.beacon.position.set(pad.x, pad.y, pad.z);
    this.beacon.quaternion.setFromUnitVectors(
      T.Object3D.DEFAULT_UP,
      new T.Vector3(normal.x, normal.y, normal.z),
    );
    this.beacon.scale.setScalar(1 + Math.sin(time * 3) * 0.06);
    const desired = this.ship.position
        .clone()
        .addScaledVector(up, 1.15)
        .addScaledVector(forward, 0.35),
      look = desired.clone().addScaledVector(forward, 100);
    this.camera.up.copy(up);
    const trail = landing
        ? new T.Vector3(normal.x, normal.y, normal.z).negate()
        : forward.clone().negate(),
      matrix = new T.Matrix4();
    for (let i = 0; i < 32; i++) {
      const age = (time * 1.2 + i / 32) % 1,
        p = this.ship.position.clone().addScaledVector(trail, 1.2 + age * 5),
        size = 0.06 + age * 0.18;
      p.addScaledVector(right, Math.sin(i * 3.7) * age * 0.8);
      p.addScaledVector(up, Math.cos(i * 2.3) * age * 0.65);
      matrix.compose(p, new T.Quaternion(), new T.Vector3(size, size, size));
      this.exhaust.setMatrixAt(i, matrix);
    }
    this.exhaust.instanceMatrix.needsUpdate = true;
    this.camera.position.copy(desired);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
    this.cabin.position.copy(this.camera.position);
    this.cabin.quaternion.copy(this.camera.quaternion);
    this.sky.update(this.camera);
    this.sky.root.scale.setScalar(100);
  }
  projectTarget() {
    return this.beacon.position.clone().project(this.camera);
  }
  get stats() {
    return {
      cockpit: true,
      bodies: this.proxies.size,
      detailed: [...this.detailed.keys()],
      ship: this.ship.position.toArray(),
      smoke: 32,
    };
  }
  dispose() {
    for (const v of this.detailed.values()) v.dispose();
    this.sky.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.exhaustGeo.dispose();
    this.exhaustMaterial.dispose();
    this.beaconGeo.dispose();
    this.beaconMaterial.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.scene.clear();
  }
}
