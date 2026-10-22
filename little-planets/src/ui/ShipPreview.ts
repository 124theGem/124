import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Models } from "../world/Models";
import { graphicsQuality, studioEnvironment } from "../world/Graphics";
import { shipConfiguration, type Starship } from "../../shared/ships";

/** Owns its context and resources for exactly one open shipyard panel. */
export class ShipPreview {
  private renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(37, 1, 0.1, 100);
  private kit = new Models();
  private controls: OrbitControls;
  private ship?: T.Group;
  private environment: T.WebGLRenderTarget;
  private resize: ResizeObserver;
  private frame = 0;
  private disposed = false;
  private last = -1000;
  private owned: (T.Material | T.BufferGeometry)[] = [];
  private turntable: T.Object3D[] = [];
  constructor(
    private host: HTMLElement,
    design: Starship,
  ) {
    this.renderer.domElement.className = "shipyard-canvas";
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Трёхмерная модель корабля: вращение перетаскиванием, масштаб колесом или щипком",
    );
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        graphicsQuality() === "high"
          ? 1.6
          : graphicsQuality() === "economy"
            ? 0.7
            : 1,
      ),
    );
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = graphicsQuality() !== "economy";
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.environment = studioEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.8;
    this.scene.add(new T.HemisphereLight(0xcde4fa, 0x131d2b, 1.25));
    const sun = new T.DirectionalLight(0xffecd0, 1.9);
    sun.position.set(4, 6, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -5,
      right: 5,
      top: 5,
      bottom: -5,
      near: 0.5,
      far: 22,
    });
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    const rim = new T.DirectionalLight(0xc5d7d6, 1.4);
    rim.position.set(-4, 2, -4);
    this.scene.add(rim);
    const grid = new T.GridHelper(16, 32, 0x899690, 0x42504f);
    grid.position.y = -0.13;
    this.scene.add(grid);
    this.owned.push(
      grid.geometry,
      ...(Array.isArray(grid.material) ? grid.material : [grid.material]),
    );
    const platformGeo = new T.CylinderGeometry(3.3, 3.5, 0.12, 64),
      platformMat = new T.MeshStandardMaterial({
        color: 0x464f4d,
        roughness: 0.75,
        metalness: 0.2,
      });
    const platform = new T.Mesh(platformGeo, platformMat);
    platform.position.y = -0.08;
    platform.receiveShadow = true;
    this.scene.add(platform);
    for (const side of [-1, 1]) {
      const geo = new T.BoxGeometry(0.12, 3, 0.15),
        mat = new T.MeshStandardMaterial({
          color: 0x5a6663,
          metalness: 0.45,
          roughness: 0.7,
        });
      const support = new T.Mesh(geo, mat);
      support.position.set(side * 3.8, 1.3, -3.4);
      this.scene.add(support);
      this.owned.push(geo, mat);
      this.turntable.push(support);
    }
    this.owned.push(platformGeo, platformMat);
    const ringGeo = new T.TorusGeometry(3.35, 0.012, 4, 96),
      ringMat = new T.MeshBasicMaterial({ color: 0xb4c8bb });
    const ring = new T.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0;
    this.scene.add(ring);
    this.turntable.push(grid, platform, ring);
    this.owned.push(ringGeo, ringMat);
    this.camera.position.set(4.3, 2.9, 5.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.8, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 17;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.8;
    this.host.append(this.renderer.domElement);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.setDesign(design);
    this.frame = requestAnimationFrame(this.animate);
  }
  private fit() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  setDesign(design: Starship) {
    if (this.ship) {
      this.ship.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      this.ship.removeFromParent();
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.ship = this.kit.ship(design);
    this.scene.add(this.ship);
    this.host.dataset.design = JSON.stringify(shipConfiguration(design));
    this.host.dataset.revision = String(
      Number(this.host.dataset.revision ?? 0) + 1,
    );
  }
  reset() {
    this.camera.position.set(4.3, 2.9, 5.5);
    this.controls.target.set(0, 0.8, 0);
    this.controls.update();
  }
  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(T.MathUtils.clamp(offset.length() * factor, 4, 17));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }
  private animate = (time: number) => {
    if (this.disposed) return;
    if (!this.host.isConnected) {
      this.dispose();
      return;
    }
    if (
      !document.hidden &&
      time - this.last > (graphicsQuality() === "economy" ? 66 : 33)
    ) {
      this.controls.update();
      for (const object of this.turntable)
        object.visible = this.camera.position.y > 0.05;
      this.renderer.render(this.scene, this.camera);
      this.last = time;
      this.host.dataset.camera = this.camera.position
        .toArray()
        .map((n) => n.toFixed(3))
        .join(",");
      this.host.dataset.triangles = String(this.renderer.info.render.triangles);
    }
    this.frame = requestAnimationFrame(this.animate);
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    this.kit.dispose();
    this.environment.dispose();
    this.owned.forEach((r) => r.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.scene.clear();
  }
}
