import { Camera } from '@babylonjs/core/Cameras/camera';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Engine } from '@babylonjs/core/Engines/engine';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Rendering/edgesRenderer';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { AimView } from './AimView';
import { aimSpec, clippedAim } from '../controls/aim';
import { direction, add } from '../core/math';
import { makeEntity } from '../teams/roster';
import { CombatVfx } from './CombatVfx';
import { FrameEvents, renderPixelRatio } from './RenderQuality';
import { ActorView } from '../animation/ActorView';
import { AssetLibrary } from './assets';
import { Environment } from './Environment';
import { getClass } from '../classes/catalog';
import type { Entity, GameEvent, MatchState, Vec2, Zone } from '../core/types';
export type Quality = 'low' | 'medium' | 'high';
export class WorldRenderer {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  assets: AssetLibrary;
  private environment?: Environment;
  private actors = new Map<string, ActorView>();
  private projectiles = new Map<number, Mesh>();
  private zoneViews = new Map<number, Mesh>();
  private pointViews: Mesh[] = [];
  private vfx: CombatVfx;
  private aimView: AimView;
  private environmentMap?: MatchState['map'];
  private aimPreview?: { index: number; aim?: Vec2 };
  private dormantBoss?: ActorView;
  private retired = new Set<string>();
  private pendingEvents = new FrameEvents<GameEvent>();
  private shadow: ShadowGenerator;
  private glow: GlowLayer;
  private selected?: Mesh;
  private markerMat: StandardMaterial;
  private instrumentation: SceneInstrumentation;
  private mode: 'menu' | 'battle' = 'menu';
  private resizeObserver: ResizeObserver;
  private resizeCanvas = () => this.syncCanvasSize();
  private canvasSize = { width: 0, height: 0, dpr: 0 };
  private quality: Quality = 'medium';
  private follow = new Vector3(0, 1, -24);
  private lastEvent = 0;
  private navigation: Mesh[] = [];
  private chest?: TransformNode;
  private generation = 0;
  ready = false;
  onError?: (message: string) => void;
  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(
      canvas,
      true,
      {
        preserveDrawingBuffer: false,
        stencil: true,
        powerPreference: 'high-performance',
        audioEngine: false,
      },
      false,
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString('#65b9e0ff');
    this.scene.fogMode = Scene.FOGMODE_NONE;
    this.scene.fogDensity = 0.0045;
    this.scene.fogColor = Color3.FromHexString('#426779');
    const image = this.scene.imageProcessingConfiguration;
    image.toneMappingEnabled = false;
    image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    image.exposure = 1.05;
    image.contrast = 1.1;
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      1.0,
      29,
      this.follow.clone(),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 12;
    this.camera.upperRadiusLimit = 60;
    this.camera.minZ = 0.2;
    this.camera.fov = 0.72;
    this.camera.inputs.clear();
    const hemi = new HemisphericLight('sky', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.85;
    hemi.diffuse = Color3.FromHexString('#cce7ff');
    hemi.groundColor = Color3.FromHexString('#6e8065');
    const sun = new DirectionalLight('moon', new Vector3(-0.5, -1, 0.6), this.scene);
    sun.position.set(20, 35, -20);
    sun.intensity = 1.15;
    sun.diffuse = Color3.FromHexString('#f6e3bd');
    this.shadow = new ShadowGenerator(1024, sun);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadow.bias = 0.0015;
    this.shadow.normalBias = 0.05;
    this.shadow.darkness = 0.35;
    this.glow = new GlowLayer('magic-glow', this.scene, {
      blurKernelSize: 32,
      mainTextureRatio: 0.5,
    });
    this.glow.intensity = 0.3;
    this.vfx = new CombatVfx(this.scene);
    this.aimView = new AimView(this.scene);
    this.markerMat = this.material('player-ring', '#a8d8cc', 0.8);
    this.assets = new AssetLibrary(this.scene);
    this.instrumentation = new SceneInstrumentation(this.scene);
    this.instrumentation.captureFrameTime = true;
    this.setQuality('medium');
    this.resizeObserver = new ResizeObserver(this.resizeCanvas);
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resizeCanvas);
    window.visualViewport?.addEventListener('resize', this.resizeCanvas);
  }
  private material(name: string, color: string, alpha = 1) {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.emissiveColor = Color3.FromHexString(color).scale(0.65);
    m.alpha = alpha;
    m.disableLighting = true;
    return m;
  }
  async load(state: MatchState, menu = false) {
    const generation = ++this.generation;
    this.ready = false;
    this.environmentMap = state.map;
    this.mode = menu ? 'menu' : 'battle';
    this.updateCameraProjection();
    this.environment?.dispose();
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
    this.retired.clear();
    this.dormantBoss?.dispose();
    this.dormantBoss = undefined;
    for (const m of [
      ...this.projectiles.values(),
      ...this.zoneViews.values(),
      ...this.pointViews,
      ...this.navigation,
    ])
      m.dispose(false, true);
    this.projectiles.clear();
    this.zoneViews.clear();
    this.pointViews = [];
    this.navigation = [];
    this.vfx.clear();
    this.pendingEvents.clear();
    this.selected?.dispose();
    this.chest?.dispose();
    this.chest = undefined;
    this.lastEvent = 0;
    this.environment = new Environment(this.scene, this.assets);
    const hero = state.entities.find((e) => e.controller === 'HUMAN_LOCAL')!;
    this.follow.set(hero.position.x, 1, hero.position.z + 2);
    this.camera.setTarget(this.follow);
    this.camera.radius = menu ? 23 : this.battleRadius();
    await Promise.all([
      this.environment.build(state.map),
      ...state.entities.map((e) => this.addActor(e)),
    ]);
    if (generation !== this.generation) return;
    if (state.mode === 'raid' && !menu) {
      // Decode, instantiate the rig, and compile its materials during the loading screen.
      const boss = makeEntity('boss', 'guardian', 'PVE', { x: 0, z: 27 }, 'BOT');
      boss.kind = 'boss';
      this.dormantBoss = new ActorView(this.scene, this.assets, boss);
      await this.dormantBoss.load();
      await Promise.all(
        this.dormantBoss.meshList
          .filter((m) => m.isEnabled() && m.material)
          .map((m) => m.material!.forceCompilationAsync(m)),
      );
      this.dormantBoss.root.setEnabled(false);
    }
    if (generation !== this.generation) return;
    this.selected = MeshBuilder.CreateTorus(
      'local-selection',
      { diameter: 1.8, thickness: 0.025, tessellation: 48 },
      this.scene,
    );
    this.selected.material = this.markerMat;
    this.selected.position.y = 0.06;
    for (const p of state.points) {
      const ring = MeshBuilder.CreateTorus(
        `point-${p.id}`,
        { diameter: p.radius * 2, thickness: 0.075, tessellation: 64 },
        this.scene,
      );
      ring.position.set(p.position.x, 0.1, p.position.z);
      ring.material = this.material(`point-${p.id}-mat`, '#cab57f', 0.8);
      this.pointViews.push(ring);
    }
    this.ready = true;
  }
  private async addActor(e: Entity) {
    if (this.actors.has(e.id)) return;
    const prepared = e.kind === 'boss' ? this.dormantBoss : undefined;
    const view = prepared ?? new ActorView(this.scene, this.assets, e);
    this.actors.set(e.id, view);
    if (prepared) {
      this.dormantBoss = undefined;
      view.entity = e;
    } else await view.load();
    for (const mesh of view.meshList) this.shadow.addShadowCaster(mesh);
  }
  async showcase(e: Entity) {
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
    await this.addActor(e);
  }
  setMenu(menu: boolean) {
    this.mode = menu ? 'menu' : 'battle';
    this.updateCameraProjection();
  }
  setQuality(q: Quality) {
    this.quality = q;
    this.syncCanvasSize(true);
    this.vfx.quality = q;
    this.shadow.getShadowMap()?.resize(q === 'high' ? 2048 : 1024);
    this.scene.shadowsEnabled = q !== 'low';
    this.glow.isEnabled = q !== 'low';
  }
  private syncCanvasSize(force = false) {
    const width = this.canvas.clientWidth,
      height = this.canvas.clientHeight,
      dpr = window.devicePixelRatio || 1;
    if (!width || !height) return;
    if (
      !force &&
      width === this.canvasSize.width &&
      height === this.canvasSize.height &&
      dpr === this.canvasSize.dpr
    )
      return;
    this.canvasSize = { width, height, dpr };
    const ratio = renderPixelRatio(this.quality, dpr, width, height);
    this.engine.setHardwareScalingLevel(1 / ratio);
    // Babylon's camera projection must use the same aspect as the CSS canvas.
    this.engine.resize();
    this.updateCameraProjection();
  }
  private updateCameraProjection() {
    if (this.mode === 'menu') {
      this.camera.mode = Camera.PERSPECTIVE_CAMERA;
      this.camera.beta = 1.0;
      return;
    }
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.beta = 0.6;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const halfHeight = aspect > 1.8 ? 7.5 : 9.5;
    this.camera.orthoLeft = -halfHeight * aspect;
    this.camera.orthoRight = halfHeight * aspect;
    this.camera.orthoTop = halfHeight;
    this.camera.orthoBottom = -halfHeight;
  }
  render(state: MatchState, dt: number, alpha = 1) {
    const hero = state.entities.find((e) => e.controller === 'HUMAN_LOCAL')!;
    const target = new Vector3(
      hero.position.x + (this.mode === 'menu' ? -3.8 : 0),
      1,
      hero.position.z + (this.mode === 'menu' ? -3 : -1.2),
    );
    Vector3.LerpToRef(this.follow, target, 1 - Math.exp(-dt * 5), this.follow);
    this.camera.setTarget(this.follow);
    this.camera.radius +=
      ((this.mode === 'menu' ? 22 : this.battleRadius()) - this.camera.radius) *
      Math.min(1, dt * 4);
    for (const e of state.entities) {
      const view = this.actors.get(e.id);
      if (view) {
        if (!e.alive && e.kind !== 'hero' && view.isFaded(state.time)) {
          for (const mesh of view.meshList) this.shadow.removeShadowCaster(mesh);
          view.dispose();
          this.actors.delete(e.id);
          this.retired.add(e.id);
          continue;
        }
        view.root.setEnabled(this.mode === 'battle' || e.team === 'A');
        view.update(e, dt, state.time, alpha);
        if (this.mode === 'menu' && e.team === 'A') {
          const slot = Number(e.id.slice(-1));
          view.root.position.set(
            hero.position.x + (slot ? slot * 2.4 - 3 : -3),
            0,
            hero.position.z + (slot ? 1 : 0),
          );
          view.root.rotation.y = Math.PI + 0.15;
          view.root.scaling.setAll(slot ? 1.1 : 1.6);
        } else view.root.scaling.setAll(1);
      } else if (!this.retired.has(e.id))
        void this.addActor(e).catch((error) => this.onError?.(String(error)));
    }
    if (this.selected) {
      this.selected.position.x = hero.position.x;
      this.selected.position.z = hero.position.z;
      this.selected.setEnabled(hero.alive && this.mode === 'battle');
    }
    for (const p of state.projectiles) {
      let mesh = this.projectiles.get(p.id);
      if (!mesh) {
        const caster = state.entities.find((e) => e.id === p.source);
        const magic = caster ? getClass(caster.classId).model === 'Mage' : false;
        const ice = caster?.classId === 'icemage' || p.abilityId === 'archer-2';
        const fire = caster?.classId === 'firemage';
        const special = !!p.abilityId;
        mesh = new Mesh('projectile-root', this.scene);
        const mat = this.material(
          'visible-projectile',
          ice ? '#9af4ff' : fire ? '#ffad32' : magic || p.effects ? p.color : '#fff0a2',
        );
        if (ice) {
          const lance = MeshBuilder.CreateCylinder(
            'flying-ice-lance',
            { height: special ? 1.7 : 0.9, diameterBottom: 0.42, diameterTop: 0, tessellation: 4 },
            this.scene,
          );
          lance.parent = mesh;
          lance.material = mat;
          for (const side of [-1, 1]) {
            const shard = MeshBuilder.CreateCylinder(
              'frost-bolt-shard',
              { height: 0.65, diameterBottom: 0.18, diameterTop: 0, tessellation: 4 },
              this.scene,
            );
            shard.parent = mesh;
            shard.material = mat;
            shard.position.x = side * 0.24;
            shard.position.y = -0.25;
          }
        } else if (magic) {
          const core = MeshBuilder.CreateSphere(
            'magic-bolt-core',
            { diameter: special ? 0.75 : 0.44, segments: 8 },
            this.scene,
          );
          core.material = mat;
          core.parent = mesh;
          if (fire)
            for (let i = 0; i < 3; i++) {
              const flame = MeshBuilder.CreateCylinder(
                'fireball-flame',
                { height: 1.3, diameterTop: 0.42, diameterBottom: 0, tessellation: 5 },
                this.scene,
              );
              flame.parent = mesh;
              flame.material = mat;
              flame.position.set(Math.sin(i * 2.1) * 0.2, -0.55, Math.cos(i * 2.1) * 0.2);
            }
        } else {
          const shaft = MeshBuilder.CreateCylinder(
            'arrow-shaft',
            { height: special ? 1.4 : 0.95, diameter: special ? 0.11 : 0.065, tessellation: 5 },
            this.scene,
          );
          shaft.parent = mesh;
          shaft.material = mat;
          const tip = MeshBuilder.CreateCylinder(
            'arrow-tip',
            { height: 0.25, diameterBottom: 0.19, diameterTop: 0, tessellation: 4 },
            this.scene,
          );
          tip.parent = mesh;
          tip.position.y = 0.54;
          tip.material = mat;
        }
        const trail = MeshBuilder.CreateCylinder(
          'bolt-streak',
          {
            height: magic ? 0.9 : 0.7,
            diameterBottom: 0,
            diameterTop: magic ? 0.25 : 0.12,
            tessellation: 6,
          },
          this.scene,
        );
        trail.parent = mesh;
        trail.position.y = -0.55;
        trail.material = mat;
        this.projectiles.set(p.id, mesh);
      }
      mesh.position.set(p.position.x, 1.25, p.position.z);
      mesh.rotation.set(Math.PI / 2, Math.atan2(p.direction.x, p.direction.z), 0);
    }
    for (const [id, m] of this.projectiles)
      if (!state.projectiles.some((p) => p.id === id)) {
        m.dispose(false, true);
        this.projectiles.delete(id);
      }
    for (const z of state.zones) {
      let mesh = this.zoneViews.get(z.id);
      if (!mesh) {
        mesh = this.createZoneMesh(z);
        this.zoneViews.set(z.id, mesh);
      }
      mesh.position.set(z.position.x, 0.12, z.position.z);
      mesh.scaling.setAll(z.delay > 0 ? 1 + Math.sin(state.time * 10) * 0.025 : 1);
    }
    for (const [id, m] of this.zoneViews)
      if (!state.zones.some((z) => z.id === id)) {
        m.dispose(false, true);
        this.zoneViews.delete(id);
      }
    state.points.forEach((p, i) => {
      const mat = this.pointViews[i]?.material as StandardMaterial;
      if (mat)
        mat.emissiveColor = Color3.FromHexString(
          p.contested
            ? '#e3bc72'
            : p.owner === 'A'
              ? '#76c7b5'
              : p.owner === 'B'
                ? '#e98778'
                : '#b9af91',
        );
    });
    if (state.chest && !this.chest) {
      const chest = new TransformNode('raid-reward-chest', this.scene);
      this.chest = chest;
      chest.position.set(state.chest.x, 0.1, state.chest.z);
      void this.assets
        .load('chest_gold')
        .then((container) => {
          if (chest.isDisposed()) return;
          const instance = container.instantiateModelsToScene((n) => `loot:${n}`, false, {
            doNotInstantiate: false,
          });
          for (const node of instance.rootNodes) node.parent = chest;
        })
        .catch((error) => this.onError?.(String(error)));
    }
    this.pendingEvents.push(state.events);
    for (const event of this.pendingEvents.drain())
      if (event.id > this.lastEvent) {
        this.vfx.emit(event, state);
        this.lastEvent = event.id;
      }
    this.vfx.update(dt, state);
    this.aimView.update(this.mode === 'battle' ? this.aimPreview : undefined, hero, state);
    this.environment?.update(state.time, hero.position);
    this.scene.animationTimeScale = Math.min(
      1,
      dt / Math.max(0.001, this.engine.getDeltaTime() / 1000),
    );
    this.scene.render();
  }
  setAim(preview?: { index: number; aim?: Vec2 }) {
    this.aimPreview = preview;
  }
  dragAim(hero: Entity, dx: number, dy: number, index: number): Vec2 | undefined {
    const center = this.screenPosition(hero.position, 0);
    const world = this.aimAt(center.x + dx, center.y + dy);
    if (!world) return undefined;
    const spec = aimSpec(hero, index);
    const pull = Math.min(1, Math.hypot(dx, dy) / 110);
    const magnitude = spec.shape === 'area' ? pull * pull * (3 - 2 * pull) : 1;
    const end = add(
      hero.position,
      direction(hero.position, world),
      Math.max(0.1, spec.range * magnitude),
    );
    return clippedAim(hero.position, end, this.environmentMap!);
  }
  enqueueEvents(events: readonly GameEvent[]) {
    this.pendingEvents.push(events);
  }
  private battleRadius() {
    return this.canvas.clientWidth / this.canvas.clientHeight < 0.8 ? 22 : 18.5;
  }
  private createZoneMesh(z: Zone) {
    if (z.shape !== 'cone') {
      const area = MeshBuilder.CreateDisc(
        'area-footprint',
        { radius: z.radius, tessellation: 32, sideOrientation: Mesh.DOUBLESIDE },
        this.scene,
      );
      area.rotation.x = Math.PI / 2;
      area.material = this.material(
        'area-mat',
        z.telegraph && z.delay > 0 ? '#ff5d42' : z.color,
        z.telegraph ? 0.24 : 0.08,
      );
      area.isPickable = false;
      return area;
    }
    const mesh = new Mesh('cone-warning', this.scene),
      data = new VertexData();
    const positions = [0, 0, 0],
      indices: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = -(z.arc ?? Math.PI / 2) / 2 + ((z.arc ?? Math.PI / 2) * i) / 24;
      positions.push(Math.sin(a) * z.radius, 0, Math.cos(a) * z.radius);
      if (i > 0) indices.push(0, i, i + 1);
    }
    data.positions = positions;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.rotation.y = z.facing ?? 0;
    const mat = this.material('cone-warning-mat', '#f88161', 0.28);
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.enableEdgesRendering();
    mesh.edgesColor = new Color4(1, 0.5, 0.3, 0.9);
    mesh.edgesWidth = 2;
    return mesh;
  }
  screenPosition(p: Vec2, height = 2.65) {
    const projected = Vector3.Project(
      new Vector3(p.x, height, p.z),
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()),
    );
    return {
      x: (projected.x * this.canvas.clientWidth) / this.engine.getRenderWidth(),
      y: (projected.y * this.canvas.clientHeight) / this.engine.getRenderHeight(),
    };
  }
  aimAt(x: number, y: number): Vec2 | undefined {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.camera);
    const t = ray.intersectsPlane(new Plane(0, 1, 0, 0));
    if (t === null) return;
    const p = ray.origin.add(ray.direction.scale(t));
    return { x: p.x, z: p.z };
  }
  get metrics() {
    return {
      fps: Math.round(this.engine.getFps()),
      renderWidth: this.engine.getRenderWidth(),
      renderHeight: this.engine.getRenderHeight(),
      cssWidth: this.canvas.clientWidth,
      cssHeight: this.canvas.clientHeight,
      pixelRatio: 1 / this.engine.getHardwareScalingLevel(),
      activeVfx: this.vfx.activeCount,
      drawCalls: this.scene.getEngine()._drawCalls.current,
      meshes: this.scene.getActiveMeshes().length,
      frameMs: Math.round(this.instrumentation.frameTimeCounter.current * 10) / 10,
    };
  }
  showNavigation(show: boolean, state: MatchState) {
    for (const m of this.navigation) m.dispose(false, true);
    this.navigation = [];
    if (!show) return;
    for (const o of state.map.obstacles) {
      const m = MeshBuilder.CreateBox(
        'collision',
        { width: o.w, height: 0.2, depth: o.d },
        this.scene,
      );
      m.position.set(o.x, 0.3, o.z);
      m.material = this.material('collision-mat', '#fa7868', 0.45);
      this.navigation.push(m);
    }
  }
  dispose() {
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.resizeCanvas);
    window.visualViewport?.removeEventListener('resize', this.resizeCanvas);
    for (const a of this.actors.values()) a.dispose();
    this.dormantBoss?.dispose();
    this.aimView.dispose();
    this.vfx.dispose();
    this.instrumentation.dispose();
    this.environment?.dispose();
    void this.assets.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
