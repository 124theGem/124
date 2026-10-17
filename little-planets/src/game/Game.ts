import * as T from "three";
import {
  BEDS,
  BUILDINGS,
  PLANTS,
  PLANETS,
  SHIP,
  key,
  nodes,
  terrainHeight,
  type BuildingKind,
  type PlanetId,
} from "../../shared/catalog";
import {
  buildingAt,
  canBuild,
  findPath,
  nodeReady,
  ready,
  stage,
  walkable,
  type Action,
} from "../../shared/model";
import { Persistence } from "../platform/Persistence";
import { Telegram } from "../platform/Telegram";
import { Models } from "../world/Models";
import { Planet } from "../world/Planet";
import { Astronaut } from "../world/Astronaut";
import { UI } from "../ui/UI";
import { Input } from "./Input";

type Selection = {
  x: number;
  z: number;
  type: "bed" | "node" | "building" | "ship" | "ground";
  id?: string;
};
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
export class Game {
  private scene = new T.Scene();
  private renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  private camera = new T.OrthographicCamera(-13, 13, 10, -10, 0.1, 180);
  private kit = new Models();
  private avatar = new Astronaut(this.kit);
  private view: Planet;
  private ui: UI;
  private input: Input;
  private abort = new AbortController();
  private raycaster = new T.Raycaster();
  private sun = new T.DirectionalLight(0xffedcb, 2.6);
  private target = new T.Vector3(8, 0, 8);
  private position: { x: number; z: number };
  private theta = 0.73;
  private zoom = 13;
  private mode: "explore" | "planet" | "build" = "planet";
  private cameraHalf = 13;
  private cameraHeight = 24;
  private selected?: Selection;
  private path: { x: number; z: number }[] = [];
  private arrived?: () => void;
  private busy = false;
  private flying = false;
  private previousTime = 0;
  private tick = 0;
  private saveTick = 0;
  private grid = new T.GridHelper(17, 17, 0xc9efaa, 0x91c78f);
  private preview?: T.Group;
  private buildKind: BuildingKind = "house";
  private buildCell = { x: 7, z: 5 };
  private rotation: 0 | 1 = 0;
  private marker = new T.LineSegments(
    new T.EdgesGeometry(new T.BoxGeometry(0.98, 0.08, 0.98)),
    new T.LineBasicMaterial({ color: 0xffdc8c }),
  );
  private lowQuality = false;
  private adaptiveRatio = Math.min(devicePixelRatio, 1.5);
  private slowTime = 0;
  constructor(
    private store: Persistence,
    private telegram: Telegram,
  ) {
    this.position = { ...store.state.position };
    document.querySelector("#app")!.innerHTML = "";
    this.renderer.domElement.className = "world";
    this.renderer.setPixelRatio(this.adaptiveRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.querySelector("#app")!.append(this.renderer.domElement);
    this.ui = new UI(store.local);
    this.input = new Input();
    this.scene.add(new T.HemisphereLight(0xc8e4ff, 0x53614f, 1.6));
    this.sun.position.set(-8, 24, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -16,
      right: 16,
      top: 16,
      bottom: -16,
      near: 1,
      far: 65,
    });
    this.sun.shadow.normalBias = 0.04;
    this.sun.target.position.set(8, 0, 8);
    this.scene.add(this.sun, this.sun.target);
    const fill = new T.DirectionalLight(0x9ebcff, 0.7);
    fill.position.set(25, 8, -15);
    this.scene.add(fill);
    this.addStars();
    this.view = new Planet(
      store.state.planet,
      this.kit,
      store.state,
      store.now(),
    );
    this.scene.add(this.view.root, this.avatar.root, this.marker, this.grid);
    this.grid.position.set(8, 1, 8);
    this.grid.visible = false;
    this.marker.visible = false;
    this.scene.background = new T.Color(PLANETS[store.state.planet].sky);
    this.scene.fog =
      store.state.planet === "mycelia" ? new T.FogExp2(0x20173d, 0.009) : null;
    this.ui.onInventory = () => this.ui.inventory(store.state);
    this.ui.onPlant = () => this.selectNearestBed();
    this.ui.onBuild = () => this.startBuild();
    this.ui.onCamera = () => {
      if (this.mode === "build") return;
      this.mode = this.mode === "planet" ? "explore" : "planet";
      this.ui.toast(
        this.mode === "planet"
          ? "Обзор всей планеты"
          : "Исследование · камера следует за вами",
      );
    };
    this.ui.onSettings = () =>
      this.ui.settings(this.telegram.fullscreen, () => {
        this.lowQuality = !this.lowQuality;
        this.renderer.shadowMap.enabled = !this.lowQuality;
        this.renderer.setPixelRatio(this.lowQuality ? 0.8 : this.adaptiveRatio);
        this.ui.toast(
          this.lowQuality ? "Экономное качество" : "Полное качество",
        );
      });
    this.ui.onSelectPlant = (id) => {
      this.ui.close();
      if (this.selected?.type === "bed")
        void this.perform(
          { type: "plant", x: this.selected.x, z: this.selected.z, plant: id },
          "plant",
          `${PLANTS[id].name}: росток уже тянется к свету.`,
        );
    };
    this.ui.onContext = () => this.interact();
    this.ui.onGalaxy = () =>
      this.approach({ x: SHIP.x, z: SHIP.z, type: "ship" }, () =>
        this.ui.galaxy(store.state),
      );
    this.ui.onTravel = (p) => void this.travel(p);
    this.ui.onSelectBuilding = (kind) => {
      this.buildKind = kind;
      this.updatePreview();
    };
    this.ui.onCancelBuild = () => this.stopBuild();
    this.ui.onRotateBuild = () => {
      this.rotation = this.rotation === 0 ? 1 : 0;
      this.updatePreview();
    };
    this.ui.onConfirmBuild = () => void this.build();
    this.bindCamera();
    window.addEventListener("resize", this.resize, {
      signal: this.abort.signal,
    });
    window.addEventListener(
      "blur",
      () => {
        this.input.clear();
        this.path = [];
        this.arrived = undefined;
        void this.flushMove().catch(() => {});
      },
      { signal: this.abort.signal },
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          this.input.clear();
          this.path = [];
          void this.flushMove().catch(() => {});
        }
      },
      { signal: this.abort.signal },
    );
    window.addEventListener(
      "pagehide",
      () => {
        if (store.local) this.saveLocalOnExit();
        this.dispose();
      },
      { signal: this.abort.signal, once: true },
    );
    this.resize();
    this.ui.update(store.state, store.now());
    this.updateCamera(1, true);
    this.renderer.setAnimationLoop(this.frame);
    if (new URLSearchParams(location.search).has("debug"))
      Object.defineProperty(window, "__planets", {
        configurable: true,
        value: {
          project: (x: number, z: number, y = 0) => {
            const p = new T.Vector3(x, terrainHeight(x, z) + y, z).project(
              this.camera,
            );
            return {
              x: ((p.x + 1) * innerWidth) / 2,
              y: ((1 - p.y) * innerHeight) / 2,
            };
          },
          snapshot: () => ({
            state: structuredClone(store.state),
            position: { ...this.position },
            busy: this.busy,
            flying: this.flying,
            mode: this.mode,
            selected: this.selected,
            drawCalls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
            crops: Object.entries(
              store.state.worlds[store.state.planet].crops,
            ).map(([cell, c]) => ({
              cell,
              stage: stage(c, store.now()),
              ready: ready(c, store.now()),
            })),
            ratio: this.renderer.getPixelRatio(),
          }),
        },
      });
    this.ui.toast(
      "Добро пожаловать домой! Выберите грядку или нажмите «Посадить».",
    );
  }
  private addStars() {
    const positions = new Float32Array(330 * 3);
    for (let i = 0; i < 330; i++) {
      const a = i * 2.3999,
        r = 35 + (i % 13) * 2;
      positions[i * 3] = 8 + Math.cos(a) * r;
      positions[i * 3 + 1] = -12 + ((i * 19) % 67);
      positions[i * 3 + 2] = 8 + Math.sin(a) * r;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    this.scene.add(
      new T.Points(
        geometry,
        new T.PointsMaterial({
          color: 0xdbefff,
          size: 0.12,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.75,
        }),
      ),
    );
  }
  private resize = () => {
    this.renderer.setSize(innerWidth, innerHeight);
    this.updateCamera(1, true);
  };
  private updateCamera(dt: number, instant = false) {
    const aspect = innerWidth / innerHeight,
      overview = this.mode === "planet" || this.mode === "build";
    const desired = new T.Vector3(
      overview ? 8 : this.position.x,
      overview ? -1 : terrainHeight(this.position.x, this.position.z) + 0.2,
      overview ? 8 : this.position.z,
    );
    this.target.lerp(desired, instant ? 1 : 1 - Math.exp(-4 * dt));
    const half = overview
      ? Math.max(10.8, this.zoom) * Math.max(1, (1 / aspect) * 1.03)
      : Math.max(4.6, this.zoom * 0.58);
    const blend = instant ? 1 : 1 - Math.exp(-5 * dt);
    this.cameraHalf += (half - this.cameraHalf) * blend;
    this.cameraHeight +=
      ((this.mode === "build" ? 31 : 24) - this.cameraHeight) * blend;
    this.camera.left = -this.cameraHalf * aspect;
    this.camera.right = this.cameraHalf * aspect;
    this.camera.top = this.cameraHalf;
    this.camera.bottom = -this.cameraHalf;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.target.x + Math.sin(this.theta) * 26,
      this.target.y + this.cameraHeight,
      this.target.z + Math.cos(this.theta) * 26,
    );
    this.camera.lookAt(this.target);
  }
  private bindCamera() {
    const canvas = this.renderer.domElement,
      signal = this.abort.signal,
      pointers = new Map<number, { x: number; y: number }>();
    let moved = false,
      start = { x: 0, y: 0 },
      distance = 0;
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = T.MathUtils.clamp(this.zoom + e.deltaY * 0.009, 6, 18);
      },
      { passive: false, signal },
    );
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
          start = { x: e.clientX, y: e.clientY };
          moved = false;
        } else moved = true;
        distance = 0;
      },
      { signal },
    );
    canvas.addEventListener(
      "pointermove",
      (e) => {
        const previous = pointers.get(e.pointerId);
        if (!previous) return;
        const delta = e.clientX - previous.x;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7)
          moved = true;
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()],
            next = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance)
            this.zoom = T.MathUtils.clamp((this.zoom * distance) / next, 6, 18);
          distance = next;
        } else if (moved) this.theta -= delta * 0.007;
      },
      { signal },
    );
    canvas.addEventListener(
      "pointerup",
      (e) => {
        pointers.delete(e.pointerId);
        if (!moved && pointers.size === 0) this.pick(e.clientX, e.clientY);
        distance = 0;
      },
      { signal },
    );
    canvas.addEventListener(
      "pointercancel",
      (e) => {
        pointers.delete(e.pointerId);
        moved = true;
        distance = 0;
      },
      { signal },
    );
  }
  private pick(clientX: number, clientY: number) {
    if (this.busy || this.flying || this.ui.modalOpen) return;
    this.raycaster.setFromCamera(
      new T.Vector2(
        (clientX / innerWidth) * 2 - 1,
        1 - (clientY / innerHeight) * 2,
      ),
      this.camera,
    );
    const intersections = this.raycaster.intersectObjects(
      this.view.root.children,
      true,
    );
    const hit = intersections[0];
    if (!hit) return;
    const x = Math.round(hit.point.x),
      z = Math.round(hit.point.z);
    if (x < 0 || z < 0 || x > 16 || z > 16) return;
    if (this.mode === "build") {
      this.buildCell = { x, z };
      this.updatePreview();
      return;
    }
    let selection: Selection = { x, z, type: "ground" };
    const resource = nodes(this.store.state.planet).find(
        (n) => n.x === x && n.z === z,
      ),
      building = buildingAt(
        this.store.state.worlds[this.store.state.planet],
        x,
        z,
      );
    if (BEDS.some((b) => b.x === x && b.z === z)) selection.type = "bed";
    else if (Math.hypot(x - SHIP.x, z - SHIP.z) <= 2)
      selection = { x: SHIP.x, z: SHIP.z, type: "ship" };
    else if (resource) selection = { x, z, type: "node", id: resource.id };
    else if (building)
      selection = {
        x: building.x + 0.5,
        z: building.z + 0.5,
        type: "building",
        id: building.id,
      };
    this.approach(selection, () => {
      this.showContext();
      if (
        selection.type === "bed" &&
        !this.store.state.worlds[this.store.state.planet].crops[key(x, z)]
      )
        this.ui.seeds(this.store.state);
    });
  }
  private approach(selection: Selection, done: () => void) {
    if (this.busy || this.flying) return;
    this.stopBuild();
    this.selected = selection;
    this.path = findPath(
      { ...this.store.state, position: this.position },
      selection,
      this.store.now(),
    );
    this.arrived = done;
    this.marker.visible = selection.type !== "ground";
    this.marker.position.set(
      selection.x,
      terrainHeight(selection.x, selection.z) + 0.18,
      selection.z,
    );
    this.mode = "explore";
    if (!this.path.length) {
      if (
        Math.hypot(
          selection.x - this.position.x,
          selection.z - this.position.z,
        ) <= 2.4
      ) {
        this.arrived = undefined;
        done();
      } else {
        this.arrived = undefined;
        this.ui.toast("Не получается подойти. Выберите другую сторону.");
      }
    } else
      this.ui.toast(
        selection.type === "ship" ? "Идём к кораблю…" : "Космонавт уже в пути…",
      );
  }
  private selectNearestBed() {
    const state = this.store.state,
      bed = [...BEDS].sort((a, b) => {
        const rank = (p: typeof a) => {
          const c = state.worlds[state.planet].crops[key(p.x, p.z)];
          return c ? (ready(c, this.store.now()) ? -1000 : 1000) : 0;
        };
        return (
          rank(a) -
          rank(b) +
          Math.hypot(a.x - this.position.x, a.z - this.position.z) -
          Math.hypot(b.x - this.position.x, b.z - this.position.z)
        );
      })[0];
    this.approach({ ...bed, type: "bed" }, () => {
      this.showContext();
      if (!state.worlds[state.planet].crops[key(bed.x, bed.z)])
        this.ui.seeds(state);
    });
  }
  private showContext() {
    if (!this.selected || this.mode === "build") return;
    const selection = this.selected,
      state = this.store.state,
      world = state.worlds[state.planet];
    if (selection.type === "bed") {
      const crop = world.crops[key(selection.x, selection.z)];
      if (!crop)
        this.ui.context(
          "Свободная грядка",
          "Одна маленькая посадка — начало большого сада.",
          "Выбрать семена",
        );
      else
        this.ui.context(
          PLANTS[crop.plant].name,
          ready(crop, this.store.now())
            ? "Урожай созрел! Получите урожай и новые семена."
            : `Растёт · ещё ${Math.max(0, Math.ceil((PLANTS[crop.plant].seconds * 1000 - (this.store.now() - crop.plantedAt)) / 1000))} сек.`,
          ready(crop, this.store.now()) ? "Собрать урожай" : "Пусть растёт",
          !ready(crop, this.store.now()),
        );
    } else if (selection.type === "node") {
      const n = nodes(state.planet).find((n) => n.id === selection.id)!;
      const available = nodeReady(world, n.id, this.store.now());
      this.ui.context(
        n.resource === "wood"
          ? "Дерево"
          : n.resource === "spores"
            ? "Светящийся гриб"
            : "Минеральная жила",
        available
          ? "Соберите 3 единицы ресурса. Источник восстановится через 20 секунд."
          : `Восстановление · ${Math.max(0, Math.ceil((20000 - (this.store.now() - world.depleted[n.id])) / 1000))} сек.`,
        available ? "Собрать" : "Восстанавливается",
        !available,
      );
    } else if (selection.type === "ship")
      this.ui.context(
        "Ваш маленький корабль",
        "Три планеты открыты. Путешествие бесплатное.",
        "Полететь",
      );
    else if (selection.type === "building") {
      const b = world.buildings.find((b) => b.id === selection.id);
      if (b)
        this.ui.context(BUILDINGS[b.kind].name, BUILDINGS[b.kind].description);
    } else this.ui.hideContext();
  }
  private interact() {
    const s = this.selected;
    if (!s || this.busy) return;
    if (Math.hypot(this.position.x - s.x, this.position.z - s.z) > 2.4) {
      this.approach(s, () => this.interact());
      return;
    }
    if (s.type === "bed") {
      const crop =
        this.store.state.worlds[this.store.state.planet].crops[key(s.x, s.z)];
      if (!crop) this.ui.seeds(this.store.state);
      else if (ready(crop, this.store.now()))
        void this.perform(
          { type: "harvest", x: s.x, z: s.z },
          "gather",
          "+3 урожая · +2 семени. Грядка снова свободна!",
        );
    }
    if (s.type === "node")
      void this.perform(
        { type: "mine", id: s.id! },
        "tool",
        "+3 ресурса в вашем рюкзаке.",
      );
    if (s.type === "ship") this.ui.galaxy(this.store.state);
  }
  private async flushMove() {
    if (this.flying) return;
    const old = this.store.state.position;
    if (Math.hypot(old.x - this.position.x, old.z - this.position.z) < 0.02)
      return;
    const position = { ...this.position };
    if (
      walkable(
        this.store.state,
        this.store.state.planet,
        position.x,
        position.z,
        this.store.now(),
      )
    )
      await this.store.action({ type: "move", ...position });
  }
  private async perform(
    action: Action,
    mode: "plant" | "gather" | "tool",
    message: string,
  ) {
    if (this.busy) return;
    this.busy = true;
    this.input.clear();
    this.path = [];
    this.avatar.mode = mode;
    try {
      await this.flushMove();
      await wait(550);
      await this.store.action(action);
      this.view.rebuild(this.store.state, this.store.now());
      this.ui.toast(message);
    } catch (error) {
      this.ui.toast(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить действие.",
      );
    } finally {
      this.busy = false;
      this.avatar.mode = "idle";
      this.showContext();
      this.ui.update(this.store.state, this.store.now());
    }
  }
  private startBuild() {
    if (this.busy || this.flying) return;
    this.ui.close();
    this.selected = undefined;
    this.marker.visible = false;
    this.path = [];
    this.ui.hideContext();
    this.mode = "build";
    this.grid.visible = true;
    this.updatePreview();
  }
  private removePreview() {
    if (this.preview) {
      this.preview.traverse((o) => {
        if (o instanceof T.Mesh) (o.material as T.Material).dispose();
      });
      this.preview.removeFromParent();
      this.preview = undefined;
    }
  }
  private updatePreview() {
    this.removePreview();
    const state = { ...this.store.state, position: this.position },
      valid = canBuild(state, this.buildCell.x, this.buildCell.z);
    this.preview = this.kit.building(this.buildKind, state.planet);
    this.preview.traverse((o) => {
      if (o instanceof T.Mesh) {
        const material = (o.material as T.MeshStandardMaterial).clone();
        material.color.set(valid ? 0x9affb9 : 0xff9a8f);
        material.emissive.set(valid ? 0x4dbb76 : 0xb84f4f);
        material.emissiveIntensity = 0.3;
        material.transparent = true;
        material.opacity = 0.45;
        material.depthWrite = false;
        o.material = material;
        o.castShadow = false;
      }
    });
    this.preview.position.set(
      this.buildCell.x + 0.5,
      terrainHeight(this.buildCell.x, this.buildCell.z) + 0.12,
      this.buildCell.z + 0.5,
    );
    this.preview.rotation.y = (this.rotation * Math.PI) / 2;
    this.scene.add(this.preview);
    this.ui.building(this.buildKind, valid, state);
  }
  private stopBuild() {
    if (this.mode !== "build") return;
    this.mode = "planet";
    this.grid.visible = false;
    this.removePreview();
    this.ui.hideBuilding();
  }
  private async build() {
    const action: Action = {
      type: "build",
      kind: this.buildKind,
      ...this.buildCell,
      rotation: this.rotation,
    };
    await this.perform(
      action,
      "tool",
      `${BUILDINGS[this.buildKind].name} построен. Сделайте этот мир своим!`,
    );
    this.stopBuild();
  }
  private async travel(planet: PlanetId) {
    if (this.busy || this.flying) return;
    this.busy = true;
    this.ui.close();
    this.path = [];
    try {
      await this.flushMove();
      this.flying = true;
      this.avatar.root.visible = false;
      const launch = performance.now(),
        base = this.view.ship.position.y;
      await this.animateFlight(900, (t) => {
        this.view.ship.position.y = base + t * t * 8;
        this.view.ship.rotation.y = t * 0.4;
      });
      this.ui.flight(PLANETS[planet].name, true);
      await this.store.action({ type: "travel", planet });
      await wait(700);
      this.loadPlanet();
      this.view.ship.position.y += 7;
      await this.animateFlight(1000, (t) => {
        this.view.ship.position.y =
          terrainHeight(SHIP.x, SHIP.z) + 0.13 + (1 - t) ** 2 * 7;
      });
      this.ui.toast(`Добро пожаловать: ${PLANETS[planet].name}!`);
      void launch;
    } catch (error) {
      this.loadPlanet();
      this.ui.toast(error instanceof Error ? error.message : "Полёт отменён.");
    } finally {
      this.busy = false;
      this.flying = false;
      this.avatar.root.visible = true;
      this.ui.flight("", false);
    }
  }
  private animateFlight(ms: number, frame: (t: number) => void) {
    return new Promise<void>((done) => {
      const start = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        frame(t);
        if (t < 1) requestAnimationFrame(tick);
        else done();
      };
      tick();
    });
  }
  private loadPlanet() {
    this.view.dispose();
    this.view = new Planet(
      this.store.state.planet,
      this.kit,
      this.store.state,
      this.store.now(),
    );
    this.scene.add(this.view.root);
    this.scene.background = new T.Color(PLANETS[this.store.state.planet].sky);
    this.scene.fog =
      this.store.state.planet === "mycelia"
        ? new T.FogExp2(0x20173d, 0.009)
        : null;
    this.position = { ...this.store.state.position };
    this.selected = undefined;
    this.ui.hideContext();
    this.marker.visible = false;
    this.mode = "planet";
    this.updateCamera(1, true);
    this.ui.update(this.store.state, this.store.now());
  }
  private saveLocalOnExit() {
    try {
      const next = { ...this.store.state, position: { ...this.position } };
      localStorage.setItem("little-planets-v1", JSON.stringify(next));
    } catch {}
  }
  private frame = (time: number) => {
    const dt = Math.min(
      0.08,
      this.previousTime ? (time - this.previousTime) / 1000 : 0,
    );
    const raw = this.previousTime ? (time - this.previousTime) / 1000 : 0;
    this.previousTime = time;
    // Reduce fill rate after sustained slow rendering; never advertise unmeasured FPS.
    this.slowTime =
      raw > 0.045 ? this.slowTime + dt : Math.max(0, this.slowTime - dt);
    if (this.slowTime > 4 && this.adaptiveRatio > 0.8) {
      this.adaptiveRatio = Math.max(0.8, this.adaptiveRatio - 0.15);
      this.renderer.setPixelRatio(this.adaptiveRatio);
      this.slowTime = 0;
    }
    let moving = false;
    if (!this.busy && !this.ui.modalOpen && this.mode !== "build") {
      let input = this.input.read();
      if (Math.hypot(input.x, input.z) > 0.08) {
        this.path = [];
        this.arrived = undefined;
        const right = new T.Vector2(
            Math.cos(this.theta),
            -Math.sin(this.theta),
          ),
          down = new T.Vector2(Math.sin(this.theta), Math.cos(this.theta));
        input = {
          x: right.x * input.x + down.x * input.z,
          z: right.y * input.x + down.y * input.z,
        };
      } else if (this.path.length) {
        const next = this.path[0],
          dx = next.x - this.position.x,
          dz = next.z - this.position.z,
          d = Math.hypot(dx, dz);
        if (d < 0.12) {
          this.path.shift();
          if (!this.path.length && this.arrived) {
            const callback = this.arrived;
            this.arrived = undefined;
            callback();
          }
        }
        input = { x: d > 0.01 ? dx / d : 0, z: d > 0.01 ? dz / d : 0 };
      }
      const speed = 3 * dt,
        nx = this.position.x + input.x * speed,
        nz = this.position.z + input.z * speed;
      if (
        walkable(
          this.store.state,
          this.store.state.planet,
          nx,
          this.position.z,
          this.store.now(),
        )
      )
        this.position.x = nx;
      if (
        walkable(
          this.store.state,
          this.store.state.planet,
          this.position.x,
          nz,
          this.store.now(),
        )
      )
        this.position.z = nz;
      moving = Math.hypot(input.x, input.z) > 0.08;
      if (moving) this.avatar.root.rotation.y = Math.atan2(input.x, input.z);
    }
    const h = terrainHeight(this.position.x, this.position.z) + 0.07;
    this.avatar.root.position.set(this.position.x, h, this.position.z);
    this.avatar.update(time / 1000, dt, moving);
    this.updateCamera(dt);
    this.view.animate(time / 1000);
    this.tick += dt;
    this.saveTick += dt;
    if (this.tick > 0.3) {
      this.tick = 0;
      this.view.updateCrops(this.store.state, this.store.now());
      this.ui.update(this.store.state, this.store.now());
      if (!this.busy) this.showContext();
    }
    if (this.saveTick > 2 && !this.busy) {
      this.saveTick = 0;
      void this.flushMove().catch((error) => {
        this.ui.el("save-status").textContent = error.message;
      });
    }
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.abort.abort();
    this.input.dispose();
    this.telegram.dispose();
    this.removePreview();
    this.view.dispose();
    this.kit.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.Points || o instanceof T.LineSegments) {
        o.geometry.dispose();
        (o.material as T.Material).dispose();
      }
    });
    this.renderer.dispose();
  }
}
