import { updateIndustrialLights } from "../world/IndustrialLighting";
import {
  graphicsQuality,
  studioEnvironment,
  type GraphicsQuality,
} from "../world/Graphics";
import { ObservationScene } from "../world/ObservationScene";
import {
  STORY_PLANTS,
  STORY_METEOR,
  STORY_ROBOT,
  storyText,
} from "../../shared/prologue";
import { gardenBeds } from "../../shared/model";
import { landingPad } from "../../shared/model";
import { DEVICE_NAMES, type DeviceKind } from "../../shared/automation";
import { hudIcon } from "../ui/Glyphs";
import { illustration } from "../ui/Illustrations";
import { ColonyPanels } from "../ui/ColonyPanels";
import { SurfaceFollower } from "../world/Motion";
import { resourceNodes as nodes, treeCleared } from "../../shared/forestry";
import { dayCycle } from "../../shared/daylight";
import { cubeVisualUp } from "../../shared/sphere";
import { Occlusion } from "../world/Occlusion";
import { AutomationActors } from "../world/AutomationActors";
import { AutomationPanel } from "../ui/AutomationPanel";
import { ArtRenderer } from "../world/ArtRenderer";
import { surfaceHeight, setTerrainEdits } from "../../shared/voxel";
import { SpaceScene } from "../world/SpaceScene";
import { StarSky } from "../world/StarSky";
import {
  stepFlight,
  redirectFlight,
  landingInfo,
  padPoint,
  type FlightState,
  type PilotInput,
} from "../../shared/space";
import {
  sphereNormal,
  cubeRouteDirection,
  sphereCoordinates,
  sphereStep,
  surfaceDistance,
  sphereRadius,
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
    | "fence"
    | "story"
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
  level?: number;
};
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
export class Game {
  private automationPanel?: AutomationPanel;
  private colonyPanels!: ColonyPanels;
  private occlusion = new Occlusion();
  private machines = new AutomationActors(new Models());
  private buildOnCube?: BuildingKind;
  private inventoryPlacement?: string;
  private fenceKind?: "wood" | "stone" | "energy";
  private fenceRotation = 0;
  private observation?: ObservationScene;
  private overviewRotation = new T.Quaternion();
  private introStarted = 0;
  private introElapsed = 0;
  private introRetryAt = 0;
  private introVeil = document.createElement("div");
  private miningAim?: { x: number; y: number };
  private visualUp = new T.Vector3(0, 1, 0);
  private renderForward = new T.Vector3(0, 0, 1);
  private surfaceMotion = new SurfaceFollower();
  private ambient = new T.HemisphereLight(0xdce8df, 0x374335, 1.05);
  private moon = new T.DirectionalLight(0xb6cff5, 0);
  private lantern = new T.PointLight(0xffe8bd, 0, 12, 1.5);
  private scene = new T.Scene();
  private sky = new StarSky();
  private space?: SpaceScene;
  private flightState?: FlightState;
  private pilotCommands: { input: PilotInput; dt: number }[] = [];
  private pilotPending?: Promise<void>;
  private spaceTick = 0;
  private renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  private camera: T.OrthographicCamera = new T.OrthographicCamera(
    -13,
    13,
    10,
    -10,
    0.1,
    300,
  );
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
  private sun = new T.DirectionalLight(0xfff2db, 2.9);
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
  private art?: ArtRenderer;
  private quality: GraphicsQuality = graphicsQuality();
  private lowQuality = this.quality === "economy";
  private environment?: T.WebGLRenderTarget;
  private modalRenderAt = 0;
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
    onNexus?: () => void,
  ) {
    this.position = { ...store.state.position };
    document.querySelector("#app")!.innerHTML = "";
    this.renderer.domElement.className = "world";
    this.renderer.setPixelRatio(this.adaptiveRatio);
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.environment = studioEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.28;
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        this.quality === "high" ? 1.5 : this.lowQuality ? 0.8 : 1,
      ),
    );
    document.querySelector("#app")!.append(this.renderer.domElement);
    this.ui = new UI(store.local);
    const nexusButton = document.createElement("button");
    nexusButton.id = "return-nexus";
    nexusButton.title = "NEXUS — хаб и другие миры";
    nexusButton.setAttribute("aria-label", "Вернуться в хаб NEXUS");
    nexusButton.textContent = "NEXUS ↗";
    nexusButton.style.cssText = "font-size:10px;letter-spacing:.08em;padding:8px 10px;width:auto";
    this.ui.el("settings").parentElement!.prepend(nexusButton);
    nexusButton.onclick = async () => {
      if (!onNexus || this.busy || this.flying || this.observation) return;
      this.busy = true;
      this.input.clear();
      this.path = [];
      this.sphereDestination = undefined;
      try { await this.flushMove(); onNexus(); }
      catch (error) { this.ui.toast((error as Error).message); this.busy = false; }
    };
    this.introVeil.className = "arrival-veil";
    this.introVeil.setAttribute("aria-hidden", "true");
    this.introVeil.hidden = store.state.prologue.phase !== "arrival";
    document.querySelector("#app")!.append(this.introVeil);
    this.ui.root.classList.toggle(
      "in-arrival",
      store.state.prologue.phase === "arrival",
    );
    this.input = new Input();
    this.scene.add(this.ambient, this.lantern);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(
      devicePixelRatio < 1 ? 1024 : 2048,
      devicePixelRatio < 1 ? 1024 : 2048,
    );
    Object.assign(this.sun.shadow.camera, {
      left: -16,
      right: 16,
      top: 16,
      bottom: -16,
      near: 1,
      far: 80,
    });
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target, this.moon, this.moon.target);
    const fill = new T.DirectionalLight(0xb6c6a4, 0.3);
    fill.position.set(25, 8, -15);
    this.scene.add(fill);
    this.scene.add(this.machines.root);
    this.scene.add(
      this.avatar.root,
      this.marker,
      this.weather.root,
      this.sky.root,
    );
    this.marker.visible = false;
    this.loadScene();
    this.art = new ArtRenderer(this.renderer, this.scene, this.camera);
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
    const automation = (this.automationPanel = new AutomationPanel(
      this.ui,
      () => store.state,
      async (action) => {
        await this.flushMove();
        await store.action(action);
        this.machines.update(store.state, this.previousTime / 1000);
      },
    ));
    this.colonyPanels = new ColonyPanels(
      this.ui,
      () => store.state,
      async (action) => {
        await this.flushMove();
        const inside = store.state.inside,
          ship = store.state.activeShip;
        await store.action(action);
        if (inside !== store.state.inside || ship !== store.state.activeShip)
          this.loadScene();
      },
      (id) => automation.open(id),
      () => this.rebuild(),
    );
    this.ui.onProfile = () => menu(() => this.colonyPanels.profile(store.name));
    this.ui.onScanPlanet = (id) => void this.scanPlanet(id);
    this.ui.onAutomation = () => menu(() => automation.open());
    this.ui.onInventory = () => menu(() => this.ui.inventory(store.state));
    this.ui.onCraftMenu = () => menu(() => this.ui.craft(store.state));
    this.ui.onOpenRecipe = (id) =>
      menu(() => this.ui.craft(store.state, "Мебель", id));
    this.ui.onObservePlanet = (id) => this.observePlanet(id);
    this.ui.onStory = () => void this.advanceStory();
    this.ui.onHand = (hand) => void this.chooseHand(hand);
    this.ui.button("rotate-placement", () => {
      this.fenceRotation = (this.fenceRotation + 1) % 4;
      this.showContext();
    });
    this.ui.onSkills = () => menu(() => this.ui.skills(this.store.state));
    this.ui.onSpendSkill = async (skill) => {
      try {
        await this.store.action({ type: "spendSkill", skill });
        this.ui.skills(this.store.state);
      } catch (e) {
        this.ui.toast((e as Error).message);
      }
    };
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
      if (this.store.state.prologue.phase === "arrival") return;
      if (this.mode === "build" || this.flying) return;

      this.mode = this.mode === "planet" ? "explore" : "planet";
      if (this.mode === "planet") {
        this.sphereDestination = undefined;
        this.path = [];
        this.input.clear();
        this.overviewRotation.setFromUnitVectors(
          T.Object3D.DEFAULT_UP,
          this.visualUp,
        );
      }
    };
    this.ui.onSettings = () =>
      menu(() =>
        this.ui.settings(
          telegram.fullscreen,
          () => {
            const levels: GraphicsQuality[] = ["high", "balanced", "economy"];
            this.quality =
              levels[(levels.indexOf(this.quality) + 1) % levels.length];
            localStorage.setItem("little-planets-quality", this.quality);
            this.lowQuality = this.quality === "economy";
            this.renderer.shadowMap.enabled = !this.lowQuality;
            this.renderer.setPixelRatio(
              Math.min(
                devicePixelRatio,
                this.quality === "high" ? 1.5 : this.lowQuality ? 0.8 : 1,
              ),
            );
            const label = {
              high: "Высокое",
              balanced: "Сбалансированное",
              economy: "Экономное",
            }[this.quality];
            this.ui.el("quality").textContent = `Графика: ${label} ↻`;
            this.ui.toast(`Качество графики: ${label}`);
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
      if (store.state.inside || store.state.prologue.phase !== "complete")
        return;

      menu(() => this.ui.galaxy(store.state));
    };
    this.ui.onMineStrike = () => void this.mineStrike();
    this.ui.onBoardShip = () => void this.travel(store.state.planet, true);
    this.ui.onTravel = (p) => void this.travel(p);
    this.ui.onSpaceAuto = () => {
      if (this.busy) return;
      if (this.flightState) {
        const enabled = !this.flightState.autopilot;
        if (enabled)
          this.flightState = redirectFlight(
            this.flightState,
            this.flightState.target,
            this.store.state.discovered,
          );
        this.flightState.autopilot = enabled;
      }
    };
    this.ui.onSpaceLand = () => void this.land();
    this.ui.onSpaceCourse = () => {
      if (!this.busy) {
        this.ui.galaxy(this.store.state);
      }
    };
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
    this.ui.onCancelPlacement = () => {
      this.stopBuild();
      this.clearSelection();
    };
    this.ui.onRotateBuild = () => {
      this.rotation = this.rotation ? 0 : 1;
      this.updatePreview();
    };
    this.ui.onConfirmBuild = () => void this.build();
    this.ui.onCraft = (recipe) => void this.craft(recipe);
    this.ui.onItemPlace = (id) => {
      const [prefix, kind] = id.split(":");
      if (prefix === "device" || prefix === "ship") {
        if (store.state.inside || this.flying) return;
        if (!(store.state.inventory[id] > 0)) {
          this.ui.toast("Предмета нет в инвентаре.");
          return;
        }
        this.stopBuild();
        this.clearSelection();
        this.inventoryPlacement = id;
        this.ui.close();
        this.ui.placementMode(
          prefix === "device"
            ? DEVICE_NAMES[kind as DeviceKind]
            : "Корабль с площадкой",
        );
        return;
      }
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
        if (this.observation) {
          if (e.code === "Escape") void this.closeObservation();
          return;
        }
        if (
          !this.ui.modalOpen &&
          !(
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLSelectElement
          )
        ) {
          if (/^Digit[1-6]$/.test(e.code)) {
            const hand = (
              [
                "axe",
                "cultivator",
                "sword",
                "spear",
                "blaster",
                "none",
              ] as const
            )[Number(e.code.at(-1)) - 1];
            void this.chooseHand(hand);
          }
        }
        if (e.code === "Space" && !this.ui.modalOpen) {
          e.preventDefault();
          void this.attack();
        }
        if (e.code === "Escape") {
          if (this.ui.modalOpen) this.ui.close();
          else if (
            this.mode === "build" ||
            this.buildOnCube ||
            this.fenceKind ||
            this.inventoryPlacement
          )
            this.stopBuild();
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
        Object.assign(this.ui.flightControls, {
          pitch: 0,
          brake: false,
          boost: false,
        });
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
          Object.assign(this.ui.flightControls, {
            pitch: 0,
            brake: false,
            boost: false,
          });
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
    if (store.state.flight) this.enterSpace();
    this.renderer.setAnimationLoop(this.frame);
    if (new URLSearchParams(location.search).has("debug"))
      Object.defineProperty(window, "__planets", {
        configurable: true,
        value: {
          project: (x: number, z: number, y = 0) => {
            const p = (
              !store.state.inside && isSphere(store.state.planet)
                ? this.spherePoint({ x, z }, y)
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
            drawCalls: this.space
              ? this.renderer.info.render.calls
              : (this.art?.metrics.drawCalls ??
                this.renderer.info.render.calls),
            triangles: this.space
              ? this.renderer.info.render.triangles
              : (this.art?.metrics.triangles ??
                this.renderer.info.render.triangles),
            art: this.art?.metrics,
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
            introduction: {
              seconds: this.introElapsed,
              veil: this.introVeil.hidden
                ? 0
                : Number(this.introVeil.style.opacity || 1),
              effects:
                this.view instanceof SphereWorld
                  ? this.view.prologueEffects.stats
                  : null,
            },
            lighting: {
              ambient: this.ambient.intensity,
              sunlight: this.sun.intensity,
              moonlight: this.moon.intensity,
            },
            playerUp: new T.Vector3(0, 1, 0)
              .applyQuaternion(this.avatar.root.quaternion)
              .toArray(),
            sphereForward: this.sphereForward.toArray(),
            observing: this.observation
              ? {
                  target: this.observation.target,
                  reveal: this.observation.reveal,
                  elapsed: this.observation.elapsed,
                  ...this.observation.stats,
                }
              : null,
            placement:
              this.fenceKind ??
              this.inventoryPlacement ??
              this.buildOnCube ??
              null,
            cockpit: !!this.space,
            hand: store.state.hand,
            machines: this.machines.positions,
            enemies: this.enemies?.positions ?? [],
            daylight: dayCycle(
              store.state.cycleEpoch,
              store.now(),
              this.visualUp,
            ),
            visualUp: this.visualUp.toArray(),
            sky: {
              ...this.sky.stats,
              origin: this.sky.root.position.toArray(),
            },
            weatherOrigin: this.weather.root.position.toArray(),
            cameraUp: this.camera.up.toArray(),
            cameraQuaternion: this.camera.quaternion.toArray(),
            sphere:
              this.view instanceof SphereWorld
                ? {
                    id: this.view.id,
                    radius: sphereRadius(this.view.id),
                    tiles: this.view.tiles,
                    features: this.view.nature.features,
                    vegetation: this.view.nature.stats,
                    wind: this.view.nature.wind.stats,
                    particles: this.view.nature.particles.stats,
                    shipDesign: this.view.ship.children[0]?.userData.design,
                    terrain: this.view.terrainStats,
                    groundHeight: surfaceHeight(this.position, this.view.id),
                  }
                : null,
            space: this.space
              ? {
                  ...this.space.stats,
                  flight: structuredClone(this.flightState),
                  landing: this.flightState
                    ? landingInfo(this.flightState)
                    : null,
                }
              : null,
          }),
        },
      });
    if (store.state.prologue.phase === "arrival") {
      this.introStarted = performance.now();
      this.mode = "planet";
    } else if (store.state.prologue.phase === "reveal")
      this.observePlanet("home", true);
    if (store.state.prologue.phase === "complete")
      this.ui.toast("Нажмите ☰ для меню. Приятного путешествия!");
  }

  private observePlanet(id: PlanetId, reveal = false) {
    if (
      this.flying ||
      this.busy ||
      this.store.state.inside ||
      (!reveal &&
        (!Object.hasOwn(PLANETS, id) ||
          this.store.state.prologue.phase !== "complete"))
    )
      return;
    this.ui.close();
    this.clearSelection();
    this.sphereDestination = undefined;
    this.path = [];
    this.input.clear();
    this.observation?.dispose();
    this.observation = new ObservationScene(
      this.kit,
      this.store.state,
      id,
      reveal,
    );
    this.observation.scene.environment = this.environment?.texture ?? null;
    this.observation.scene.environmentIntensity = 0.28;
    this.ui.root.classList.add("in-optics");
    const panel = this.ui.el("optics");
    panel.classList.remove("hidden");
    panel.innerHTML = `<span class="eyebrow">${reveal ? "ПЕРВЫЙ ЗАПУСК / СИСТЕМА КОЛЫБЕЛЬ" : "ОПТИЧЕСКИЙ КАНАЛ / ТЕЛЕСКОП"}</span><h2>${reveal ? "Тысячи миров. Ваше начало." : PLANETS[id].name}</h2><p>${reveal ? "Ваш первый полёт — лишь начало. Впереди сотни планет и далёкие созвездия." : "Перетаскивайте изображение в любом направлении. Колесо / щипок — увеличение."}</p><div><button id="optics-plus">+</button><button id="optics-minus">−</button><button id="${reveal ? "optics-finish" : "optics-close"}" class="primary" ${reveal ? "disabled" : ""}>${reveal ? "Начать исследование" : "Вернуться к персонажу"}</button></div>`;
    this.ui.button("optics-plus", () => this.observation?.magnify(0.8));
    this.ui.button("optics-minus", () => this.observation?.magnify(1.25));
    this.ui.button(
      reveal ? "optics-finish" : "optics-close",
      () => void this.closeObservation(),
    );
  }
  private async closeObservation() {
    if (this.observation?.reveal) {
      if (!this.observation.finished) return;
      try {
        await this.store.action({ type: "story", step: "finish" });
      } catch (e) {
        this.ui.toast((e as Error).message);
        return;
      }
    }
    this.observation?.dispose();
    this.observation = undefined;
    // Other worlds use the shared terrain sampler; restore the active world before resuming.
    for (const [p, w] of Object.entries(this.store.state.worlds))
      setTerrainEdits(p as PlanetId, w.terrain);
    this.ui.el("optics").classList.add("hidden");
    this.ui.root.classList.remove("in-optics");
    this.input.clear();
    this.ui.update(this.store.state, this.store.now());
    this.mode = "explore";
  }
  private async advanceStory() {
    if (this.busy) return;
    const phase = this.store.state.prologue.phase;
    this.busy = true;
    try {
      await this.flushMove();
      await this.store.action({
        type: "story",
        step:
          phase === "arrival"
            ? "begin"
            : phase === "repair"
              ? "repair"
              : "launch",
      });
      this.introVeil.hidden = true;
      this.ui.root.classList.remove("in-arrival");
      if (phase === "arrival")
        this.ui.toast(
          "ПИКО: Сканирование завершено. В системе обнаружено ещё 4 планеты.",
        );
      this.ui.close();
      this.clearSelection();
      this.rebuild();
      if (this.store.state.prologue.phase === "reveal") {
        this.busy = false;
        this.observePlanet("home", true);
      } else {
        this.mode = "explore";
        this.zoom = 1;
      }
      this.ui.update(this.store.state, this.store.now());
    } catch (e) {
      this.ui.toast((e as Error).message);
    } finally {
      this.busy = false;
    }
  }
  private async chooseHand(hand: import("../../shared/model").Save["hand"]) {
    if (this.flying || this.busy) return;
    try {
      await this.store.action({ type: "hand", item: hand });
      this.avatar.equip(
        this.store.state.equipment.weapon,
        this.store.state.equipment.armor,
        this.store.state.hand,
      );
      this.ui.update(this.store.state, this.store.now());
      if (hand === "axe" || hand === "cultivator") {
        this.stopBuild();
      }
    } catch (error) {
      this.ui.toast((error as Error).message);
    }
  }

  private async scanPlanet(planet: PlanetId) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.flushMove();
      await this.store.action({ type: "scanPlanet", planet });
      this.ui.galaxy(this.store.state);
      this.audio.play("gather");
    } catch (e) {
      this.ui.toast((e as Error).message);
    } finally {
      this.busy = false;
    }
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
      n = this.visualUp,
      forward = this.renderForward.clone().projectOnPlane(n).normalize(),
      blend = instant ? 1 : 1 - Math.exp(-7 * dt),
      feet = this.avatar.root.position;

    const arriving = this.store.state.prologue.phase === "arrival",
      overview = this.mode === "planet" && !arriving,
      target = arriving
        ? this.spherePoint(landingPad(this.store.state, "home"), 1.1)
        : overview
          ? new T.Vector3()
          : feet.clone().addScaledVector(n, 2.3).addScaledVector(forward, -2.5),
      position = arriving
        ? target
            .clone()
            .addScaledVector(n, 15)
            .addScaledVector(
              forward
                .clone()
                .applyAxisAngle(n, Math.sin(this.introElapsed * 0.15) * 0.22),
              16,
            )
        : overview
          ? new T.Vector3(0, 0.7, 1)
              .normalize()
              .applyQuaternion(this.overviewRotation)
              .multiplyScalar(sphereRadius(this.store.state.planet) + 55)
          : feet.clone().addScaledVector(n, 13.5).addScaledVector(forward, 14);
    this.target.lerp(target, blend);
    this.camera.up.copy(
      overview
        ? new T.Vector3(0, 1, 0).applyQuaternion(this.overviewRotation)
        : n,
    );
    this.camera.position.lerp(position, blend);
    if (this.scene.fog instanceof T.Fog) {
      this.scene.fog.near = overview ? 85 : 28;
      this.scene.fog.far = overview ? 180 : 100;
    }
    const half =
      (overview ? (sphereRadius(this.store.state.planet) + 11) * 1.08 : 8.2) *
      this.zoom *
      Math.max(1, 1.05 / aspect);
    this.cameraHalf += (half - this.cameraHalf) * blend;
    this.camera.left = -this.cameraHalf * aspect;
    this.camera.right = this.cameraHalf * aspect;
    this.camera.top = this.cameraHalf;
    this.camera.bottom = -this.cameraHalf;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
  private moveSphere(dt: number) {
    if (
      this.busy ||
      this.ui.modalOpen ||
      this.flying ||
      this.store.state.prologue.phase === "arrival"
    )
      return false;
    const input = this.input.read(),
      up = this.sphereUp(this.position),
      controlForward = this.renderForward
        .clone()
        .projectOnPlane(up)
        .normalize(),
      right = new T.Vector3().crossVectors(up, controlForward).normalize();
    let direction = new T.Vector3();
    if (Math.hypot(input.x, input.z) > 0.08) {
      this.sphereDestination = undefined;
      this.arrived = undefined;
      this.clearSelection();
      direction
        .addScaledVector(right, input.x)
        .addScaledVector(controlForward, input.z);
      this.mode = "explore";
    } else if (this.sphereDestination) {
      const raw = cubeRouteDirection(
        this.position,
        this.sphereDestination,
        this.store.state.planet,
      );
      const goal = new T.Vector3(raw.x, raw.y, raw.z);
      if (
        surfaceDistance(
          this.position,
          this.sphereDestination,
          this.store.state.planet,
        ) < 1.45
      ) {
        this.sphereDestination = undefined;
        const done = this.arrived;
        this.arrived = undefined;
        done?.();
        return false;
      }
      direction.copy(goal);
      direction.addScaledVector(up, -direction.dot(up));
    }
    if (direction.lengthSq() < 1e-8) return false;
    direction.normalize();
    const next = sphereStep(
        this.position,
        direction,
        6 * dt,
        this.store.state.planet,
      ),
      nextUp = this.sphereUp(next),
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
    this.space?.resize();
    this.art?.resize();
    if (!this.flying) this.updateCamera(1, true);
  };
  private updateCamera(dt: number, instant = false) {
    if (this.flying) return;
    if (!this.store.state.inside && isSphere(this.store.state.planet)) {
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
      (overview ? (inside ? 7 : size * 0.66) : inside ? 4.5 : 7.4) *
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
        if (this.observation) {
          this.observation.magnify(Math.exp(e.deltaY * 0.001));
          return;
        }
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
        const delta = e.clientX - previous.x,
          deltaY = e.clientY - previous.y;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7)
          moved = true;
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()],
            next = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance && this.observation)
            this.observation.magnify(distance / next);
          else if (distance)
            this.zoom = T.MathUtils.clamp(
              (this.zoom * distance) / next,
              0.65,
              1.5,
            );
          distance = next;
        } else if (moved && !this.flying) {
          if (this.observation) {
            this.observation.rotate(delta, deltaY);
            return;
          }
          if (this.mode === "planet") {
            this.overviewRotation
              .premultiply(
                new T.Quaternion().setFromEuler(
                  new T.Euler(deltaY * 0.007, delta * 0.007, 0, "YXZ"),
                ),
              )
              .normalize();
            return;
          }
          this.theta -= delta * 0.007;

          this.renderForward
            .applyAxisAngle(this.visualUp, -delta * 0.007)
            .normalize();
          if (!this.store.state.inside && isSphere(this.store.state.planet))
            this.sphereForward
              .applyAxisAngle(this.sphereUp(this.position), -delta * 0.007)
              .normalize();
        }
      },
      { signal },
    );
    canvas.addEventListener(
      "pointerup",
      (e) => {
        pointers.delete(e.pointerId);
        if (!moved && !pointers.size && !this.observation)
          this.pick(e.clientX, e.clientY);
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
      if (this.inventoryPlacement || this.fenceKind) {
        const point = this.view.pick(this.raycaster.ray);
        if (point)
          this.approach({ ...point, type: "ground" }, () => this.showContext());
        return;
      }
      const fence = this.view.pickFence(this.raycaster.ray);
      if (fence !== null) {
        const f =
          this.store.state.worlds[this.store.state.planet].fences[fence];
        this.approach({ ...f, type: "fence", id: String(fence) }, () =>
          this.ui.context(
            "Садовая ограда",
            "Демонтировать секцию ограды.",
            "Убрать ограду",
          ),
        );
        return;
      }
      const story = this.view.pickStory(this.raycaster.ray);
      if (story !== null) {
        if (story === 4) {
          this.stopBuild();
          this.approach(
            { ...landingPad(this.store.state, "home"), type: "ship" },
            () => this.ui.shipDock(this.store.state),
          );
          return;
        }
        if (story === -1) {
          this.ui.toast(storyText(this.store.state.prologue)[1]);
          return;
        }
        const at = story === 3 ? STORY_METEOR : STORY_PLANTS[story];
        this.approach({ ...at, type: "story", id: String(story) }, () => {
          this.ui.context(
            story === 3
              ? "Метеоритное железо"
              : PLANTS[STORY_PLANTS[story].plant].name,
            story === 3
              ? "Извлечь железо из обломков метеорита."
              : "Биоволокно для ремонта двигателя.",
            story === 3 ? "Добыть железо" : "Собрать растение",
          );
        });
        return;
      }
      const enemyId = this.enemies?.pick(this.raycaster.ray);
      const enemy = this.store.state.worlds[
        this.store.state.planet
      ].enemies.find((e) => e.id === enemyId && e.hp > 0);
      if (enemy) {
        this.approach({ ...enemy, type: "enemy" }, () => this.showContext());
        return;
      }
      if (this.view.pickShip(this.raycaster.ray)) {
        this.stopBuild();
        this.approach(
          {
            ...landingPad(this.store.state, this.store.state.planet),
            type: "ship",
          },
          () => this.ui.shipDock(this.store.state),
        );
        return;
      }
      {
        const id = this.view.pickBuilding(this.raycaster.ray),
          b = this.store.state.worlds[this.store.state.planet].buildings.find(
            (b) => b.id === id,
          );
        if (b) {
          this.stopBuild();
          this.approach({ ...b, type: "building", id: b.id }, () =>
            this.colonyPanels.building(b.id),
          );
          return;
        }
        const device = this.machines.pick(this.raycaster.ray);
        if (device) {
          this.stopBuild();
          this.automationPanel?.open(device);
          return;
        }
      }
      const point = this.view.pick(this.raycaster.ray);
      if (!point) return;
      let selected: Selection = { ...point, type: "ground" };
      const pad = landingPad(this.store.state, this.store.state.planet),
        node = nodes(this.store.state.planet).find(
          (n) =>
            !this.store.state.worlds[
              this.store.state.planet
            ].clearedNodes.includes(n.id) &&
            !treeCleared(
              this.store.state.planet,
              n,
              this.store.state.worlds[this.store.state.planet].cleared,
              [],
            ) &&
            surfaceDistance(point, n, this.store.state.planet) < 1.1,
        );
      const building = this.store.state.worlds[
        this.store.state.planet
      ].buildings.find(
        (b) => surfaceDistance(point, b, this.store.state.planet) < 1.6,
      );
      if (building) {
        this.stopBuild();
        this.approach(
          { ...buildingCenter(building), type: "building", id: building.id },
          () => this.colonyPanels.building(building.id),
        );
        return;
      }
      if (surfaceDistance(point, pad, this.store.state.planet) < 1.5) {
        this.stopBuild();
        this.approach({ ...pad, type: "ship" }, () =>
          this.ui.shipDock(this.store.state),
        );
        return;
      }
      if (this.buildOnCube) {
        this.approach(selected, () => this.showContext());
        return;
      }
      if (this.store.state.hand !== "cultivator") {
        const treeId = this.view.nature.wind.pick(this.raycaster.ray);
        const tree = treeId
          ? nodes(this.store.state.planet).find((n) => n.id === treeId)
          : undefined;
        if (tree) {
          this.approach({ ...tree, type: "node" }, () => this.showContext());
          return;
        }
      }
      const garden = gardenBeds(this.store.state, this.store.state.planet).find(
        (b) => surfaceDistance(point, b, this.store.state.planet) < 0.7,
      );
      if (garden) {
        this.approach({ ...garden, type: "bed" }, () => this.showContext());
        return;
      }
      if (this.store.state.hand === "cultivator") {
        this.clearSelection();
        this.selected = { ...point, type: "ground" };
        this.sphereDestination = undefined;
        this.path = [];
        this.arrived = undefined;
        this.input.clear();
        this.miningAim = { x: clientX, y: clientY };
        this.view.highlightBlock(point);
        return;
      }
      const meteor = worldEvent(
        this.store.state,
        this.store.state.planet,
        this.store.now(),
      );
      if (
        meteor?.type === "meteor" &&
        !meteor.claimed &&
        this.store.now() >= meteor.impactAt &&
        surfaceDistance(point, meteor, this.store.state.planet) < 1.2
      )
        selected = {
          x: meteor.x,
          z: meteor.z,
          type: "meteor",
          id: String(meteor.id),
        };
      else if (
        gardenBeds(this.store.state, this.store.state.planet).find(
          (b) => surfaceDistance(point, b, this.store.state.planet) < 0.7,
        )
      ) {
        const b = gardenBeds(this.store.state, this.store.state.planet).find(
          (b) => surfaceDistance(point, b, this.store.state.planet) < 0.7,
        )!;
        selected = { ...b, type: "bed" };
      } else if (node)
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
        pad = landingPad(state, state.planet),
        event = worldEvent(state, state.planet, this.store.now());
      if (
        event?.type === "meteor" &&
        !event.claimed &&
        this.store.now() >= event.impactAt &&
        Math.hypot(x - event.x, z - event.z) < 1.1
      )
        s = { x: event.x, z: event.z, type: "meteor", id: String(event.id) };
      else if (
        gardenBeds(state, state.planet).some((b) => b.x === x && b.z === z)
      )
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
    if (this.view instanceof SphereWorld) this.view.highlightBlock(null);
  }
  private approach(s: Selection, done: () => void) {
    if (this.busy || this.flying || this.ui.modalOpen) return;
    this.stopBuild(false);
    this.clearSelection();
    this.selected = s;
    this.sphereDestination = undefined;
    if (
      !this.store.state.inside &&
      surfaceDistance(this.position, s, this.store.state.planet) < 1.45
    ) {
      this.arrived = undefined;
      done();
      return;
    }
    if (!this.store.state.inside && isSphere(this.store.state.planet)) {
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
    if (this.store.state.inside) return;
    const b = [...gardenBeds(this.store.state, this.store.state.planet)].sort(
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
    if (s.type === "story") {
      const meteor = s.id === "3";
      this.ui.context(
        meteor
          ? "Упавший метеорит"
          : PLANTS[STORY_PLANTS[Number(s.id)].plant].name,
        meteor
          ? "Извлеките 3 железа из обломков. Инструмент не требуется."
          : "Соберите биоволокно для двигателя.",
        meteor ? "Добыть железо" : "Собрать растение",
      );
      return;
    }
    if (s.type === "fence") {
      this.ui.context(
        "Садовая ограда",
        "Демонтировать секцию ограды.",
        "Убрать ограду",
      );
      return;
    }
    if (s.type === "ground" && this.fenceKind) {
      this.ui.context(
        "Ограда",
        `Вариант: ${this.fenceKind === "wood" ? "дерево" : this.fenceKind === "stone" ? "светлый камень" : "энергетическая"}. Поворот: ${this.fenceRotation * 90}°.`,
        "Установить ограду",
      );
      return;
    }
    if (s.type === "ground" && this.inventoryPlacement) {
      this.ui.context(
        "Размещение",
        "Установить выбранный предмет на этом участке.",
        "Установить",
      );
      return;
    }
    if (s.type === "ground" && !this.buildOnCube) {
      this.ui.hideContext();
      return;
    }
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
        n.resource === "wood"
          ? `Древесина: ${n.timber ?? 4} · ударов: ${world.treeDamage[n.id] ?? 0}/${n.hits ?? 2}. Возьмите топор. Вырубка сохраняется.`
          : "Соберите 3 единицы ресурса. Восстановление: 20 секунд.",
        nodeReady(world, n.id, now)
          ? n.resource === "wood"
            ? "Рубить дерево"
            : "Собрать"
          : "Собрано",
        !nodeReady(world, n.id, now),
      );
    } else if (s.type === "ship")
      this.ui.context(
        "Корабль",
        "Выберите знакомый мир или найдите случайную планету сканером.",
        "Открыть корабль",
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
        "Управление зданием",
        false,
      );
    } else if (s.type === "ground")
      this.ui.context(
        this.buildOnCube ? BUILDINGS[this.buildOnCube].name : "Поверхность",
        "Разместить постройку здесь.",
        "Построить",
      );
    else this.ui.hideContext();
  }
  private interact() {
    const s = this.selected;
    if (!s || this.busy) return;
    const state = this.store.state;
    if (s.type === "fence") {
      void this.perform(
        { type: "removeFence", index: Number(s.id) },
        "tool",
        "Ограда убрана.",
      );
      return;
    }
    if (s.type === "story") {
      void this.perform(
        {
          type: "story",
          step: s.id === "3" ? "meteor" : "plant",
          index: s.id === "3" ? undefined : Number(s.id),
        },
        "gather",
        "Материалы получены.",
      );
      return;
    }
    if (s.type === "ground") {
      if (this.fenceKind) {
        void this.perform(
          {
            type: "fence",
            kind: this.fenceKind,
            rotation: this.fenceRotation,
            x: s.x,
            z: s.z,
          },
          "tool",
          "Ограда установлена.",
        );
        return;
      }
      if (this.inventoryPlacement) {
        const id = this.inventoryPlacement;
        void this.perform(
          id.startsWith("device:")
            ? {
                type: "placeDevice",
                kind: id.slice(7) as DeviceKind,
                x: s.x,
                z: s.z,
              }
            : { type: "placeShip", id: id.slice(5), x: s.x, z: s.z },
          "tool",
          "Предмет размещён.",
        );
        return;
      }
      if (this.buildOnCube)
        void this.perform(
          {
            type: "build",
            kind: this.buildOnCube,
            x: s.x,
            z: s.z,
            rotation: 0,
          },
          "tool",
          "Постройка установлена.",
        );
      return;
    }
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
      void this.perform({ type: "mine", id: s.id! }, "tool", "");
    else if (s.type === "ship") {
      this.stopBuild();
      this.ui.shipDock(state);
    } else if (s.type === "door")
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
    else if (s.type === "building" && s.id) this.colonyPanels.building(s.id);
  }

  private async mineStrike() {
    if (
      this.busy ||
      this.flying ||
      this.ui.modalOpen ||
      this.store.state.inside ||
      !["axe", "cultivator"].includes(this.store.state.hand) ||
      this.buildOnCube ||
      this.inventoryPlacement
    )
      return;
    if (!(this.view instanceof SphereWorld)) return;
    if (this.store.state.hand === "axe" && this.selected?.type === "node") {
      const target = nodes(this.store.state.planet).find(
        (n) => n.id === this.selected!.id,
      );
      if (target?.resource === "wood") {
        await this.perform({ type: "mine", id: target.id }, "tool", "");
        return;
      }
    }
    const aim = this.miningAim;
    let point;
    if (aim) {
      this.raycaster.setFromCamera(
        new T.Vector2(
          (aim.x / innerWidth) * 2 - 1,
          1 - (aim.y / innerHeight) * 2,
        ),
        this.camera,
      );
      point = this.view.pick(this.raycaster.ray);
    } else
      point = {
        ...sphereStep(
          this.position,
          this.sphereForward,
          1.1,
          this.store.state.planet,
        ),
      };
    if (!point) return;
    if (surfaceDistance(point, this.position, this.store.state.planet) > 3.2) {
      this.ui.toast("Подойдите ближе к блоку.");
      return;
    }
    if (this.store.state.hand === "cultivator") {
      this.view.highlightBlock(point);
      const at = { x: Math.round(point.x), z: Math.round(point.z) };
      if (
        gardenBeds(this.store.state, this.store.state.planet).some(
          (b) => b.x === at.x && b.z === at.z,
        )
      )
        return;
      await this.perform(
        { type: "cultivate", ...at },
        "tool",
        "Грядка готова. Нажмите её, чтобы посадить семя.",
      );
      return;
    }
    const pickedId = this.view.nature.wind.pick(this.raycaster.ray);
    const tree = nodes(this.store.state.planet)
      .filter(
        (n) =>
          n.resource === "wood" &&
          !treeCleared(
            this.store.state.planet,
            n,
            this.store.state.worlds[this.store.state.planet].cleared,
            [],
          ) &&
          (!pickedId || n.id === pickedId) &&
          nodeReady(
            this.store.state.worlds[this.store.state.planet],
            n.id,
            this.store.now(),
          ),
      )
      .sort(
        (a, b) =>
          surfaceDistance(a, point, this.store.state.planet) -
          surfaceDistance(b, point, this.store.state.planet),
      )[0];
    if (!tree || surfaceDistance(tree, point, this.store.state.planet) > 2.2) {
      this.ui.toast("Выберите дерево рядом с персонажем.");
      return;
    }
    await this.perform({ type: "mine", id: tree.id }, "tool", "");
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
      const retainedTarget = this.selected;
      await this.store.action(action);
      if (["build", "placeDevice", "placeShip"].includes(action.type))
        this.stopBuild();
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
        this.store.state.hand,
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
      if (
        action.type === "mine" &&
        retainedTarget &&
        nodeReady(
          this.store.state.worlds[this.store.state.planet],
          action.id,
          this.store.now(),
        )
      ) {
        this.selected = retainedTarget;
        this.showContext();
      } else this.clearSelection();
      if (message) this.ui.toast(message);
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
    if (!this.store.state.inside && !this.flying && !this.busy) {
      this.ui.panel(
        `<span class="eyebrow">КОЛОНИАЛЬНАЯ АРХИТЕКТУРА / МОДУЛИ ПОВЕРХНОСТИ</span><h2>Строительство колонии</h2><p>Выберите чертёж и укажите место рядом с персонажем. Площадка выравнивается автоматически. После постройки объект сразу доступен для управления.</p><div class="construction-tools"><button id="tool-cultivate">${hudIcon("cultivator")}<div><strong>Культиватор</strong><small>Новые грядки на выбранной земле</small></div></button><button id="tool-axe">${hudIcon("axe")}<div><strong>Топор</strong><small>Заготовка всех лесных деревьев</small></div></button></div><h3>Ограды для сада</h3><div class="fence-tools">${(["wood", "stone", "energy"] as const).map((k) => `<button data-fence="${k}">${k === "wood" ? "Деревянная" : k === "stone" ? "Каменная" : "Энергетическая"} ограда</button>`).join("")}</div><h3>Модули колонии</h3><div class="construction-grid">${allowedBuildings(
          this.store.state.planet,
        )
          .map(
            (k) =>
              `<button data-cube-building="${k}">${illustration("kit:" + k)}<span class="tag">${this.store.state.freeConstruction ? "TEST / 0 РЕСУРСОВ" : "ЧЕРТЁЖ"}</span><div><strong>${BUILDINGS[k].name}</strong><small>${BUILDINGS[k].description}</small><span>Разместить ${hudIcon("arrow")}</span></div></button>`,
          )
          .join("")}</div>`,
        "construction",
      );
      this.ui.button("tool-cultivate", () => {
        this.stopBuild();
        this.ui.close();
        void this.chooseHand("cultivator");
        this.ui.toast("Нажмите землю, затем кнопку культиватора.");
      });
      this.ui
        .el("modal-content")
        .querySelectorAll<HTMLButtonElement>("[data-fence]")
        .forEach(
          (b) =>
            (b.onclick = () => {
              this.stopBuild();
              this.fenceKind = b.dataset.fence as "wood" | "stone" | "energy";
              this.ui.close();
              this.ui.placementMode("Ограда · поворот кнопкой ↻");
              this.ui.el("rotate-placement").classList.remove("hidden");
            }),
        );
      this.ui.button("tool-axe", () => {
        this.stopBuild();
        this.ui.close();
        void this.chooseHand("axe");
      });
      this.ui
        .el("modal-content")
        .querySelectorAll<HTMLButtonElement>("[data-cube-building]")
        .forEach(
          (b) =>
            (b.onclick = () => {
              this.buildOnCube = b.dataset.cubeBuilding as BuildingKind;
              this.ui.placementMode(BUILDINGS[this.buildOnCube].name);
              this.ui.close();
              this.ui.toast("Выберите участок для постройки.");
            }),
        );
      return;
    }
    if (this.busy || this.flying) return;
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
  private stopBuild(resetTools = true) {
    if (resetTools) {
      this.buildOnCube = undefined;
      this.inventoryPlacement = undefined;
      this.fenceKind = undefined;
      this.ui.placementMode(null);
    }
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
    if (!this.store.state.inside && isSphere(this.store.state.planet)) {
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
        const n = this.sphereUp(state.position),
          longitude =
            (state.position.x / planetSize(state.planet)) * Math.PI * 2;
        this.sphereForward
          .set(
            Math.cos(longitude) * n.y,
            -Math.sin(
              (state.position.z / (planetSize(state.planet) / 2)) * Math.PI,
            ),
            Math.sin(longitude) * n.y,
          )
          .normalize();
        this.sphereForward.addScaledVector(n, -this.sphereForward.dot(n));
        if (this.sphereForward.lengthSq() < 0.01)
          this.sphereForward.set(n.y === 0 ? 0 : 1, n.y === 0 ? 1 : 0, 0);
        this.sphereForward.normalize();
        this.sphereHeading.copy(this.sphereForward);
      } else
        this.view = new Planet(state.planet, this.kit, state, this.store.now());
      this.life = new Life(this.kit, state.planet, state);
      this.atmosphere = new Atmosphere(this.kit);
      if (this.life) this.scene.add(this.life.root);
      this.scene.add(this.atmosphere.root);
      if (PLANETS[state.planet].hostile) {
        this.enemies = new Enemies(this.kit, state);
        this.scene.add(this.enemies.root);
      }
      this.scene.background = new T.Color(PLANETS[state.planet].sky);
      this.scene.fog = isSphere(state.planet)
        ? new T.Fog(0x879a80, 28, 100)
        : state.planet === "mycelia"
          ? new T.FogExp2(0x20173d, 0.009)
          : null;
    }
    this.scene.add(this.view.root);
    this.sky.root.visible = !state.inside;
    if (!state.inside) this.sky.setPlanet(state.planet);
    if (state.inside || !isSphere(state.planet))
      this.avatar.root.quaternion.identity();
    this.position = { ...state.position };
    const rawUp = state.inside
      ? { x: 0, y: 1, z: 0 }
      : cubeVisualUp(this.position, state.planet);
    this.visualUp.set(rawUp.x, rawUp.y, rawUp.z);
    this.renderForward
      .copy(this.sphereForward)
      .projectOnPlane(this.visualUp)
      .normalize();
    this.surfaceMotion.reset(
      state.inside
        ? new T.Vector3(this.position.x, 0.07, this.position.z)
        : this.spherePoint(this.position, 0.06),
    );
    this.avatar.root.position.copy(this.surfaceMotion.position);
    this.sphereDestination = undefined;
    this.avatar.equip(
      state.equipment.weapon,
      state.equipment.armor,
      state.hand,
    );
    this.clearSelection();
    this.path = [];
    this.arrived = undefined;
    this.mode = state.inside ? "planet" : "explore";
    this.makeGrid();
    this.ui.update(state, this.store.now());
    this.updateCamera(1, true);
  }
  private spherePoint(p: { x: number; z: number }, height = 0) {
    return spherePoint(p, height, this.store.state.planet);
  }
  private sphereUp(p: { x: number; z: number }) {
    return sphereUp(p, this.store.state.planet);
  }
  private enterSpace() {
    if (!this.store.state.flight) return;
    for (const [p, w] of Object.entries(this.store.state.worlds))
      setTerrainEdits(p as PlanetId, w.terrain);
    this.space?.dispose();
    this.flightState = structuredClone(this.store.state.flight);
    this.space = new SpaceScene(this.kit, this.store.state);
    this.space.scene.environment = this.environment?.texture ?? null;
    this.space.scene.environmentIntensity = 0.65;
    this.flying = true;
    this.busy = false;
    this.avatar.root.visible = false;
    this.ui.root.classList.add("in-flight");
    this.ui.space(this.flightState);
    this.audio.weather();
    this.pilotCommands = [];
    this.spaceTick = 0;
  }
  private async travel(planet: PlanetId, boardOnly = false) {
    if (this.space && this.flightState) {
      if (this.busy) return;
      this.busy = true;
      try {
        await this.flushPilots();
        await this.store.action({ type: "course", planet });
        this.flightState = structuredClone(this.store.state.flight!);
        this.ui.close();
      } catch (e) {
        this.ui.toast((e as Error).message);
      } finally {
        this.busy = false;
      }
      return;
    }
    if (
      this.busy ||
      this.flying ||
      this.store.state.inside ||
      this.view instanceof Interior
    )
      return;
    const pad = landingPad(this.store.state, this.store.state.planet);
    if (surfaceDistance(this.position, pad, this.store.state.planet) > 2.7) {
      this.ui.close();
      this.ui.toast("Подходим к кораблю для вылета.");
      this.approach(
        { ...pad, type: "ship" },
        () => void this.travel(planet, boardOnly),
      );
      return;
    }
    this.busy = true;
    this.ui.close();
    this.clearSelection();
    this.path = [];
    try {
      await this.flushMove();
      await this.store.action(
        boardOnly ? { type: "boardShip" } : { type: "travel", planet },
      );
      this.flying = true;
      this.avatar.root.visible = false;
      this.ui.root.classList.add("in-flight");
      this.flightSamples = [];
      const source = this.view as Planet | SphereWorld,
        base = source.ship.position.clone(),
        up =
          !this.store.state.inside && isSphere(this.store.state.planet)
            ? this.sphereUp(
                landingPad(this.store.state, this.store.state.planet),
              )
            : new T.Vector3(0, 1, 0);
      this.atmosphere?.startLaunch(base.x, base.y, base.z, up);
      this.audio.play("launch");
      await this.animateFlight(1600, (t) => {
        source.ship.position.copy(base).addScaledVector(up, t * t * 13);
        this.atmosphere?.setExhaust(t * t * 13);
        this.sampleFlight("launch", source.ship);
      });
      this.atmosphere?.stopLaunch();
      this.enterSpace();
    } catch (e) {
      this.flying = false;
      this.busy = false;
      this.avatar.root.visible = true;
      this.ui.root.classList.remove("in-flight");
      this.ui.toast((e as Error).message);
    }
  }
  private async sendPilots() {
    if (this.pilotPending || !this.pilotCommands.length)
      return this.pilotPending;
    let count = 0,
      duration = 0;
    while (
      count < this.pilotCommands.length &&
      count < 30 &&
      duration + this.pilotCommands[count].dt <= 1.2
    ) {
      duration += this.pilotCommands[count].dt;
      count++;
    }
    const commands = this.pilotCommands.splice(0, count);
    const task = (async () => {
      try {
        await this.store.action({ type: "pilot", commands });
        if (this.store.state.flight) {
          const auto = this.flightState?.autopilot ?? false;
          this.flightState = structuredClone(this.store.state.flight);
          for (const command of this.pilotCommands)
            this.flightState = stepFlight(
              this.flightState,
              command.input,
              command.dt,
              this.store.state.discovered,
            );
          this.flightState.autopilot = auto;
        }
      } catch (e) {
        if (this.store.state.flight)
          this.flightState = structuredClone(this.store.state.flight);
        this.ui.el("flight-help").textContent = (e as Error).message;
      } finally {
        this.pilotPending = undefined;
      }
    })();
    this.pilotPending = task;
    return task;
  }
  private async flushPilots() {
    if (this.pilotPending) await this.pilotPending;
    while (this.pilotCommands.length) await this.sendPilots();
  }
  private spaceFrame(dt: number, time: number) {
    if (!this.flightState || !this.space) return;
    const input = this.input.read(),
      keys = this.input.flight(),
      controls: PilotInput = {
        throttle: this.ui.modalOpen ? 0 : -input.z,
        turn: this.ui.modalOpen ? 0 : input.x,
        pitch: this.ui.modalOpen
          ? 0
          : Math.max(
              -1,
              Math.min(1, keys.pitch + this.ui.flightControls.pitch),
            ),
        brake: keys.brake || this.ui.flightControls.brake,
        boost: keys.boost || this.ui.flightControls.boost,
        autopilot: this.flightState.autopilot,
      };
    if (!this.busy && dt > 0.001) {
      this.flightState = stepFlight(
        this.flightState,
        controls,
        dt,
        this.store.state.discovered,
      );
      const tail = this.pilotCommands.at(-1);
      if (
        tail &&
        tail.dt + dt <= 0.12 &&
        Object.keys(controls).every(
          (key) =>
            tail.input[key as keyof PilotInput] ===
            controls[key as keyof PilotInput],
        )
      )
        tail.dt += dt;
      else this.pilotCommands.push({ input: controls, dt });
      this.spaceTick += dt;
      if (this.spaceTick > 0.45 || this.pilotCommands.length >= 26) {
        this.spaceTick = 0;
        void this.sendPilots();
      }
    }
    this.space.update(this.flightState, dt, time / 1000, this.busy);
    this.ui.space(this.flightState, this.busy, this.space.projectTarget());
    this.renderer.render(this.space.scene, this.space.camera);
  }
  private async land() {
    if (
      this.busy ||
      !this.flightState ||
      !this.space ||
      !landingInfo(this.flightState).allowed
    )
      return;
    this.busy = true;
    this.input.clear();
    try {
      await this.flushPilots();
      this.flightState = structuredClone(this.store.state.flight!);
      if (!landingInfo(this.flightState).allowed)
        throw new Error("Снизьте скорость и подойдите ближе к маяку.");
      const start = { ...this.flightState.position },
        end = padPoint(
          this.flightState.target,
          0,
          this.flightState.pads?.[this.flightState.target],
        );
      await this.animateFlight(2600, (t) => {
        if (!this.flightState) return;
        const k = t * t * (3 - 2 * t);
        this.flightState.position = {
          x: start.x + (end.x - start.x) * k,
          y: start.y + (end.y - start.y) * k,
          z: start.z + (end.z - start.z) * k,
        };
        this.flightState.velocity = { x: 0, y: 0, z: 0 };
      });
      await this.store.action({ type: "land" });
      this.space.dispose();
      this.space = undefined;
      this.flightState = undefined;
      this.flying = false;
      this.avatar.root.visible = true;
      this.ui.space(null);
      this.ui.root.classList.remove("in-flight");
      this.loadScene();
      this.audio.play("land");
      this.ui.toast(
        `Посадка завершена: ${PLANETS[this.store.state.planet].name}.`,
      );
    } catch (e) {
      if (this.store.state.flight)
        this.flightState = structuredClone(this.store.state.flight);
      this.ui.toast((e as Error).message);
    } finally {
      this.busy = false;
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
        "little-planets-v6",
        JSON.stringify({ ...this.store.state, position: { ...this.position } }),
      );
    } catch {}
  }
  private frame = (time: number) => {
    const raw = this.previousTime ? (time - this.previousTime) / 1000 : 0,
      dt = Math.min(0.08, raw);
    this.previousTime = time;
    if (this.observation) {
      this.observation.update(dt, innerWidth / innerHeight);
      const finish = this.ui.el("optics-finish");
      if (finish)
        (finish as HTMLButtonElement).disabled = !this.observation.finished;
      this.renderer.render(this.observation.scene, this.observation.camera);
      return;
    }
    if (this.store.state.prologue.phase === "arrival" && this.introStarted) {
      this.zoom = 1;
      this.introElapsed += Math.min(raw, 0.15);
      const seconds = this.introElapsed;
      this.introVeil.style.opacity = String(
        1 - T.MathUtils.smoothstep(seconds, 1, 4.8),
      );
      if (seconds >= 6.2 && !this.busy && time >= this.introRetryAt) {
        this.introRetryAt = time + 4000;
        void this.advanceStory();
      }
    }
    if (this.space) {
      this.spaceFrame(dt, time);
      return;
    }
    this.slowTime =
      raw > 0.045 ? this.slowTime + dt : Math.max(0, this.slowTime - dt);
    if (this.slowTime > 4 && this.adaptiveRatio > 0.8) {
      this.adaptiveRatio = Math.max(0.8, this.adaptiveRatio - 0.15);
      this.renderer.setPixelRatio(this.adaptiveRatio);
      this.slowTime = 0;
    }
    let moving = false;
    if (!this.store.state.inside && isSphere(this.store.state.planet))
      moving = this.moveSphere(dt);
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
    if (!this.store.state.inside && isSphere(this.store.state.planet)) {
      const visual = cubeVisualUp(this.position, this.store.state.planet),
        up = new T.Vector3(visual.x, visual.y, visual.z),
        transport = new T.Quaternion().setFromUnitVectors(this.visualUp, up);
      this.renderForward
        .applyQuaternion(transport)
        .projectOnPlane(up)
        .normalize();
      this.visualUp.copy(up);
      const heading = this.sphereHeading.clone().projectOnPlane(up).normalize(),
        right = new T.Vector3().crossVectors(up, heading).normalize();
      this.avatar.root.position.copy(
        this.surfaceMotion.update(
          this.spherePoint(this.position, 0.06),
          this.sphereUp(this.position),
          dt,
        ),
      );
      const rotation = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, heading),
      );
      this.avatar.root.quaternion.slerp(rotation, 1 - Math.exp(-12 * dt));
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
    const cycle = dayCycle(
        this.store.state.cycleEpoch,
        this.store.now(),
        this.visualUp,
      ),
      dir = new T.Vector3(
        cycle.direction.x,
        cycle.direction.y,
        cycle.direction.z,
      );
    this.sun.position.copy(this.avatar.root.position).addScaledVector(dir, 38);
    this.sun.target.position.copy(this.avatar.root.position);
    this.sun.intensity = 0.55 + cycle.daylight * 2.6;
    this.ambient.intensity = 0.85 + cycle.daylight * 0.33;
    this.ambient.color.setHex(cycle.daylight > 0.5 ? 0xdce8df : 0xa3bad4);
    // Soft moon fill keeps the six cube faces readable while the sun is below them.
    this.moon.position
      .copy(this.avatar.root.position)
      .addScaledVector(this.visualUp, 35)
      .addScaledVector(this.renderForward, 16);
    this.moon.target.position.copy(this.avatar.root.position);
    this.moon.intensity = (1 - cycle.daylight) * 1.2;
    this.lantern.position
      .copy(this.avatar.root.position)
      .addScaledVector(this.visualUp, 1.2);
    this.lantern.intensity = (1 - cycle.daylight) * 6;
    if (!this.store.state.inside)
      this.scene.background = new T.Color(0x172c44).lerp(
        new T.Color(0x9cbcaf),
        cycle.daylight * 0.65,
      );
    this.ui.el("day-clock").textContent = `${cycle.label} · ${cycle.clock}`;
    this.avatar.root.visible = true;
    if (this.view instanceof SphereWorld)
      this.view.nature.daylight = cycle.daylight;
    updateIndustrialLights(this.scene,this.avatar.root.position,cycle.daylight,this.quality,time/1000);
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
      this.ui
        .el("mine-strike")
        .classList.toggle(
          "hidden",
          !["axe", "cultivator"].includes(this.store.state.hand) ||
            !!this.store.state.inside ||
            !!this.buildOnCube ||
            !!this.inventoryPlacement,
        );
      this.automationPanel?.refresh();
      this.colonyPanels?.refresh();
      const audioButton = this.ui.el("audio-toggle");
      if (audioButton.dataset.muted !== String(this.audio.muted)) {
        audioButton.dataset.muted = String(this.audio.muted);
        audioButton.innerHTML = hudIcon(this.audio.muted ? "muted" : "audio");
      }
      if (!this.busy && this.ui.contextOpen) this.showContext();
    }
    if (this.saveTick > 2 && !this.busy) {
      this.saveTick = 0;
      void this.flushMove().catch((e) => {
        this.ui.el("save-status").textContent = e.message;
      });
    }
    if (
      time - this.lastCombatPoll >
        (PLANETS[this.store.state.planet].hostile ||
        this.store.state.automation.devices.length ||
        Object.values(this.store.state.worlds).some((w) =>
          w.buildings.some((b) => b.kind === "planetdrill"),
        )
          ? 850
          : 10000) &&
      !this.pulsePending &&
      !this.busy &&
      !this.flying
    ) {
      this.lastCombatPoll = time;
      void this.combatPulse();
    }
    this.machines.root.visible = !this.store.state.inside;
    this.machines.update(this.store.state, time / 1000);
    this.occlusion.update(
      this.view.root,
      this.avatar.root.position
        .clone()
        .addScaledVector(this.sphereUp(this.position), 0.8),
      this.camera,
    );
    this.occlusion.patch(this.machines.root);
    if (this.life) this.occlusion.patch(this.life.root);
    this.sky.update(this.camera);
    if (this.ui.modalOpen && time - this.modalRenderAt < 150) return;
    this.modalRenderAt = time;
    if (this.art) this.art.render(!this.lowQuality);
    else this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.abort.abort();
    this.ui.dispose();
    this.environment?.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.enemies?.dispose();
    this.weather.dispose();
    this.machines.dispose();
    this.occlusion.dispose();
    this.art?.dispose();
    this.observation?.dispose();
    this.sky.dispose();
    this.space?.dispose();
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
    this.introVeil.remove();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
