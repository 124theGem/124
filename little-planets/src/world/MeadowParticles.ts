import * as T from "three";
import { offsetPoint, surfacePoint } from "../../shared/voxel";
import { ship, type PlanetId } from "../../shared/catalog";
import { sphereNormal, cubeUp } from "../../shared/sphere";
import type { GraphicsQuality } from "./Graphics";
/** Bounded world-space pollen and nocturnal insects, independent of the camera. */
export class MeadowParticles {
  readonly root = new T.Group();
  private geometry = new T.BufferGeometry();
  private material = new T.PointsMaterial({
    vertexColors: true,
    size: 0.055,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    toneMapped: false,
  });
  private origins: T.Vector3[] = [];
  private ups: T.Vector3[] = [];
  private tangents: T.Vector3[] = [];
  private positions = new Float32Array(120 * 3);
  private colors = new Float32Array(120 * 3);
  private points: T.Points;
  constructor(id: PlanetId) {
    const pad = ship(id);
    for (let i = 0; i < 120; i++) {
      const at = offsetPoint(
          pad,
          Math.sin(i * 2.4) * (4 + (i % 17)),
          Math.cos(i * 2.4) * (4 + (i % 17)),
          id,
        ),
        p = surfacePoint(at, id),
        n = cubeUp(sphereNormal(at, id));
      const up = new T.Vector3(n.x, n.y, n.z),
        tangent = new T.Vector3(0.8, 0.3, 0.6).projectOnPlane(up).normalize();
      this.origins.push(new T.Vector3(p.x, p.y, p.z));
      this.ups.push(up);
      this.tangents.push(tangent);
    }
    this.geometry.setAttribute(
      "position",
      new T.BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute("color", new T.BufferAttribute(this.colors, 3));
    this.points = new T.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.root.add(this.points);
  }
  update(time: number, daylight: number, quality: GraphicsQuality) {
    const count =
      quality === "economy" ? 24 : quality === "balanced" ? 65 : 120;
    this.geometry.setDrawRange(0, count);
    for (let i = 0; i < count; i++) {
      const p = this.origins[i]
        .clone()
        .addScaledVector(this.ups[i], 0.6 + ((i * 0.31 + time * 0.07) % 2.4))
        .addScaledVector(this.tangents[i], Math.sin(time * 0.28 + i) * 0.8);
      p.toArray(this.positions, i * 3);
      const night = 1 - daylight,
        flicker =
          0.25 + 0.75 * Math.pow((Math.sin(time * 1.8 + i * 1.7) + 1) / 2, 2);
      this.colors[i * 3] = (0.75 + night * 0.5) * flicker;
      this.colors[i * 3 + 1] = (0.65 + night * 0.9) * flicker;
      this.colors[i * 3 + 2] = (0.4 + night * 0.2) * flicker;
    }
    this.material.size = 0.045 + (1 - daylight) * 0.03;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
  get stats() {
    return {
      count: this.geometry.drawRange.count,
      origin: this.root.position.toArray(),
    };
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
