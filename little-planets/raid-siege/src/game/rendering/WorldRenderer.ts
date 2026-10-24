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
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { ActorView } from '../animation/ActorView';
import { AssetLibrary } from './assets';
import { Environment } from './Environment';
import { getClass } from '../classes/catalog';
import type { Entity, GameEvent, MatchState, Vec2, Zone } from '../core/types';
export type Quality = 'low' | 'medium' | 'high';
interface VisualEffect {
  mesh: Mesh;
  age: number;
  life: number;
  scale: number;
}
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
  private effects: VisualEffect[] = [];
  private shadow: ShadowGenerator;
  private glow: GlowLayer;
  private selected?: Mesh;
  private markerMat: StandardMaterial;
  private instrumentation: SceneInstrumentation;
  private mode: 'menu' | 'battle' = 'menu';
  private quality: Quality = 'medium';
  private follow = new Vector3(0, 1, -24);
  private adaptive = 0;
  private frames = 0;
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
        preserveDrawingBuffer: true,
        stencil: true,
        powerPreference: 'high-performance',
        audioEngine: false,
      },
      true,
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString('#111f27ff');
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.017;
    this.scene.fogColor = Color3.FromHexString('#17282e');
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      0.88,
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
    hemi.intensity = 0.9;
    hemi.diffuse = Color3.FromHexString('#c4dbd9');
    hemi.groundColor = Color3.FromHexString('#2e3b40');
    const sun = new DirectionalLight('moon', new Vector3(-0.5, -1, 0.6), this.scene);
    sun.position.set(20, 35, -20);
    sun.intensity = 2.1;
    sun.diffuse = Color3.FromHexString('#f6e3bd');
    this.shadow = new ShadowGenerator(1024, sun);
    this.shadow.useBlurExponentialShadowMap = true;
    this.shadow.blurKernel = 16;
    this.shadow.darkness = 0.35;
    this.glow = new GlowLayer('magic-glow', this.scene, {
      blurKernelSize: 32,
      mainTextureRatio: 0.5,
    });
    this.glow.intensity = 0.42;
    this.markerMat = this.material('player-ring', '#a8d8cc', 0.8);
    this.assets = new AssetLibrary(this.scene);
    this.instrumentation = new SceneInstrumentation(this.scene);
    this.instrumentation.captureFrameTime = true;
    this.setQuality('medium');
    window.addEventListener('resize', () => this.engine.resize());
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
    this.mode = menu ? 'menu' : 'battle';
    this.environment?.dispose();
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
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
    for (const e of this.effects) e.mesh.dispose(false, true);
    this.effects = [];
    this.selected?.dispose();
    this.chest?.dispose();
    this.chest = undefined;
    this.lastEvent = 0;
    this.environment = new Environment(this.scene, this.assets);
    const hero = state.entities.find((e) => e.controller === 'HUMAN_LOCAL')!;
    this.follow.set(hero.position.x, 1, hero.position.z + 2);
    this.camera.setTarget(this.follow);
    this.camera.radius = menu ? 27 : 25;
    await Promise.all([
      this.environment.build(state.map),
      ...state.entities.map((e) => this.addActor(e)),
    ]);
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
    const view = new ActorView(this.scene, this.assets, e);
    this.actors.set(e.id, view);
    await view.load();
    for (const mesh of view.meshList) this.shadow.addShadowCaster(mesh);
  }
  async showcase(e: Entity) {
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
    await this.addActor(e);
  }
  setMenu(menu: boolean) {
    this.mode = menu ? 'menu' : 'battle';
  }
  setQuality(q: Quality) {
    this.quality = q;
    const scale = { low: 1.7, medium: 1.25, high: 1 }[q];
    this.engine.setHardwareScalingLevel(Math.max(scale, window.devicePixelRatio / 1.5));
    this.shadow.getShadowMap()?.resize(q === 'high' ? 2048 : 1024);
    this.scene.shadowsEnabled = q !== 'low';
    this.glow.isEnabled = q !== 'low';
  }
  render(state: MatchState, dt: number, alpha = 1) {
    const hero = state.entities.find((e) => e.controller === 'HUMAN_LOCAL')!;
    const target = new Vector3(
      hero.position.x + (this.mode === 'menu' ? -3.8 : 0),
      1,
      hero.position.z + (this.mode === 'menu' ? -3 : 2.8),
    );
    Vector3.LerpToRef(this.follow, target, 1 - Math.exp(-dt * 5), this.follow);
    this.camera.setTarget(this.follow);
    this.camera.radius +=
      ((this.mode === 'menu' ? 24 : 25) - this.camera.radius) * Math.min(1, dt * 4);
    for (const e of state.entities) {
      const view = this.actors.get(e.id);
      if (view) {
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
      } else void this.addActor(e).catch((error) => this.onError?.(String(error)));
    }
    if (this.selected) {
      this.selected.position.x = hero.position.x;
      this.selected.position.z = hero.position.z;
      this.selected.setEnabled(hero.alive && this.mode === 'battle');
    }
    for (const p of state.projectiles) {
      let mesh = this.projectiles.get(p.id);
      if (!mesh) {
        mesh = MeshBuilder.CreateSphere('projectile', { diameter: 0.25, segments: 6 }, this.scene);
        mesh.material = this.material('bolt', p.color);
        this.projectiles.set(p.id, mesh);
      }
      mesh.position.set(p.position.x, 1.25, p.position.z);
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
    for (const event of state.events)
      if (event.id > this.lastEvent) {
        this.effect(event);
        this.lastEvent = event.id;
      }
    for (const fx of this.effects) {
      fx.age += dt;
      const t = fx.age / fx.life;
      fx.mesh.scaling.setAll(fx.scale * (0.3 + t * 1.4));
      (fx.mesh.material as StandardMaterial).alpha = (1 - t) * 0.8;
      fx.mesh.rotation.y += dt * 2;
    }
    this.effects = this.effects.filter((fx) => {
      if (fx.age >= fx.life) {
        fx.mesh.dispose(false, true);
        return false;
      }
      return true;
    });
    this.environment?.update(state.time);
    this.scene.render();
    if (this.mode === 'battle' && ++this.frames % 120 === 0) {
      const fps = this.engine.getFps();
      if (fps < 28 && this.adaptive < 1) {
        this.adaptive += 0.15;
        this.engine.setHardwareScalingLevel(this.engine.getHardwareScalingLevel() + 0.15);
      }
    }
  }
  private createZoneMesh(z: Zone) {
    if (z.shape !== 'cone') {
      const ring = MeshBuilder.CreateTorus(
        'area',
        { diameter: z.radius * 2, thickness: z.telegraph ? 0.11 : 0.06, tessellation: 64 },
        this.scene,
      );
      ring.material = this.material('area-mat', z.telegraph ? '#ff755d' : z.color, 0.7);
      return ring;
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
  private effect(event: GameEvent) {
    if (this.effects.length > (this.quality === 'low' ? 15 : 50)) return;
    if (event.type === 'cast' || event.type === 'dodge' || event.type === 'death') {
      const mesh = MeshBuilder.CreateTorus(
        'spell-ring',
        {
          diameter: 1,
          thickness: event.ultimate ? 0.1 : 0.045,
          tessellation: this.quality === 'low' ? 20 : 40,
        },
        this.scene,
      );
      mesh.position.set(event.position.x, 0.15, event.position.z);
      mesh.material = this.material('spell-light', event.color);
      this.effects.push({
        mesh,
        age: 0,
        life: event.ultimate ? 1 : 0.45,
        scale: event.ultimate ? 4 : 1.5,
      });
      if (event.ultimate)
        for (let i = 0; i < 8; i++) {
          const spark = MeshBuilder.CreateSphere(
            'spark',
            { diameter: 0.14, segments: 4 },
            this.scene,
          );
          spark.position.set(
            event.position.x + Math.cos(i) * 2,
            1 + i * 0.2,
            event.position.z + Math.sin(i) * 2,
          );
          spark.material = this.material('spark-mat', event.color);
          this.effects.push({ mesh: spark, age: 0, life: 0.8, scale: 1 });
        }
    }
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
    const ray = this.scene.createPickingRay(
      (x / this.canvas.clientWidth) * this.engine.getRenderWidth(),
      (y / this.canvas.clientHeight) * this.engine.getRenderHeight(),
      Matrix.Identity(),
      this.camera,
    );
    const t = ray.intersectsPlane(new Plane(0, 1, 0, 0));
    if (t === null) return;
    const p = ray.origin.add(ray.direction.scale(t));
    return { x: p.x, z: p.z };
  }
  get metrics() {
    return {
      fps: Math.round(this.engine.getFps()),
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
    for (const a of this.actors.values()) a.dispose();
    this.instrumentation.dispose();
    this.environment?.dispose();
    void this.assets.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
