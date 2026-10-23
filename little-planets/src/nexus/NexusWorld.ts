import * as T from "three";
import { NEXUS_PORTALS, NEXUS_COLORS, RACE_GATES, RELIC_ISLANDS, RELICS, type NexusActor, type NexusWorld } from "../../shared/nexus";

/** Shared geometry/material pools keep the procedural worlds light enough for mobile. */
export class NexusWorldView {
  readonly root = new T.Group();
  readonly portals = new T.Group();
  readonly pickables: T.Object3D[] = [];
  private world: NexusWorld = "hub";
  private geometry = new Map<string, T.BufferGeometry>();
  private materials = new Map<string, T.MeshStandardMaterial>();
  private animated: { object: T.Object3D; kind: string; phase: number }[] = [];
  private shards: T.Group[] = [];
  private gates: T.Mesh[] = [];
  private geometries(key: string, create: () => T.BufferGeometry) {
    if (!this.geometry.has(key)) this.geometry.set(key, create());
    return this.geometry.get(key)!;
  }
  material(color: number, glow = 0, metalness = 0.35) {
    const key = `${color}:${glow}:${metalness}`;
    if (!this.materials.has(key)) this.materials.set(key, new T.MeshStandardMaterial({
      color, roughness: glow ? 0.35 : 0.6, metalness, emissive: color, emissiveIntensity: glow,
    }));
    return this.materials.get(key)!;
  }
  box(parent: T.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: number, glow = 0) {
    const mesh = new T.Mesh(this.geometries("box", () => new T.BoxGeometry(1, 1, 1)), this.material(color, glow));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  cylinder(parent: T.Object3D, x: number, y: number, z: number, r: number, h: number, color: number, segments = 32, glow = 0) {
    const geometry = this.geometries(`cylinder-${segments}`, () => new T.CylinderGeometry(1, 1, 1, segments));
    const mesh = new T.Mesh(geometry, this.material(color, glow)); mesh.position.set(x, y, z); mesh.scale.set(r, h, r); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  ring(parent: T.Object3D, x: number, y: number, z: number, radius: number, color: number, thickness = 0.055) {
    const mesh = new T.Mesh(this.geometries(`torus-${thickness}`, () => new T.TorusGeometry(1, thickness, 6, 64)), this.material(color, 1.6));
    mesh.position.set(x, y, z); mesh.scale.setScalar(radius); parent.add(mesh); return mesh;
  }
  build(world: NexusWorld) {
    this.root.traverse(o => {
      if (o instanceof T.InstancedMesh) o.dispose();
      if (o instanceof T.Mesh && o.material instanceof T.MeshBasicMaterial) o.material.dispose();
    });
    this.world = world; this.root.clear(); this.portals.clear(); this.animated = []; this.shards = []; this.gates = []; this.pickables.length = 0;
    this.root.add(this.portals);
    if (world === "hub") this.buildHub();
    else if (world === "race") this.buildRace();
    else this.buildRelic();
    this.backdrop(world);
    this.batch();
  }
  private buildHub() {
    this.cylinder(this.root, 0, -0.65, 0, 28, 1.3, 0x273747, 64);
    this.cylinder(this.root, 0, -0.06, 0, 27.8, 0.1, 0x899ca4, 64);
    this.cylinder(this.root, 0, -1.9, 0, 22, 2, 0x111c32, 12);
    for (const r of [6, 12, 21, 27]) {
      const ring = this.ring(this.root, 0, 0.025, 0, r, r === 27 ? 0x69efeb : 0x425c6a, 0.0025); ring.rotation.x = -Math.PI / 2;
    }
    for (let i = -25; i <= 25; i += 2.5) {
      const length = 2 * Math.sqrt(Math.max(0, 27 * 27 - i * i));
      this.box(this.root, i, 0.005, 0, 0.025, 0.012, length, 0x6a818b);
      this.box(this.root, 0, 0.006, i, length, 0.012, 0.025, 0x6a818b);
    }
    this.cylinder(this.root, 0, 0.06, 0, 3.7, 0.12, 0x23384c, 32);
    const core = new T.Mesh(this.geometries("core", () => new T.OctahedronGeometry(1.7, 0)), this.material(0x7be8e1, 1.4));
    core.position.y = 5; this.root.add(core); this.animated.push({ object: core, kind: "core", phase: 0 });
    const orbit = this.ring(this.root, 0, 5, 0, 2.5, 0xf3cd8a, 0.015); orbit.rotation.x = 0.7; this.animated.push({ object: orbit, kind: "orbit", phase: 0 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, x = Math.sin(a) * 27, z = Math.cos(a) * 27;
      this.cylinder(this.root, x, 0.65, z, 0.16, 1.3, 0x344b5a, 8);
      this.box(this.root, x, 1.35, z, 0.22, 0.1, 0.22, i % 2 ? 0xa6eaee : 0xffd599, 1);
    }
    for (const p of NEXUS_PORTALS) {
      const portal = new T.Group(); portal.position.set(p.x, 0, p.z); portal.userData.portal = p.id;
      const base = this.cylinder(portal, 0, 0.1, 0, 3.5, 0.2, 0x1a2d40, 12);
      base.userData.portal = p.id;
      for (const side of [-1, 1]) {
        this.box(portal, side * 2.75, 2.7, 0, 0.55, 5.4, 0.7, 0xc5ced0);
        this.box(portal, side * 2.74, 2.7, 0.37, 0.1, 4.7, 0.04, p.color, 1.5);
        this.box(portal, side * 2.9, 0.35, 0.2, 1.2, 0.7, 1.6, 0x4c6070);
      }
      this.box(portal, 0, 5.3, 0, 6, 0.45, 0.8, 0xc3ced1);
      this.box(portal, 0, 5.55, 0.1, 3.5, 0.055, 0.5, p.color, 1.5);
      const ring = this.ring(portal, 0, 2.8, 0, 2.5, p.color, 0.025);
      this.animated.push({ object: ring, kind: "portal", phase: p.x });
      const veil = new T.Mesh(this.geometries("veil", () => new T.CircleGeometry(2.4, 48)), new T.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
      veil.position.set(0, 2.8, -0.05); portal.add(veil); veil.userData.portal = p.id;
      this.animated.push({ object: veil, kind: "veil", phase: p.x });
      for (let i = 0; i < 5; i++) { const r = this.ring(portal, 0, 2.8, -0.1 - i * 0.13, 2 - i * 0.3, p.color, 0.006); this.animated.push({ object: r, kind: "portal", phase: i }); }
      const hologram = new T.Group(); hologram.position.set(0, 2.8, 0.2);
      if (p.id === "colony") {
        this.box(hologram, 0, 0, 0, 1.6, 1.3, 1.6, 0x8baba0);
        this.box(hologram, 0, 0.68, 0, 1.65, 0.12, 1.65, 0xa4d69a);
        for (const side of [-1, 1]) {
          this.cylinder(hologram, side * 0.48, 0.93, 0, 0.05, 0.5, 0x607e73, 6);
          this.sphere(hologram, side * 0.48, 1.22, 0, 0.31, this.material(0xa5de9a, 0.2));
        }
      } else if (p.id === "race") {
        const orbit = this.ring(hologram, 0, 0, 0, 1.35, p.color, 0.06); orbit.rotation.x = 0.7;
        this.box(hologram, 0, 0, 0, 0.55, 0.16, 1.9, 0xaccbd4);
        this.box(hologram, 0, 0.13, 0.05, 0.24, 0.08, 1.3, p.color, 0.8);
      } else {
        const crystal = new T.Mesh(this.geometries("portal-gem", () => new T.OctahedronGeometry(1.1)), this.material(p.color, 0.7));
        hologram.add(crystal);
      }
      portal.add(hologram); this.animated.push({ object: hologram, kind: "orbit", phase: 2 });
      this.portals.add(portal); this.pickables.push(portal);
    }
  }
  private buildRace() {
    const geo = this.geometries("track", () => new T.RingGeometry(0.78, 1.22, 128));
    const road = new T.Mesh(geo, this.material(0x273249)); road.rotation.x = -Math.PI / 2; road.scale.set(24, 17, 1); road.receiveShadow = true; this.root.add(road);
    for (const radius of [0.79, 1, 1.21]) {
      const line = this.ring(this.root, 0, 0.035, 0, 1, radius === 1 ? 0x63789b : 0x78eff3, 0.0025);
      line.rotation.x = -Math.PI / 2; line.scale.set(24 * radius, 17 * radius, 1);
    }
    RACE_GATES.forEach((p, i) => {
      const group = new T.Group(); group.position.set(p.x, 0, p.z);
      const a = Math.PI / 2 + ((i + 1) / 12) * Math.PI * 2;
      group.rotation.y = Math.atan2(-Math.sin(a) * 24, Math.cos(a) * 17);
      for (const side of [-1, 1]) {
        this.box(group, side * 3.05, 2.25, 0, 0.2, 4.5, 0.4, 0x8f9dab);
        this.box(group, side * 3.03, 2.25, 0.23, 0.12, 4.1, 0.08, 0x7098b8, 0.7);
      }
      this.box(group, 0, 4.5, 0, 6.3, 0.24, 0.4, 0x8097a5);
      const bar = this.box(group, 0, 4.67, 0, 4.7, 0.07, 0.25, 0xffc675, 1.5);
      this.gates.push(bar); this.root.add(group);
      this.cylinder(this.root, p.x, -3.5, p.z, 1.5, 7, 0x192a40, 8);
    });
    this.cylinder(this.root, 0, -5, 0, 7, 4, 0x182a41, 8);
    const beacon = this.ring(this.root, 0, 12, 0, 6, 0xffc16c, 0.008); beacon.rotation.x = Math.PI / 2;
    this.animated.push({ object: beacon, kind: "orbit", phase: 1 });
  }
  private buildRelic() {
    RELIC_ISLANDS.forEach((p, i) => {
      this.cylinder(this.root, p.x, -0.45, p.z, p.r, 0.9, i === 8 ? 0xa0a9bc : 0x6d8b85, 12);
      this.cylinder(this.root, p.x, -0.02, p.z, p.r * 0.98, 0.04, i === 8 ? 0x809eab : 0x8cba96, 12);
      const stone = new T.Mesh(this.geometries("floating-rock", () => new T.ConeGeometry(1, 1, 7)), this.material(0x314f65));
      stone.position.set(p.x, -2.5, p.z); stone.scale.set(p.r * 0.9, 4.5, p.r * 0.9); stone.rotation.z = Math.PI; this.root.add(stone);
      const ring = this.ring(this.root, p.x, -0.7, p.z, p.r * 0.9, 0xbca5ff, 0.012); ring.rotation.x = -Math.PI / 2;
      for (let j = 0; j < 7; j++) {
        const a = j * 2.4 + i, r = p.r * 0.74;
        const crystal = new T.Mesh(this.geometries("grass-crystal", () => new T.ConeGeometry(0.1, 0.65, 4)), this.material(j % 2 ? 0xbcb4ed : 0xd2e8b9, 0.3));
        crystal.position.set(p.x + Math.cos(a) * r, 0.3, p.z + Math.sin(a) * r); this.root.add(crystal);
      }
    });
    RELICS.forEach((p, i) => {
      const group = new T.Group(); group.position.set(p.x, 1.3, p.z);
      const shard = new T.Mesh(this.geometries("shard", () => new T.OctahedronGeometry(0.5, 0)), this.material(0xd3b8ff, 1.5)); group.add(shard);
      const ring = this.ring(group, 0, 0, 0, 0.85, 0xf0d3ff, 0.025); ring.rotation.x = Math.PI / 2;
      this.root.add(group); this.shards.push(group); this.animated.push({ object: group, kind: "shard", phase: i });
    });
    const goal = this.ring(this.root, 0, 0.07, 0, 2.1, 0xffd48b, 0.025); goal.rotation.x = Math.PI / 2;
    const orb = new T.Mesh(this.geometries("archive-core", () => new T.IcosahedronGeometry(0.7, 1)), this.material(0xe5d5fb, 1));
    orb.position.y = 3; this.root.add(orb); this.animated.push({ object: orb, kind: "core", phase: 1 });
  }
  private backdrop(world: NexusWorld) {
    const palette = world === "relic" ? [0x132b4a, 0x493f7c, 0xaab6ca] : [0x142638, 0x31485b, 0x778c9b];
    for (let i = 0; i < 54; i++) {
      const a = i / 54 * Math.PI * 2, r = 47 + Math.sin(i * 5.1) * 8, h = 8 + ((i * 19) % 23);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const building = new T.Group(); building.position.set(x, -10, z); building.rotation.y = a + Math.PI;
      this.box(building, 0, h / 2, 0, 2.5 + i % 4, h, 3 + i % 3, palette[i % 3]);
      this.box(building, 0, h + 0.5, 0, 1.8, 1, 2, 0x304759);
      this.cylinder(building, 0.6, h + 2.1, -0.3, 0.045, 3.2, 0x869cad, 6);
      this.box(building, 0.6, h + 3.8, -0.3, 0.13, 0.12, 0.13, 0xffbd84, 1.3);
      if (i % 3 === 0) {
        this.box(building, -0.8, h * 0.7, 1.68, 0.35, 4, 0.08, i % 2 ? 0xb592da : 0x75d9dd, 0.7);
        this.box(building, 0, h * 0.35, 2, 2.3, 0.35, 1.2, 0x516b7e);
      }
      for (let j = 2; j < h - 1; j += 2.3) {
        this.box(building, -0.55, j, 1.55 + (i % 3) * 0.5, 0.85, 0.18, 0.04, i % 3 ? 0x6ab6ca : 0xffbe83, 0.9);
        this.box(building, 0.65, j, 1.55 + (i % 3) * 0.5, 0.65, 0.18, 0.04, i % 3 ? 0x6ab6ca : 0xffbe83, 0.9);
      }
      this.root.add(building);
    }
    for (let i = 0; i < 4; i++) {
      const object = new T.Mesh(this.geometries("distant-world", () => new T.IcosahedronGeometry(1, 2)), this.material(i % 2 ? 0x5c6a9c : 0x498d99, 0.06));
      object.position.set(-75 + i * 42, 28 + i % 2 * 13, -100 - i * 5); object.scale.setScalar(9 + i * 2); this.root.add(object);
    }
    for (let i = 0; i < 65; i++) {
      const a = i * 2.3999, r = 120 + i % 4 * 15;
      this.sphere(this.root, Math.cos(a) * r, 25 + i * 1.9, Math.sin(a) * r, 0.08 + i % 3 * 0.04, this.material(0xc0dfeb, 1.4));
    }
    for (let i = 0; i < 5; i++) {
      const traffic = new T.Group();
      this.box(traffic, 0, 0, 0, 0.8, 0.45, 2.2, 0xb2bdc0);
      this.box(traffic, 0, 0.35, 0.2, 0.65, 0.35, 0.85, 0x1c3d55);
      this.box(traffic, 0, 0, -1.15, 0.55, 0.14, 0.08, 0x86e4e6, 1.8);
      for (const side of [-1, 1]) this.box(traffic, side * 0.7, -0.05, -0.1, 0.8, 0.1, 1, 0x586e81);
      this.root.add(traffic); this.animated.push({ object: traffic, kind: "traffic", phase: i * 1.3 });
    }
  }
  /** Static meshes with shared materials become one draw call per material. Portals retain animation. */
  private batch() {
    const groups = new Map<string, T.Mesh[]>();
    const animated = new Set<T.Object3D>();
    for (const item of this.animated) item.object.traverse(o => animated.add(o));
    this.portals.traverse(o => animated.add(o));
    this.gates.forEach(o => animated.add(o));
    this.root.updateMatrixWorld(true);
    this.root.traverse(o => {
      if (!(o instanceof T.Mesh) || animated.has(o) || !o.castShadow) return;
      const key = `${o.geometry.uuid}:${(o.material as T.Material).uuid}`;
      if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(o);
    });
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const instance = new T.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
      instance.castShadow = true; instance.receiveShadow = true;
      meshes.forEach((mesh, i) => { instance.setMatrixAt(i, mesh.matrixWorld); mesh.removeFromParent(); });
      instance.computeBoundingSphere(); this.root.add(instance);
    }
  }
  update(actor: NexusActor, time: number) {
    for (const a of this.animated) {
      if (a.kind === "core") { a.object.rotation.y = time * 0.3; a.object.rotation.z = Math.sin(time * 0.35) * 0.15; }
      if (a.kind === "orbit") a.object.rotation.y = time * 0.13;
      if (a.kind === "portal") a.object.rotation.z = time * (0.12 + a.phase * 0.002);
      if (a.kind === "veil") (a.object as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>).material.opacity = 0.17 + Math.sin(time * 1.5 + a.phase) * 0.05;
      if (a.kind === "shard") { a.object.position.y = 1.3 + Math.sin(time * 1.8 + a.phase) * 0.22; a.object.rotation.y = time * 0.7; }
      if (a.kind === "traffic") {
        const t = time * 0.045 + a.phase;
        a.object.position.set(Math.sin(t) * 37, 7 + Math.sin(t * 2) + a.phase, Math.cos(t) * 37);
        a.object.rotation.y = Math.PI / 2 + t;
      }
    }
    this.shards.forEach((p, i) => p.visible = !(actor.collected & (1 << i)));
    this.gates.forEach((p, i) => p.material = this.material(i < actor.checkpoint ? 0x4b8a9a : i === actor.checkpoint ? 0xffca72 : 0x667b94, i === actor.checkpoint ? 2 : 0.3));
  }
  avatar(actor: NexusActor) { return new NexusAvatar(this, actor); }
  sphere(parent: T.Object3D, x: number, y: number, z: number, size: number, material: T.Material, visor = false) {
    const geometry = this.geometries(visor ? "visor" : "sphere", () => new T.SphereGeometry(1, 20, 12, 0, visor ? Math.PI : Math.PI * 2));
    const mesh = new T.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.setScalar(size); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  dispose() {
    this.root.traverse(o => { if (o instanceof T.InstancedMesh) o.dispose(); if (o instanceof T.Mesh && o.material instanceof T.MeshBasicMaterial) o.material.dispose(); });
    for (const g of this.geometry.values()) g.dispose(); for (const m of this.materials.values()) m.dispose();
    this.root.clear();
  }
}
export class NexusAvatar {
  readonly root = new T.Group();
  private model = new T.Group();
  private arms: T.Group[] = [];
  private legs: T.Group[] = [];
  private board = new T.Group();
  private signature = "";
  constructor(private view: NexusWorldView, actor: NexusActor) { this.root.add(this.model, this.board); this.rebuild(actor); }
  rebuild(actor: NexusActor) {
    const key = `${actor.color}:${actor.outfit}:${actor.world}`; if (key === this.signature) return; this.signature = key;
    this.model.clear(); this.board.clear(); this.arms = []; this.legs = [];
    const k = this.view, c = NEXUS_COLORS[actor.color], armor = actor.outfit === "sentinel", suit = actor.outfit === "runner" ? 0x25354c : 0xd9e0df;
    k.box(this.model, 0, 0.98, 0, armor ? 0.62 : 0.48, 0.62, 0.32, suit);
    k.box(this.model, 0, 0.99, 0.18, 0.28, 0.28, 0.05, 0x314758);
    k.box(this.model, 0, 1.05, 0.22, 0.17, 0.035, 0.025, c, 1.2);
    k.sphere(this.model, 0, 1.57, 0, 0.34, k.material(suit));
    k.sphere(this.model, 0, 1.57, 0.014, 0.345, k.material(0x152d42, 0.1, 0.8), true);
    k.box(this.model, 0, 1.47, 0.327, 0.35, 0.025, 0.03, c, 1.4);
    k.box(this.model, 0, 1.02, -0.25, 0.35, 0.44, 0.2, 0x3e5060);
    for (const s of [-1, 1]) {
      const arm = new T.Group(); arm.position.set(s * (armor ? 0.42 : 0.35), 1.22, 0);
      k.box(arm, 0, -0.18, 0, armor ? 0.24 : 0.16, 0.39, 0.21, suit);
      k.box(arm, 0, -0.4, 0.03, 0.17, 0.17, 0.22, 0x27394a);
      k.box(arm, 0, -0.06, 0.12, armor ? 0.24 : 0.15, 0.07, 0.03, c, 0.7);
      this.model.add(arm); this.arms.push(arm);
      const leg = new T.Group(); leg.position.set(s * 0.14, 0.65, 0);
      k.box(leg, 0, -0.23, 0, 0.2, 0.44, 0.22, suit);
      k.box(leg, 0, -0.53, 0.05, 0.23, 0.17, 0.36, 0x26384b);
      k.box(leg, 0, -0.22, 0.13, 0.14, 0.07, 0.03, c, 0.4);
      this.model.add(leg); this.legs.push(leg);
    }
    if (actor.outfit === "sentinel") for (const s of [-1, 1]) k.box(this.model, s * 0.3, 1.3, 0, 0.25, 0.16, 0.38, 0x7b8f9d);
    k.box(this.board, 0, -0.02, 0, 0.65, 0.12, 1.7, 0x273649);
    for (const s of [-1, 1]) k.box(this.board, s * 0.34, -0.03, 0, 0.04, 0.06, 1.45, c, 2);
    k.box(this.board, 0, -0.09, -0.77, 0.42, 0.06, 0.07, c, 2);
    this.board.visible = actor.world === "race";
  }
  animate(actor: NexusActor, time: number) {
    this.rebuild(actor);
    const speed = Math.hypot(actor.vx, actor.vz), race = actor.world === "race", dance = actor.emote === "dance" && Date.now() - actor.emoteAt < 3500;
    this.model.position.y = race ? 0.5 + Math.sin(time * 5) * 0.055 : 0;
    this.board.position.y = race ? 0.45 + Math.sin(time * 5) * 0.055 : 0;
    this.model.rotation.x = race ? 0.12 : 0;
    this.model.rotation.z = dance ? Math.sin(time * 8) * 0.15 : 0;
    this.legs.forEach((leg, i) => leg.rotation.x = race ? -0.13 : Math.sin(time * 10) * Math.min(speed * 0.1, 0.6) * (i ? 1 : -1));
    this.arms.forEach((arm, i) => {
      arm.rotation.x = race ? -0.45 : Math.sin(time * 10) * Math.min(speed * 0.07, 0.4) * (i ? -1 : 1);
      arm.rotation.z = dance ? Math.sin(time * 8) * 0.6 * (i ? -1 : 1) : 0;
      if (i === 1 && Date.now() - actor.emoteAt < 3000 && actor.emote && actor.emote !== "dance") { arm.rotation.x = -2.3; arm.rotation.z = Math.sin(time * 9) * 0.3; }
    });
  }
}
