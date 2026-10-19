import * as T from "three";
/** Screen-door transparency along the camera-to-player capsule, including instanced terrain/nature.
 * Keeps depth correct and works with SSAO, without hiding an entire batched forest. */
export class Occlusion {
  readonly player = { value: new T.Vector3() };
  readonly eye = { value: new T.Vector3() };
  private patched = new WeakSet<T.Material>();
  private owned = new Map<T.Material, T.Material>();
  patch(root: T.Object3D) {
    root.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      const updated = materials.map((original) => {
        if (
          this.patched.has(original) ||
          !(original instanceof T.MeshStandardMaterial)
        )
          return original;
        let copy = this.owned.get(original);
        if (!copy) {
          copy = original.clone();
          this.owned.set(original, copy);
        }
        return copy;
      });
      o.material = Array.isArray(o.material) ? updated : updated[0];
      for (const m of updated) {
        if (this.patched.has(m) || !(m instanceof T.MeshStandardMaterial))
          continue;
        this.patched.add(m);
        m.onBeforeCompile = (shader) => {
          shader.uniforms.occlusionPlayer = this.player;
          shader.uniforms.occlusionEye = this.eye;
          shader.vertexShader =
            "varying vec3 occlusionWorld;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            `#include <project_vertex>
      vec4 occLocal=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        occLocal=instanceMatrix*occLocal;
      #endif
      occlusionWorld=(modelMatrix*occLocal).xyz;`,
          );
          shader.fragmentShader =
            "uniform vec3 occlusionPlayer; uniform vec3 occlusionEye; varying vec3 occlusionWorld;\n" +
            shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <alphatest_fragment>",
            `#include <alphatest_fragment>
      vec3 occRay=occlusionEye-occlusionPlayer;
      float occLen=length(occRay);
      vec3 occDir=occRay/max(occLen,0.001);
      float occT=dot(occlusionWorld-occlusionPlayer,occDir);
      float occDistance=length(occlusionWorld-(occlusionPlayer+occDir*occT));
      float occFade=(1.0-smoothstep(0.7,1.8,occDistance))*smoothstep(0.05,0.5,occT)*(1.0-smoothstep(occLen-1.0,occLen,occT));
      float occNoise=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
      if(occNoise < occFade*0.86) discard;`,
          );
        };
        m.customProgramCacheKey = () => "planet-occlusion-v1";
        m.needsUpdate = true;
      }
    });
  }
  dispose() {
    for (const m of this.owned.values()) m.dispose();
    this.owned.clear();
  }
  update(root: T.Object3D, player: T.Vector3, camera: T.Camera) {
    this.player.value.copy(player);
    this.eye.value.copy(camera.position);
    this.patch(root);
  }
}
