import * as T from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
/** Bounded-resolution contact shadows and a restrained illustrated-diorama grade. */
export class ArtRenderer {
  private composer: EffectComposer;
  private ao: SSAOPass;
  private output = new OutputPass();
  private renderPass: RenderPass;
  private grade: ShaderPass;
  private ratio = 0;
  private floatTargets: boolean;
  private measuringBeauty = false;
  readonly metrics = {
    drawCalls: 0,
    triangles: 0,
    frameCalls: 0,
    shadowCalls: 0,
    shadowTriangles: 0,
    ao: true,
  };
  constructor(
    private renderer: T.WebGLRenderer,
    scene: T.Scene,
    private camera: T.OrthographicCamera | T.PerspectiveCamera,
  ) {
    this.floatTargets = renderer.extensions.has("EXT_color_buffer_float");
    this.composer = new EffectComposer(
      renderer,
      new T.WebGLRenderTarget(1, 1, {
        type: this.floatTargets ? T.HalfFloatType : T.UnsignedByteType,
      }),
    );
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    const beautyRender = this.renderPass.render.bind(this.renderPass);
    this.renderPass.render = (...args) => {
      this.measuringBeauty = true;
      try {
        beautyRender(...args);
      } finally {
        this.measuringBeauty = false;
      }
      this.metrics.drawCalls =
        this.renderer.info.render.calls - this.metrics.shadowCalls;
      this.metrics.triangles =
        this.renderer.info.render.triangles - this.metrics.shadowTriangles;
    };
    this.ao = new SSAOPass(scene, camera, 1, 1, 12);
    this.ao.kernelRadius = 1.35;
    this.ao.minDistance = 0.0008;
    this.ao.maxDistance = 0.035;
    this.ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA =
      camera instanceof T.PerspectiveCamera ? 1 : 0;
    this.ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA =
      camera instanceof T.PerspectiveCamera ? 1 : 0;
    const setSize = this.ao.setSize.bind(this.ao);
    this.ao.setSize = (w, h) =>
      setSize(
        Math.max(1, Math.round(w * 0.65)),
        Math.max(1, Math.round(h * 0.65)),
      );
    this.composer.addPass(this.ao);
    const normalRender = this.ao.render.bind(this.ao);
    this.ao.render = (...args) => {
      const update = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      try {
        normalRender(...args);
      } finally {
        renderer.shadowMap.autoUpdate = update;
      }
    };
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,1.06);c*=vec3(1.02,1.015,.97);float v=1.-.17*pow(length((vUv-.5)*vec2(1.,.9)),1.4);gl_FragColor=vec4(c*v,1.);}",
    });
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);
    this.resize();
  }
  resize() {
    this.ratio = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(this.ratio);
    this.composer.setSize(innerWidth, innerHeight);
  }
  render(quality = true) {
    if (this.ratio !== this.renderer.getPixelRatio()) this.resize();
    this.metrics.ao = quality && this.floatTargets;
    this.ao.enabled = this.metrics.ao;
    this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
      this.camera.projectionMatrix,
    );
    this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
      this.camera.projectionMatrixInverse,
    );
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.metrics.shadowCalls = 0;
    this.metrics.shadowTriangles = 0;
    const originalShadowRender = this.renderer.shadowMap.render;
    this.renderer.shadowMap.render = (...args) => {
      const before = this.renderer.info.render.calls,
        triangles = this.renderer.info.render.triangles;
      originalShadowRender.apply(this.renderer.shadowMap, args);
      if (this.measuringBeauty) {
        this.metrics.shadowCalls = this.renderer.info.render.calls - before;
        this.metrics.shadowTriangles =
          this.renderer.info.render.triangles - triangles;
      }
    };
    // Report beauty, shadow and total pass costs separately rather than hiding postprocessing cost.
    try {
      this.composer.render();
      this.metrics.frameCalls = this.renderer.info.render.calls;
    } finally {
      this.renderer.shadowMap.render = originalShadowRender;
      this.renderer.info.autoReset = true;
    }
  }
  dispose() {
    this.ao.dispose();
    this.ao.noiseTexture.dispose();
    this.ao.ssaoMaterial.dispose();
    this.grade.dispose();
    this.output.dispose();
    this.composer.dispose();
  }
}
