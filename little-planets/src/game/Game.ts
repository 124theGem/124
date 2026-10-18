import {
  sphereNormal,
  sphereCoordinates,
  sphereStep,
  surfaceDistance,
  SPHERE_RADIUS,
} from "../../shared/sphere";
import { SphereWorld, spherePoint, sphereUp } from "../world/SphereWorld";
import { Enemies } from "../world/Enemies";
import { Weather } from "../world/Weather";
import { GameAudio } from "../audio/GameAudio";
import * as T from "three";
import {
  GEAR,
  isSphere,
  biomeOf,
  type GearKind,
  BUILDINGS,
  FURNITURE,
  PLANTS,
  PLANETS,
  ROOM,
  RESOURCE_LABELS,
  beds,
  ship,
  key,
  nodes,
  planetSize,
  terrainHeight,
  allowedBuildings,
  moduleResources,
  type BuildingKind,
  type FurnitureKind,
  type PlanetId,
} from "../../shared/catalog";
import {
  buildingAt,
  buildingCenter,
  canBuild,
  canPlaceFurniture,
  furnitureAt,
  furnitureSize,
  roomItems,
  findPath,
  nodeReady,
  ready,
  stage,
  walkable,
  moduleAmount,
  moduleCapacity,
  worldEvent,
  type Action,
} from "../../shared/model";
import { Persistence } from "../platform/Persistence";
import { Telegram } from "../platform/Telegram";
import { Models } from "../world/Models";
import { Planet } from "../world/Planet";
import { Interior } from "../world/Interior";
import { Life, Atmosphere } from "../world/Life";
import { Astronaut } from "../world/Astronaut";
import { UI } from "../ui/UI";
import { Input } from "./Input";
type Selection = {
  x: number;
  z: number;
  type:
    | "bed"
    | "node"
    | "building"
    | "ship"
    | "ground"
    | "furniture"
    | "door"
    | "meteor"
    | "enemy";
  id?: string;
};
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
export class Game {
  private scene = new T.Scene();
  private renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  private camera = new T.OrthographicCamera(-13, 13, 10, -10, 0.1, 300);
  private kit = new Models();
  private avatar = new Astronaut(this.kit);
  private view!: Planet | Interior | SphereWorld;
  private enemies?: Enemies;
  private weather = new Weather();
  private audio = new GameAudio();
  private lastCombatPoll = 0;
  private pulsePending = false;
  private stepTime = 0;
  private sphereForward = new T.Vector3(0, 0, 1);
  private sphereHeading = new T.Vector3(0, 0, 1);
  private sphereDestination?: { x: number; z: number };
  private life?: Life;
  private atmosphere?: Atmosphere;
  private ui: UI;
  private input: Input;
  private abort = new AbortController();
  private raycaster = new T.Raycaster();
  private sun = new T.DirectionalLight(0xffedcb, 2.6);
  private target = new T.Vector3();
  private position: { x: number; z: number };
  private theta = 0.73;
  private zoom = 1;
  private mode: "explore" | "planet" | "build" = "planet";
  private cameraHalf = 13;
  private selected?: Selection;
  private path: { x: number; z: number }[] = [];
  private arrived?: () => void;
  private busy = false;
  private flying = false;
  private previousTime = 0;
  private tick = 0;
  private saveTick = 0;
  private grid?: T.LineSegments;
  private preview?: T.Group;
  private buildKind: BuildingKind | FurnitureKind = "house";
  private buildResource?: string;
  private buildCell = { x: 16, z: 14 };
  private rotation: 0 | 1 = 0;
  private marker = new T.LineSegments(
    new T.EdgesGeometry(new T.BoxGeometry(0.98, 0.08, 0.98)),
    new T.LineBasicMaterial({ color: 0xffdc8c }),
  );
  private lowQuality = false;
  private adaptiveRatio = Math.min(devicePixelRatio, 1.5);
  private slowTime = 0;
  private flightSamples: {
    phase: string;
    x: number;
    y: number;
    z: number;
    screenX: number;
    screenY: number;
    smoke: number;
  }[] = [];
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
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -16,
      right: 16,
      top: 16,
      bottom: -16,
      near: 1,
      far: 80,
    });
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    const fill = new T.DirectionalLight(0x9ebcff, 0.7);
    fill.position.set(25, 8, -15);
    this.scene.add(fill);
    this.scene.add(this.avatar.root, this.marker, this.weather.root);
    this.marker.visible = false;
    this.loadScene();
    const menu = (fn: () => void) => {
      if (this.busy || this.flying) return;
      this.stopBuild();
      this.clearSelection();
      this.path = [];
      this.sphereDestination = undefined;
      this.arrived = undefined;
      this.input.clear();
      fn();
    };
    this.ui.onInventory = () => menu(() => this.ui.inventory(store.state));
    this.ui.onCraftMenu = () => menu(() => this.ui.craft(store.state));
    this.ui.onOpenRecipe = (id) =>
      menu(() => this.ui.craft(store.state, "Мебель", id));
    this.ui.onPlant = () => this.selectNearestBed();
    this.ui.onAttack = () => void this.attack();
    this.ui.onScan = () => void this.scan();
    this.ui.onAudio = () => this.audio.toggleMute();
    this.ui.onEquip = (slot, item) =>
      void this.perform(
        { type: "equip", slot, item },
        "idle",
        item ? `${GEAR[item].name}: экипировка надета.` : "Экипировка снята.",
      );
    this.ui.onBuild = () => this.startBuild();
    this.ui.onCamera = () => {
      if (this.mode === "build" || this.flying) return;
      this.mode = this.mode === "planet" ? "explore" : "planet";
    };
    this.ui.onSettings = () =>
      menu(() =>
        this.ui.settings(
          telegram.fullscreen,
          () => {
            this.lowQuality = !this.lowQuality;
            this.renderer.shadowMap.enabled = !this.lowQuality;
            this.renderer.setPixelRatio(
              this.lowQuality ? 0.8 : this.adaptiveRatio,
            );
            this.ui.toast(
              this.lowQuality ? "Экономное качество" : "Полное качество",
            );
          },
          this.audio.stats,
          (key, value) => this.audio.set(key, value),
        ),
      );
    this.ui.onSelectPlant = (id) => {
      this.ui.close();
      const s = this.selected;
      if (s?.type === "bed")
        void this.perform(
          { type: "plant", x: s.x, z: s.z, plant: id },
          "plant",
          "Семя посажено.",
        );
    };
    this.ui.onContext = () => this.interact();
    this.ui.onContextClose = () => this.clearSelection();
    this.ui.onGalaxy = () => {
      if (store.state.inside) return;
      this.approach({ ...ship(store.state.planet), type: "ship" }, () => {
        this.ui.hideContext();
        this.ui.galaxy(store.state);
      });
    };
    this.ui.onTravel = (p) => void this.travel(p);
    this.ui.onSelectBuilding = (kind) => {
      this.buildKind = kind;
      this.buildResource = moduleResources(store.state.planet, kind)[0];
      this.updatePreview();
    };
    this.ui.onSelectFurniture = (kind) => {
      this.buildKind = kind;
      this.updatePreview();
    };
    this.ui.onResource = (r) => {
      this.buildResource = r;
      this.updatePreview();
    };
    this.ui.onCancelBuild = () => this.stopBuild();
    this.ui.onRotateBuild = () => {
      this.rotation = this.rotation ? 0 : 1;
      this.updatePreview();
    };
    this.ui.onConfirmBuild = () => void this.build();
    this.ui.onCraft = (recipe) => void this.craft(recipe);
    this.ui.onItemPlace = (id) => {
      const [prefix, kind] = id.split(":");
      if (prefix === "furniture" && !store.state.inside) {
        this.ui.toast("Войдите в главный дом, чтобы разместить мебель.");
        return;
      }
      if (
        prefix === "kit" &&
        (store.state.inside ||
          !allowedBuildings(store.state.planet).includes(kind as BuildingKind))
      ) {
        this.ui.toast("Этот объект предназначен для другой планеты.");
        return;
      }
      this.startBuild(kind as BuildingKind | FurnitureKind);
    };
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "Space" && !this.ui.modalOpen) {
          e.preventDefault();
          void this.attack();
        }
        if (e.code === "Escape") {
          if (this.ui.modalOpen) this.ui.close();
          else if (this.mode === "build") this.stopBuild();
          else this.clearSelection();
          this.ui.toggleMenu(false);
        }
      },
      { signal: this.abort.signal },
    );
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
    this.renderer.setAnimationLoop(this.frame);
    if (new URLSearchParams(location.search).has("debug"))
      Object.defineProperty(window, "__planets", {
        configurable: true,
        value: {
          project: (x: number, z: number, y = 0) => {
            const p = (
              isSphere(store.state.planet)
                ? spherePoint({ x, z }, y)
                : new T.Vector3(x, this.height(x, z) + y, z)
            ).project(this.camera);
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
            animals: this.life?.positions ?? [],
            event: worldEvent(store.state, store.state.planet, store.now()),
            flightSamples: this.flightSamples.slice(),
            ratio: this.renderer.getPixelRatio(),
            audio: this.audio.stats,
            weather: this.weather.stats,
            playerWorld: this.avatar.root.position.toArray(),
            playerUp: new T.Vector3(0, 1, 0)
              .applyQuaternion(this.avatar.root.quaternion)
              .toArray(),
            sphereForward: this.sphereForward.toArray(),
          }),
        },
      });
    this.ui.toast("Нажмите ☰ для меню. Приятного путешествия!");
  }
  private async scan() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.flushMove();
      await this.store.action({ type: "scan" });
      this.ui.galaxy(this.store.state, "");
      this.audio.play("gather");
    } catch (e) {
      this.ui.toast((e as Error).message);
    } finally {
      this.busy = false;
    }
  }
  private async attack(id?: string) {
    if (
      this.busy ||
      this.flying ||
      this.ui.modalOpen ||
      this.store.state.inside ||
      !PLANETS[this.store.state.planet].hostile
    )
      return;
    const state = this.store.state,
      weapon = state.equipment.weapon ? GEAR[state.equipment.weapon] : null;
    if (this.store.now() - state.lastAttack < (weapon?.cooldown ?? 650)) return;
    const enemies = state.worlds[state.planet].enemies.filter((e) => e.hp > 0),
      target =
        enemies.find(
          (e) =>
            e.id ===
            (id ??
              (this.selected?.type === "enemy" ? this.selected.id : undefined)),
        ) ??
        enemies.sort(
          (a, b) =>
            Math.hypot(a.x - this.position.x, a.z - this.position.z) -
            Math.hypot(b.x - this.position.x, b.z - this.position.z),
        )[0];
    if (!target) {
      this.ui.toast("Поблизости нет противников.");
      return;
    }
    if (
      Math.hypot(target.x - this.position.x, target.z - this.position.z) >
      (weapon?.range ?? 1.9)
    ) {
      this.approach(
        { x: target.x, z: target.z, type: "enemy", id: target.id },
        () => this.showContext(),
      );
      return;
    }
    this.audio.play("attack");
    this.avatar.root.rotation.y = Math.atan2(
      target.x - this.position.x,
      target.z - this.position.z,
    );
    await this.perform(
      { type: "attack", id: target.id },
      "attack",
      "Удар нанесён.",
    );
  }
  private async combatPulse() {
    this.pulsePending = true;
    try {
      await this.flushMove();
      const previous = this.store.state.planet,
        hp = this.store.state.health;
      await this.store.action({ type: "combatTick" });
      if (this.store.state.planet !== previous) {
        this.loadScene();
        this.ui.toast(
          "Вы вернулись на Родную после поражения. Экипировка сохранена.",
        );
      } else if (this.store.state.health < hp) this.audio.play("hurt");
    } catch (e) {
      this.ui.el("save-status").textContent = (e as Error).message;
    } finally {
      this.pulsePending = false;
    }
  }
  private updateSphereCamera(dt: number, instant = false) {
    const aspect = innerWidth / innerHeight,
      n = sphereUp(this.position),
      forward = this.sphereForward
        .clone()
        .addScaledVector(n, -this.sphereForward.dot(n))
        .normalize();
    this.sphereForward.copy(forward);
    const overview = this.mode === "planet",
      target = overview ? new T.Vector3() : spherePoint(this.position, 0.5),
      position = overview
        ? n
            .clone()
            .multiplyScalar(SPHERE_RADIUS + 32)
            .addScaledVector(forward, 22)
        : spherePoint(this.position, 12).addScaledVector(forward, 14),
      blend = instant ? 1 : 1 - Math.exp(-7 * dt);
    this.target.copy(target);
    this.camera.up.copy(n);
    this.camera.position.lerp(position, blend);
    const half =
      (overview ? SPHERE_RADIUS * 1.16 : 6.5) *
      this.zoom *
      Math.max(1, 1.05 / aspect);
    this.cameraHalf += (half - this.cameraHalf) * blend;
    this.camera.left = -this.cameraHalf * aspect;
    this.camera.right = this.cameraHalf * aspect;
    this.camera.top = this.cameraHalf;
    this.camera.bottom = -this.cameraHalf;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }
  private moveSphere(dt: number) {
    if (this.busy || this.ui.modalOpen || this.flying) return false;
    const input = this.input.read(),
      up = sphereUp(this.position),
      right = new T.Vector3().crossVectors(up, this.sphereForward).normalize();
    let direction = new T.Vector3();
    if (Math.hypot(input.x, input.z) > 0.08) {
      this.sphereDestination = undefined;
      this.arrived = undefined;
      this.clearSelection();
      direction
        .addScaledVector(right, input.x)
        .addScaledVector(this.sphereForward, input.z);
      this.mode = "explore";
    } else if (this.sphereDestination) {
      const goal = sphereUp(this.sphereDestination);
      if (surfaceDistance(this.position, this.sphereDestination, true) < 1.45) {
        this.sphereDestination = undefined;
        const done = this.arrived;
        this.arrived = undefined;
        done?.();
        return false;
      }
      direction.copy(goal).addScaledVector(up, -goal.dot(up));
    }
    if (direction.lengthSq() < 1e-8) return false;
    direction.normalize();
    const next = sphereStep(this.position, direction, 6 * dt),
      nextUp = sphereUp(next),
      transport = new T.Quaternion().setFromUnitVectors(up, nextUp);
    this.sphereForward.applyQuaternion(transport).normalize();
    this.sphereHeading.copy(direction).applyQuaternion(transport).normalize();
    this.position = next;
    return true;
  }
  private height(x: number, z: number) {
    return this.store.state.inside ? 0 : terrainHeight(x, z);
  }
  private resize = () => {
    this.renderer.setSize(innerWidth, innerHeight);
    if (!this.flying) this.updateCamera(1, true);
  };
  private updateCamera(dt: number, instant = false) {
    if (this.flying) return;
    if (isSphere(this.store.state.planet)) {
      this.updateSphereCamera(dt, instant);
      return;
    }
    this.camera.up.set(0, 1, 0);
    const state = this.store.state,
      inside = !!state.inside,
      size = inside ? 12 : planetSize(state.planet),
      aspect = innerWidth / innerHeight,
      overview = this.mode !== "explore";
    const desired = new T.Vector3(
      overview ? (size - 1) / 2 : this.position.x,
      overview
        ? inside
          ? 0
          : this.height(size / 2, size / 2) - 0.5
        : this.height(this.position.x, this.position.z) + 0.4,
      overview ? (inside ? 4.5 : (size - 1) / 2) : this.position.z,
    );
    const blend = instant ? 1 : 1 - Math.exp(-5 * dt);
    this.target.lerp(desired, blend);
    const half =
      (overview ? (inside ? 7 : size * 0.66) : inside ? 4.5 : 6.5) *
      this.zoom *
      Math.max(1, 1.05 / aspect);
    this.cameraHalf += (half - this.cameraHalf) * blend;
    this.camera.left = -this.cameraHalf * aspect;
    this.camera.right = this.cameraHalf * aspect;
    this.camera.top = this.cameraHalf;
    this.camera.bottom = -this.cameraHalf;
    this.camera.updateProjectionMatrix();
    const radius = inside ? 18 : 32;
    this.camera.position.set(
      this.target.x + Math.sin(this.theta) * radius,
      this.target.y + (inside ? 22 : 32),
      this.target.z + Math.cos(this.theta) * radius,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
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
        this.zoom = T.MathUtils.clamp(this.zoom + e.deltaY * 0.0007, 0.65, 1.5);
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
            this.zoom = T.MathUtils.clamp(
              (this.zoom * distance) / next,
              0.65,
              1.5,
            );
          distance = next;
        } else if (moved && !this.flying) {
          this.theta -= delta * 0.007;
          if (isSphere(this.store.state.planet))
            this.sphereForward
              .applyAxisAngle(sphereUp(this.position), -delta * 0.007)
              .normalize();
        }
      },
      { signal },
    );
    canvas.addEventListener(
      "pointerup",
      (e) => {
        pointers.delete(e.pointerId);
        if (!moved && !pointers.size) this.pick(e.clientX, e.clientY);
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
    if (this.view instanceof SphereWorld) {
      const point = this.view.pick(this.raycaster.ray);
      if (!point) return;
      let selected: Selection = { ...point, type: "ground" };
      const pad = ship("orbis"),
        node = nodes("orbis").find(
          (n) => surfaceDistance(point, n, true) < 1.1,
        );
      if (surfaceDistance(point, pad, true) < 2.6)
        selected = { ...pad, type: "ship" };
      else if (node)
        selected = { x: node.x, z: node.z, type: "node", id: node.id };
      this.approach(selected, () => this.showContext());
      return;
    }
    const enemyId = this.enemies?.pick(this.raycaster.ray);
    if (enemyId) {
      const enemy = this.store.state.worlds[
        this.store.state.planet
      ].enemies.find((e) => e.id === enemyId);
      if (enemy?.hp) {
        this.approach(
          { x: enemy.x, z: enemy.z, type: "enemy", id: enemyId },
          () => this.showContext(),
        );
        return;
      }
    }
    const targets = [
        this.view.root,
        ...(this.atmosphere ? [this.atmosphere.picking] : []),
      ],
      hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    const x = Math.round(hit.point.x),
      z = Math.round(hit.point.z),
      state = this.store.state;
    if (
      x < 0 ||
      z < 0 ||
      x >= (state.inside ? ROOM.width : planetSize(state.planet)) ||
      z >= (state.inside ? ROOM.depth : planetSize(state.planet))
    )
      return;
    if (this.mode === "build") {
      this.buildCell = { x, z };
      this.updatePreview();
      return;
    }
    let s: Selection = { x, z, type: "ground" };
    if (state.inside) {
      const f = furnitureAt(state, x, z);
      if (Math.hypot(x - ROOM.door.x, z - ROOM.door.z) < 1.8)
        s = { ...ROOM.door, type: "door" };
      else if (f) {
        const size = furnitureSize(f.kind, f.rotation);
        s = {
          x: f.x + (size.w - 1) / 2,
          z: f.z + (size.d - 1) / 2,
          type: "furniture",
          id: f.id,
        };
      }
    } else {
      const n = nodes(state.planet).find((n) => n.x === x && n.z === z),
        b = buildingAt(state.worlds[state.planet], x, z),
        pad = ship(state.planet),
        event = worldEvent(state, state.planet, this.store.now());
      if (
        event?.type === "meteor" &&
        !event.claimed &&
        this.store.now() >= event.impactAt &&
        Math.hypot(x - event.x, z - event.z) < 1.1
      )
        s = { x: event.x, z: event.z, type: "meteor", id: String(event.id) };
      else if (beds(state.planet).some((b) => b.x === x && b.z === z))
        s.type = "bed";
      else if (Math.hypot(x - pad.x, z - pad.z) <= 2)
        s = { ...pad, type: "ship" };
      else if (n) s = { x, z, type: "node", id: n.id };
      else if (b) s = { ...buildingCenter(b), type: "building", id: b.id };
    }
    this.approach(s, () => this.showContext());
  }
  private clearSelection() {
    this.selected = undefined;
    this.marker.visible = false;
    this.ui.hideContext();
  }
  private approach(s: Selection, done: () => void) {
    if (this.busy || this.flying || this.ui.modalOpen) return;
    this.stopBuild();
    this.clearSelection();
    this.selected = s;
    this.sphereDestination = undefined;
    if (isSphere(this.store.state.planet)) {
      this.sphereDestination = { x: s.x, z: s.z };
      this.arrived = done;
      this.path = [];
      this.mode = "explore";
      this.marker.visible = false;
      return;
    }
    this.path = findPath(
      { ...this.store.state, position: this.position },
      s,
      this.store.now(),
      s.type === "building" ? 2.4 : s.type === "door" ? 1 : 1.5,
    );
    this.arrived = done;
    this.marker.visible = s.type !== "ground";
    this.marker.position.set(s.x, this.height(s.x, s.z) + 0.18, s.z);
    this.mode = "explore";
    if (!this.path.length) {
      this.arrived = undefined;
      if (Math.hypot(s.x - this.position.x, s.z - this.position.z) <= 2.7)
        done();
      else this.ui.toast("Не получается подойти. Выберите другую сторону.");
    }
  }
  private selectNearestBed() {
    if (this.store.state.inside || isSphere(this.store.state.planet)) return;
    const b = [...beds(this.store.state.planet)].sort(
      (a, b) =>
        Math.hypot(a.x - this.position.x, a.z - this.position.z) -
        Math.hypot(b.x - this.position.x, b.z - this.position.z),
    )[0];
    this.approach({ ...b, type: "bed" }, () => this.showContext());
  }
  private showContext() {
    const s = this.selected,
      state = this.store.state,
      world = state.worlds[state.planet],
      now = this.store.now();
    if (!s || this.mode === "build") return;
    if (s.type === "enemy") {
      const e = world.enemies.find((e) => e.id === s.id && e.hp > 0);
      if (!e) {
        this.clearSelection();
        return;
      }
      s.x = e.x;
      s.z = e.z;
      this.ui.context(
        e.kind === "drone"
          ? "Древний дрон"
          : e.kind === "stalker"
            ? "Кристальный страж"
            : "Панцирный хищник",
        `Здоровье: ${e.hp} / ${e.maxHp}. Победа приносит ресурсы.`,
        "Атаковать",
      );
    } else if (s.type === "bed") {
      const c = world.crops[key(s.x, s.z)];
      this.ui.context(
        c ? PLANTS[c.plant].name : "Свободная грядка",
        c
          ? ready(c, now)
            ? "Урожай созрел: +3 урожая и +2 семени."
            : `Растёт · ещё ${Math.ceil((PLANTS[c.plant].seconds * 1000 - now + c.plantedAt) / 1000)} сек.`
          : "Выберите семена для этой грядки.",
        c ? (ready(c, now) ? "Собрать урожай" : "Растёт") : "Выбрать семена",
        !!c && !ready(c, now),
      );
    } else if (s.type === "node") {
      const n = nodes(state.planet).find((n) => n.id === s.id)!;
      this.ui.context(
        RESOURCE_LABELS[n.resource],
        nodeReady(world, n.id, now)
          ? "Соберите 3 единицы ресурса. Восстановление: 20 секунд."
          : "Источник восстанавливается.",
        nodeReady(world, n.id, now) ? "Собрать" : "Восстанавливается",
        !nodeReady(world, n.id, now),
      );
    } else if (s.type === "ship")
      this.ui.context(
        "Корабль",
        "Выберите знакомый мир или найдите случайную планету сканером.",
        "Полететь",
      );
    else if (s.type === "door")
      this.ui.context("Дверь", "Вернуться на родную планету.", "Выйти");
    else if (s.type === "furniture") {
      const f = roomItems(state).find((f) => f.id === s.id);
      if (f)
        this.ui.context(
          FURNITURE[f.kind].name,
          "Вернуть предмет в рюкзак, чтобы переставить.",
          "В рюкзак",
        );
    } else if (s.type === "meteor")
      this.ui.context(
        "Упавший метеорит",
        "Исследуйте обломки: +4 кристалла, +6 камня.",
        "Исследовать",
      );
    else if (s.type === "building") {
      const b = world.buildings.find((b) => b.id === s.id);
      if (!b) return;
      this.ui.context(
        BUILDINGS[b.kind].name,
        b.resource
          ? `${RESOURCE_LABELS[b.resource]}: ${moduleAmount(state, b, now)} / ${moduleCapacity(state)}. +3 каждые 20 секунд.`
          : BUILDINGS[b.kind].description,
        b.kind === "headquarters"
          ? "Войти"
          : b.resource
            ? "Забрать ресурсы"
            : undefined,
        !!b.resource && !moduleAmount(state, b, now),
      );
    } else this.ui.hideContext();
  }
  private interact() {
    const s = this.selected;
    if (!s || this.busy) return;
    const state = this.store.state;
    if (s.type === "enemy") {
      void this.attack(s.id);
      return;
    }
    if (s.type === "bed") {
      const c = state.worlds[state.planet].crops[key(s.x, s.z)];
      if (!c) this.ui.seeds(state);
      else if (ready(c, this.store.now()))
        void this.perform(
          { type: "harvest", x: s.x, z: s.z },
          "gather",
          "Урожай в рюкзаке.",
        );
    } else if (s.type === "node")
      void this.perform({ type: "mine", id: s.id! }, "tool", "+3 ресурса.");
    else if (s.type === "ship") this.ui.galaxy(state);
    else if (s.type === "door")
      void this.perform({ type: "exit" }, "idle", "Вы снова дома, на планете.");
    else if (s.type === "furniture")
      void this.perform(
        { type: "takeFurniture", id: s.id! },
        "tool",
        "Предмет возвращён в рюкзак.",
      );
    else if (s.type === "meteor")
      void this.perform(
        { type: "salvage", event: Number(s.id) },
        "tool",
        "+4 кристалла · +6 камня.",
      );
    else if (s.type === "building") {
      const b = state.worlds[state.planet].buildings.find((b) => b.id === s.id);
      if (b?.kind === "headquarters")
        void this.perform(
          { type: "enter", id: b.id },
          "idle",
          "Главный дом · обустройте его через меню «Мебель».",
        );
      else if (b?.resource)
        void this.perform(
          { type: "collect", id: b.id },
          "gather",
          "Добытые ресурсы в рюкзаке.",
        );
    }
  }
  private async flushMove() {
    if (this.flying) return;
    const old = this.store.state.position;
    if (Math.hypot(old.x - this.position.x, old.z - this.position.z) < 0.02)
      return;
    const p = { ...this.position };
    if (
      walkable(
        this.store.state,
        this.store.state.planet,
        p.x,
        p.z,
        this.store.now(),
      )
    ) {
      const oldPlanet = this.store.state.planet;
      await this.store.action({ type: "move", ...p });
      if (this.store.state.planet !== oldPlanet) {
        this.loadScene();
        this.ui.toast("Вы вернулись на Родную после поражения.");
      }
    }
  }
  private async perform(
    action: Action,
    mode: "plant" | "gather" | "tool" | "idle" | "attack",
    message: string,
  ) {
    if (this.busy) return;
    this.busy = true;
    this.input.clear();
    this.path = [];
    this.arrived = undefined;
    this.avatar.mode = mode;
    try {
      await this.flushMove();
      if (mode !== "idle") await wait(mode === "attack" ? 100 : 280);
      const oldInside = this.store.state.inside,
        oldPlanet = this.store.state.planet,
        oldHealth = this.store.state.health,
        oldKills = this.store.state.kills;
      await this.store.action(action);
      if (
        oldInside !== this.store.state.inside ||
        oldPlanet !== this.store.state.planet
      )
        this.loadScene();
      else if (!["attack", "equip", "combatTick"].includes(action.type))
        this.rebuild();
      this.avatar.equip(
        this.store.state.equipment.weapon,
        this.store.state.equipment.armor,
      );
      if (action.type === "attack") {
        const e = this.store.state.worlds[this.store.state.planet].enemies.find(
          (e) => e.id === action.id,
        );
        if (e) this.enemies?.hit(e.x, e.z, this.previousTime / 1000);
        this.audio.play(this.store.state.kills > oldKills ? "kill" : "hit");
      } else if (action.type === "craft") this.audio.play("craft");
      else if (action.type === "build" || action.type === "placeFurniture")
        this.audio.play("build");
      else if (mode === "plant") this.audio.play("plant");
      else if (mode === "gather" || mode === "tool") this.audio.play("gather");
      if (this.store.state.health < oldHealth) this.audio.play("hurt");
      this.ui.refreshModal(this.store.state);
      this.clearSelection();
      this.ui.toast(message);
    } catch (e) {
      this.ui.toast(
        e instanceof Error ? e.message : "Не удалось сохранить действие.",
      );
    } finally {
      this.busy = false;
      this.avatar.mode = "idle";
      this.ui.update(this.store.state, this.store.now());
    }
  }
  private async craft(recipe: string) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.store.action({ type: "craft", recipe, count: 1 });
      this.ui.toast("Предмет создан и помещён в рюкзак.");
      this.audio.play("craft");
      this.ui.refreshModal(this.store.state);
    } catch (e) {
      this.ui.toast((e as Error).message);
    } finally {
      this.busy = false;
      this.ui.update(this.store.state, this.store.now());
    }
  }
  private startBuild(kind?: BuildingKind | FurnitureKind) {
    if (this.busy || this.flying || isSphere(this.store.state.planet)) return;
    this.ui.close();
    this.clearSelection();
    this.path = [];
    this.arrived = undefined;
    this.mode = "build";
    this.buildKind =
      kind ??
      (this.store.state.inside
        ? "chair"
        : this.store.state.planet === "home"
          ? "house"
          : allowedBuildings(this.store.state.planet)[0]);
    this.buildResource = this.store.state.inside
      ? undefined
      : moduleResources(
          this.store.state.planet,
          this.buildKind as BuildingKind,
        )[0];
    this.buildCell = this.store.state.inside
      ? { x: 3, z: 3 }
      : this.store.state.planet === "home"
        ? { x: 16, z: 14 }
        : { x: 7, z: 5 };
    if (!this.validPlacement())
      for (let z = 1; z < planetSize(this.store.state.planet) - 2; z++) {
        let found = false;
        for (let x = 1; x < planetSize(this.store.state.planet) - 2; x++) {
          this.buildCell = { x, z };
          if (this.validPlacement()) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
    if (this.grid) this.grid.visible = true;
    this.updatePreview();
  }
  private validPlacement() {
    const state = { ...this.store.state, position: this.position },
      p = this.buildCell;
    if (state.inside)
      return canPlaceFurniture(
        state,
        p.x,
        p.z,
        this.buildKind as FurnitureKind,
        this.rotation,
      );
    const kind = this.buildKind as BuildingKind;
    if (!canBuild(state, p.x, p.z, kind, this.store.now())) return false;
    if (BUILDINGS[kind].zone === "outpost") {
      const c = { x: p.x + 0.5, z: p.z + 0.5 };
      return nodes(state.planet).some(
        (n) =>
          n.resource === this.buildResource &&
          Math.hypot(c.x - n.x, c.z - n.z) <= 5,
      );
    }
    return true;
  }
  private removePreview() {
    if (!this.preview) return;
    this.preview.traverse((o) => {
      if (o instanceof T.Mesh) (o.material as T.Material).dispose();
    });
    this.preview.removeFromParent();
    this.preview = undefined;
  }
  private updatePreview() {
    this.removePreview();
    const state = this.store.state,
      valid = this.validPlacement();
    this.preview = state.inside
      ? this.kit.furniture(this.buildKind as FurnitureKind)
      : this.kit.building(this.buildKind as BuildingKind, state.planet);
    this.preview.traverse((o) => {
      if (o instanceof T.Mesh) {
        const m = (o.material as T.MeshStandardMaterial).clone();
        m.color.set(valid ? 0x9affb9 : 0xff9a8f);
        m.emissive.set(valid ? 0x4dbb76 : 0xb84f4f);
        m.emissiveIntensity = 0.3;
        m.transparent = true;
        m.opacity = 0.45;
        m.depthWrite = false;
        o.material = m;
        o.castShadow = false;
      }
    });
    const size = state.inside
        ? furnitureSize(this.buildKind as FurnitureKind, this.rotation)
        : {
            w: BUILDINGS[this.buildKind as BuildingKind].size,
            d: BUILDINGS[this.buildKind as BuildingKind].size,
          },
      x = this.buildCell.x + (size.w - 1) / 2,
      z = this.buildCell.z + (size.d - 1) / 2;
    this.preview.position.set(x, this.height(x, z) + 0.06, z);
    this.preview.rotation.y = (this.rotation * Math.PI) / 2;
    this.scene.add(this.preview);
    this.ui.placement(state, this.buildKind, valid, this.buildResource);
  }
  private stopBuild() {
    if (this.mode !== "build") return;
    this.mode = "explore";
    if (this.grid) this.grid.visible = false;
    this.removePreview();
    this.ui.hideBuilding();
  }
  private async build() {
    const p = this.buildCell;
    await this.perform(
      this.store.state.inside
        ? {
            type: "placeFurniture",
            kind: this.buildKind as FurnitureKind,
            ...p,
            rotation: this.rotation,
          }
        : {
            type: "build",
            kind: this.buildKind as BuildingKind,
            ...p,
            rotation: this.rotation,
            ...(this.buildResource ? { resource: this.buildResource } : {}),
          },
      "tool",
      "Объект размещён.",
    );
    this.stopBuild();
  }
  private rebuild() {
    if (this.view instanceof Planet || this.view instanceof SphereWorld)
      this.view.rebuild(this.store.state, this.store.now());
    else this.view.rebuild(this.store.state);
  }
  private makeGrid() {
    if (this.grid) {
      this.grid.geometry.dispose();
      (this.grid.material as T.Material).dispose();
      this.grid.removeFromParent();
    }
    if (isSphere(this.store.state.planet)) {
      this.grid = undefined;
      return;
    }
    const state = this.store.state,
      w = state.inside ? ROOM.width : planetSize(state.planet),
      d = state.inside ? ROOM.depth : w,
      coords: number[] = [];
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        const h = this.height(x, z) + 0.1;
        coords.push(
          x - 0.5,
          h,
          z - 0.5,
          x + 0.5,
          h,
          z - 0.5,
          x - 0.5,
          h,
          z - 0.5,
          x - 0.5,
          h,
          z + 0.5,
        );
      }
    this.grid = new T.LineSegments(
      new T.BufferGeometry().setAttribute(
        "position",
        new T.Float32BufferAttribute(coords, 3),
      ),
      new T.LineBasicMaterial({
        color: 0xb8dfbf,
        transparent: true,
        opacity: 0.45,
      }),
    );
    this.grid.visible = false;
    this.scene.add(this.grid);
  }
  private loadScene() {
    this.removePreview();
    this.view?.dispose();
    this.life?.dispose();
    this.enemies?.dispose();
    this.enemies = undefined;
    this.atmosphere?.dispose();
    this.life = undefined;
    this.atmosphere = undefined;
    const state = this.store.state;
    if (state.inside) {
      this.view = new Interior(this.kit, state);
      this.scene.background = new T.Color(0x182735);
      this.scene.fog = null;
    } else {
      if (isSphere(state.planet)) {
        this.view = new SphereWorld(this.kit, state, this.store.now());
        const n = sphereUp(state.position),
          longitude = (state.position.x / 120) * Math.PI * 2;
        this.sphereForward
          .set(
            Math.cos(longitude) * n.y,
            -Math.sin((state.position.z / 60) * Math.PI),
            Math.sin(longitude) * n.y,
          )
          .normalize();
        this.sphereHeading.copy(this.sphereForward);
      } else
        this.view = new Planet(state.planet, this.kit, state, this.store.now());
      if (!isSphere(state.planet))
        this.life = new Life(this.kit, state.planet, state);
      this.atmosphere = new Atmosphere(this.kit);
      if (this.life) this.scene.add(this.life.root);
      this.scene.add(this.atmosphere.root);
      if (PLANETS[state.planet].hostile) {
        this.enemies = new Enemies(this.kit, state);
        this.scene.add(this.enemies.root);
      }
      this.scene.background = new T.Color(PLANETS[state.planet].sky);
      this.scene.fog =
        state.planet === "mycelia" ? new T.FogExp2(0x20173d, 0.009) : null;
    }
    this.scene.add(this.view.root);
    if (!isSphere(state.planet)) this.avatar.root.quaternion.identity();
    this.position = { ...state.position };
    this.sphereDestination = undefined;
    this.avatar.equip(state.equipment.weapon, state.equipment.armor);
    this.clearSelection();
    this.path = [];
    this.arrived = undefined;
    this.mode = state.inside ? "planet" : "explore";
    this.makeGrid();
    this.ui.update(state, this.store.now());
    this.updateCamera(1, true);
  }
  private async travel(planet: PlanetId) {
    if (
      this.busy ||
      this.flying ||
      this.store.state.inside ||
      this.view instanceof Interior
    )
      return;
    this.busy = true;
    this.ui.close();
    this.clearSelection();
    this.path = [];
    try {
      await this.flushMove();
      this.flying = true;
      this.avatar.root.visible = false;
      this.ui.root.classList.add("in-flight");
      this.flightSamples = [];
      const source = this.view as Planet | SphereWorld,
        base = source.ship.position.clone(),
        launchUp = isSphere(this.store.state.planet)
          ? sphereUp(ship(this.store.state.planet))
          : new T.Vector3(0, 1, 0);
      this.atmosphere?.startLaunch(
        source.ship.position.x,
        base.y,
        source.ship.position.z,
        launchUp,
      );
      this.audio.play("launch");
      await this.animateFlight(1500, (t) => {
        source.ship.position.copy(base).addScaledVector(launchUp, t * t * 13);
        this.atmosphere?.setExhaust(t * t * 13);
        this.sampleFlight("launch", source.ship);
      });
      this.ui.flight(PLANETS[planet].name, true);
      await this.store.action({ type: "travel", planet });
      await wait(650);
      this.flying = false;
      this.loadScene();
      this.position = { ...ship(planet) };
      this.mode = "explore";
      this.updateCamera(1, true);
      this.position = { ...this.store.state.position };
      this.flying = true;
      this.ui.flight("", false);
      const dest = this.view as Planet | SphereWorld,
        destBase = dest.ship.position.clone(),
        destUp = isSphere(planet)
          ? sphereUp(ship(planet))
          : new T.Vector3(0, 1, 0);
      this.atmosphere?.startLaunch(
        dest.ship.position.x,
        destBase.y,
        dest.ship.position.z,
        destUp,
      );
      await this.animateFlight(1400, (t) => {
        dest.ship.position
          .copy(destBase)
          .addScaledVector(destUp, (1 - t) ** 2 * 13);
        this.atmosphere?.setExhaust((1 - t) ** 2 * 13);
        this.sampleFlight("landing", dest.ship);
      });
      this.audio.play("land");
      this.ui.toast(`Добро пожаловать: ${PLANETS[planet].name}!`);
    } catch (e) {
      this.flying = false;
      this.loadScene();
      this.ui.toast((e as Error).message);
    } finally {
      this.atmosphere?.stopLaunch();
      this.busy = false;
      this.flying = false;
      this.avatar.root.visible = true;
      this.ui.flight("", false);
      this.ui.root.classList.remove("in-flight");
    }
  }
  private sampleFlight(phase: string, object: T.Object3D) {
    const p = object.position.clone().project(this.camera);
    if (this.flightSamples.length < 300)
      this.flightSamples.push({
        phase,
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
        screenX: p.x,
        screenY: p.y,
        smoke: this.atmosphere?.smokeCount ?? 0,
      });
  }
  private animateFlight(ms: number, frame: (t: number) => void) {
    return new Promise<void>((done) => {
      const start = performance.now(),
        tick = () => {
          const t = Math.min(1, (performance.now() - start) / ms);
          frame(t);
          if (t < 1) requestAnimationFrame(tick);
          else done();
        };
      tick();
    });
  }
  private saveLocalOnExit() {
    try {
      localStorage.setItem(
        "little-planets-v3",
        JSON.stringify({ ...this.store.state, position: { ...this.position } }),
      );
    } catch {}
  }
  private frame = (time: number) => {
    const raw = this.previousTime ? (time - this.previousTime) / 1000 : 0,
      dt = Math.min(0.08, raw);
    this.previousTime = time;
    this.slowTime =
      raw > 0.045 ? this.slowTime + dt : Math.max(0, this.slowTime - dt);
    if (this.slowTime > 4 && this.adaptiveRatio > 0.8) {
      this.adaptiveRatio = Math.max(0.8, this.adaptiveRatio - 0.15);
      this.renderer.setPixelRatio(this.adaptiveRatio);
      this.slowTime = 0;
    }
    let moving = false;
    if (isSphere(this.store.state.planet)) moving = this.moveSphere(dt);
    else if (!this.busy && !this.ui.modalOpen && this.mode !== "build") {
      let input = this.input.read();
      if (Math.hypot(input.x, input.z) > 0.08) {
        this.path = [];
        this.arrived = undefined;
        if (this.selected) this.clearSelection();
        input = {
          x: Math.cos(this.theta) * input.x + Math.sin(this.theta) * input.z,
          z: -Math.sin(this.theta) * input.x + Math.cos(this.theta) * input.z,
        };
        this.mode = "explore";
      } else if (this.path.length) {
        const next = this.path[0],
          dx = next.x - this.position.x,
          dz = next.z - this.position.z,
          d = Math.hypot(dx, dz);
        if (d < 0.1) {
          this.path.shift();
          input = { x: 0, z: 0 };
          if (!this.path.length && this.arrived) {
            const callback = this.arrived;
            this.arrived = undefined;
            callback();
          }
        } else input = { x: dx / d, z: dz / d };
      }
      const speed = Math.min(3 * dt, 0.2),
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
    if (isSphere(this.store.state.planet)) {
      const up = sphereUp(this.position),
        heading = this.sphereHeading
          .clone()
          .addScaledVector(up, -this.sphereHeading.dot(up))
          .normalize(),
        right = new T.Vector3().crossVectors(up, heading).normalize();
      this.avatar.root.position.copy(spherePoint(this.position, 0.06));
      this.avatar.root.quaternion.setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, heading),
      );
    } else {
      this.avatar.root.position.set(
        this.position.x,
        this.height(this.position.x, this.position.z) + 0.07,
        this.position.z,
      );
    }
    if (moving) {
      this.stepTime += dt;
      if (this.stepTime > 0.28) {
        this.stepTime = 0;
        this.audio.play("step");
      }
    }
    this.avatar.update(time / 1000, dt, moving);
    this.updateCamera(dt);
    this.sun.position.set(
      this.target.x - 8,
      this.target.y + 26,
      this.target.z + 16,
    );
    if (isSphere(this.store.state.planet))
      this.sun.position
        .copy(this.avatar.root.position)
        .addScaledVector(sphereUp(this.position), 30)
        .addScaledVector(this.sphereForward, 16);
    this.sun.target.position.copy(this.target);
    this.view.animate(time / 1000);
    this.life?.update(this.store.state, time / 1000, dt);
    this.enemies?.update(this.store.state, time / 1000, dt);
    this.weather.update(
      this.store.state,
      this.position,
      this.store.now(),
      time / 1000,
    );
    this.audio.weather(this.weather.type ?? undefined);
    if (this.weather.thunder) this.audio.play("thunder");
    this.atmosphere?.update(this.store.state, this.store.now(), time / 1000);
    this.tick += dt;
    this.saveTick += dt;
    if (this.tick > 0.25) {
      this.tick = 0;
      if (this.view instanceof Planet || this.view instanceof SphereWorld)
        this.view.updateCrops(this.store.state, this.store.now());
      this.ui.update(this.store.state, this.store.now());
      this.ui.el("audio-toggle").textContent = this.audio.muted ? "🔇" : "♫";
      this.ui.minimap(
        this.store.state,
        this.position,
        this.avatar.root.rotation.y,
        this.store.now(),
        this.life?.positions,
      );
      if (!this.busy && this.ui.contextOpen) this.showContext();
    }
    if (this.saveTick > 2 && !this.busy) {
      this.saveTick = 0;
      void this.flushMove().catch((e) => {
        this.ui.el("save-status").textContent = e.message;
      });
    }
    if (
      time - this.lastCombatPoll > 850 &&
      !this.pulsePending &&
      !this.busy &&
      !this.flying &&
      PLANETS[this.store.state.planet].hostile
    ) {
      this.lastCombatPoll = time;
      void this.combatPulse();
    }
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.abort.abort();
    this.input.dispose();
    this.audio.dispose();
    this.enemies?.dispose();
    this.weather.dispose();
    this.telegram.dispose();
    this.removePreview();
    this.view.dispose();
    this.life?.dispose();
    this.atmosphere?.dispose();
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
