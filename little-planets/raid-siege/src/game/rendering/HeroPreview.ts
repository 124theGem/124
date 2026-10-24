import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { AssetLibrary } from './assets';
import { ActorView } from '../animation/ActorView';
import { makeEntity } from '../teams/roster';
/** A real skinned model preview, with the same loader/animation adapter as combat. */
export class HeroPreview {
  private engine: Engine;
  private scene: Scene;
  private assets: AssetLibrary;
  private actor: ActorView;
  private disposed = false;
  private resize: ResizeObserver;
  constructor(canvas: HTMLCanvasElement, classId: string) {
    this.engine = new Engine(canvas, true, {
      alpha: true,
      audioEngine: false,
      powerPreference: 'low-power',
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new ArcRotateCamera(
      'preview-camera',
      -Math.PI / 2,
      1.13,
      4.5,
      new Vector3(0, 1.1, 0),
      this.scene,
    );
    camera.inputs.clear();
    camera.fov = 0.65;
    const sky = new HemisphericLight('preview-sky', new Vector3(0, 1, 0), this.scene);
    sky.intensity = 1.5;
    const sun = new DirectionalLight('preview-rim', new Vector3(0.6, -1, 0.6), this.scene);
    sun.intensity = 2;
    sun.diffuse = Color3.FromHexString('#f3d9a4');
    this.assets = new AssetLibrary(this.scene);
    const e = makeEntity('preview', classId, 'A', { x: 0, z: 0 }, 'HUMAN_LOCAL');
    e.facing = Math.PI + 0.3;
    this.actor = new ActorView(this.scene, this.assets, e);
    this.resize = new ResizeObserver(() => this.engine.resize());
    this.resize.observe(canvas);
    void this.actor
      .load()
      .then(() => {
        if (this.disposed) return;
        let last = performance.now(),
          time = 0;
        this.engine.runRenderLoop(() => {
          const now = performance.now(),
            dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          time += dt;
          this.actor.update(e, dt, time, 1);
          this.scene.render();
        });
      })
      .catch((error) => {
        if (!this.disposed) console.warn('Hero preview unavailable:', error);
      });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resize.disconnect();
    this.actor.dispose();
    void this.assets.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
