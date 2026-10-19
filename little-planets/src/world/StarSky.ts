import * as T from "three";
import { PLANETS, type PlanetId } from "../../shared/catalog";
import { bodyCenter, sub, len } from "../../shared/space";
import { tiledSphere } from "./TiledSphere";
export class StarSky {
  readonly root = new T.Group();
  private stars: T.Points;
  private bodies = new T.Group();
  private geometry = new T.BufferGeometry();
  private material = new T.PointsMaterial({
    size: 1.55,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: false,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  private bodyMaterial = new T.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    depthTest: false,
    depthWrite: false,
  });
  private planetGeometries: T.BufferGeometry[] = [];
  constructor() {
    const positions: number[] = [],
      colors: number[] = [];
    for (let i = 0; i < 2400; i++) {
      const y = 1 - (2 * (i + 0.5)) / 2400,
        a = i * 2.39996,
        r = Math.sqrt(1 - y * y),
        d = 130;
      positions.push(Math.cos(a) * r * d, y * d, Math.sin(a) * r * d);
      const c = new T.Color(
        i % 7 === 0 ? 0xf4cca0 : i % 5 === 0 ? 0x9bc7ed : 0xe0e9f3,
      ).multiplyScalar(0.45 + ((i * 17) % 11) * 0.05);
      colors.push(c.r, c.g, c.b);
    }
    this.geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute(
      "color",
      new T.Float32BufferAttribute(colors, 3),
    );
    this.stars = new T.Points(this.geometry, this.material);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1000;
    this.root.add(this.stars, this.bodies);
  }
  setPlanet(id: PlanetId) {
    this.bodies.clear();
    for (const g of this.planetGeometries) g.dispose();
    this.planetGeometries = [];
    for (const other of Object.keys(PLANETS).slice(0, 8) as PlanetId[]) {
      if (other === id) continue;
      const delta = sub(bodyCenter(other), bodyCenter(id)),
        distance = len(delta),
        tile = tiledSphere(other, 7);
      this.planetGeometries.push(tile.geometry);
      const planet = new T.Mesh(tile.geometry, this.bodyMaterial),
        scale = 125 / distance;
      planet.renderOrder = -999;
      planet.position
        .set(delta.x, delta.y, delta.z)
        .normalize()
        .multiplyScalar(115);
      planet.scale.setScalar(Math.max(0.12, Math.min(0.27, scale)));
      this.bodies.add(planet);
    }
  }
  update(_camera: T.Camera) {
    // Bodies stay at fixed world positions when the player or camera moves.
    this.root.position.set(0, 0, 0);
    this.root.scale.setScalar(1);
  }
  get stats() {
    return { stars: 2400, planets: this.bodies.children.length };
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.bodyMaterial.dispose();
    for (const g of this.planetGeometries) g.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
