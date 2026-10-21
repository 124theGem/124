import * as T from "three";
import type { GraphicsQuality } from "./Graphics";

/** Per-plant anchors survive instancing: roots stay fixed on every cube face. */
export class WindField {
  readonly time = { value: 0 };
  readonly strength = { value: 1 };
  private geometries: T.BufferGeometry[] = [];
  private materials: T.Material[] = [];
  readonly batches: T.InstancedMesh[] = [];
  constructor(root: T.Group) {
    root.updateMatrixWorld(true);
    const buckets = new Map<
      string,
      {
        geo: T.BufferGeometry;
        material: T.MeshStandardMaterial;
        matrices: T.Matrix4[];
        anchors: number[];
        ups: number[];
        directions: number[];
      }
    >();
    for (const plant of root.children) {
      const anchor = plant.position,
        up = new T.Vector3(0, 1, 0).applyQuaternion(plant.quaternion),
        kind = plant.userData.windKind ?? 1;
      plant.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        const mat = o.material as T.MeshStandardMaterial,
          key = o.geometry.uuid + mat.uuid;
        if (!buckets.has(key))
          buckets.set(key, {
            geo: o.geometry,
            material: mat,
            matrices: [],
            anchors: [],
            ups: [],
            directions: [],
          });
        const bucket = buckets.get(key)!;
        bucket.matrices.push(o.matrixWorld.clone());
        bucket.anchors.push(anchor.x, anchor.y, anchor.z, kind);
        bucket.ups.push(up.x, up.y, up.z);
        const tangent = new T.Vector3(0.8, 0.24, 0.58).projectOnPlane(up);
        tangent.applyMatrix3(
          new T.Matrix3().setFromMatrix4(o.matrixWorld).invert(),
        );
        bucket.directions.push(tangent.x, tangent.y, tangent.z);
      });
    }
    root.clear();
    for (const bucket of buckets.values()) {
      const geo = bucket.geo.clone(),
        material = bucket.material.clone();
      geo.setAttribute(
        "windAnchor",
        new T.InstancedBufferAttribute(new Float32Array(bucket.anchors), 4),
      );
      geo.setAttribute(
        "windUp",
        new T.InstancedBufferAttribute(new Float32Array(bucket.ups), 3),
      );
      geo.setAttribute(
        "windDirection",
        new T.InstancedBufferAttribute(new Float32Array(bucket.directions), 3),
      );
      const hook = (shader: {
        uniforms: Record<string, unknown>;
        vertexShader: string;
      }) => {
        shader.uniforms.vegetationTime = this.time;
        shader.uniforms.vegetationStrength = this.strength;
        shader.vertexShader =
          "attribute vec4 windAnchor; attribute vec3 windUp; attribute vec3 windDirection; uniform float vegetationTime; uniform float vegetationStrength;\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          if (vegetationStrength > 0.0) {
            vec3 plantPosition = (instanceMatrix * vec4(transformed, 1.0)).xyz;
            float height = max(0.0, dot(plantPosition - windAnchor.xyz, windUp));
            float phase = dot(windAnchor.xyz, vec3(0.17,0.31,0.13));
            float frequency = mix(0.8,1.5,clamp(windAnchor.w - 1.0,0.0,1.0));
            float gust = sin(vegetationTime * frequency + phase) * 0.65 + sin(vegetationTime * 2.1 + phase * 1.7) * 0.22;
            float flexibility = windAnchor.w > 1.2 ? 0.065 : 0.014;
            transformed += windDirection * gust * vegetationStrength * min(height * height * flexibility,0.22) * windAnchor.w;
          }
          #endif`,
        );
      };
      material.onBeforeCompile = hook;
      material.customProgramCacheKey = () => "anchored-vegetation-v2";
      const mesh = new T.InstancedMesh(geo, material, bucket.matrices.length);
      bucket.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = mesh.receiveShadow = true;
      const depth = new T.MeshDepthMaterial({
        depthPacking: T.RGBADepthPacking,
      });
      depth.onBeforeCompile = hook;
      depth.customProgramCacheKey = () => "anchored-depth-v2";
      mesh.customDepthMaterial = depth;
      this.geometries.push(geo);
      this.materials.push(material, depth);
      this.batches.push(mesh);
      root.add(mesh);
    }
  }
  update(time: number, quality: GraphicsQuality) {
    this.time.value = time;
    this.strength.value =
      quality === "economy" ? 0 : quality === "balanced" ? 0.7 : 1;
  }
  get stats() {
    return {
      batches: this.batches.length,
      instances: this.batches.reduce((n, m) => n + m.count, 0),
      time: this.time.value,
      strength: this.strength.value,
    };
  }
  dispose() {
    this.batches.forEach((m) => m.dispose());
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
