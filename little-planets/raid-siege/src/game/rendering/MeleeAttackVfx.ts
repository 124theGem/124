import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Entity, GameEvent, MatchState } from '../core/types';
import { basicAttackSpec } from '../controls/aim';

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;
const FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform float progress;
uniform float arcAngle;
uniform float swingSign;
uniform float weight;
uniform float thrust;
uniform vec3 tint;

float line(float distanceToLine, float width, float feather) {
  return 1.0 - smoothstep(width, width + feather, abs(distanceToLine));
}
void main(void) {
  vec2 p = vec2(vUV.x - 0.5, 0.5 - vUV.y) * 2.0;
  float t = clamp(progress, 0.0, 1.0);
  float sweep = smoothstep(0.0, 0.83, t);
  float envelope = smoothstep(0.0, 0.065, t) * (1.0 - smoothstep(0.63, 1.0, t));
  float body = 0.0;
  float core = 0.0;
  float glow = 0.0;
  float filaments = 0.0;
  float sparks = 0.0;
  if (thrust < 0.5) {
    float a = atan(p.x, p.y) * swingSign;
    float halfArc = arcAngle * 0.5;
    float head = mix(-halfArc, halfArc + 0.28, sweep);
    float tailLength = mix(0.35, 1.85, smoothstep(0.0, 0.32, t));
    float behind = head - a;
    float u = clamp(behind / tailLength, 0.0, 1.0);
    float angular = smoothstep(-0.045, 0.025, behind) * (1.0 - smoothstep(0.65, 1.0, u));
    float coneTaper = 1.0 - smoothstep(halfArc - 0.2, halfArc, abs(a));
    angular *= coneTaper;
    float r = length(p);
    float rim = 0.855 + 0.025 * sin(a * 2.7 + t * 2.0);
    float taper = pow(1.0 - u, 0.65);
    float frontTaper = smoothstep(0.0, 0.17, behind);
    float width = (0.003 + 0.13 * taper * frontTaper) * weight * coneTaper;
    body = line(r - (rim - width * 0.6), width, 0.025) * angular;
    core = line(r - rim, (0.003 + 0.012 * taper * frontTaper) * coneTaper, 0.01) * angular;
    float headGlow = exp(-behind * behind * 65.0);
    core = max(core, line(r - (rim - width * 0.25), width * 0.3, 0.015) * headGlow * angular);
    glow = exp(-abs(r - (rim - width * 0.25)) * 16.0) * angular * 0.4;
    filaments = (line(r - rim - 0.045, 0.003, 0.009) + line(r - rim + width * 1.6, 0.003, 0.007) + line(r - rim + width * 2.2 + 0.015 * sin(behind * 6.0), 0.002, 0.007)) * angular * frontTaper * (1.0 - u) * 0.65;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float sa = (head - 0.1 - fi * 0.15) * swingSign;
      vec2 center = vec2(sin(sa), cos(sa)) * (rim + 0.06 + fi * 0.018);
      vec2 q = p - center;
      float diamond = abs(q.x + q.y * 0.4) + abs(q.y) * 1.8;
      sparks += (1.0 - smoothstep(0.008, 0.027, diamond)) * (1.0 - fi * 0.22);
    }
    sparks *= 1.0 - smoothstep(0.55, 0.9, t);
  } else {
    // A spear stays in its real narrow lane instead of claiming a cone-shaped hit.
    float head = mix(0.22, 0.91, smoothstep(0.0, 0.52, t));
    float behind = head - p.y;
    float trail = smoothstep(-0.035, 0.02, behind) * (1.0 - smoothstep(0.25, 0.7, behind));
    float width = mix(0.07, 0.005, clamp(behind / 0.7, 0.0, 1.0)) * smoothstep(-0.01, 0.1, behind);
    body = line(p.x, width, 0.02) * trail;
    core = line(p.x, 0.008, 0.012) * trail;
    glow = exp(-abs(p.x) * 24.0) * trail * 0.45;
    float blade = abs(p.x) * 1.6 + abs(p.y - head) * 0.55;
    core = max(core, 1.0 - smoothstep(0.018, 0.04, blade));
    filaments = line(abs(p.x) - 0.1, 0.002, 0.01) * trail * 0.5;
  }
  float alpha = clamp(body * 0.9 + core + glow + filaments + sparks, 0.0, 1.0) * envelope;
  if (alpha < 0.005) discard;
  vec3 violet = mix(vec3(0.25, 0.025, 0.63), tint, clamp(body + glow, 0.0, 1.0));
  vec3 color = mix(violet, vec3(1.0, 0.94, 1.0), clamp(core + sparks + filaments * 0.7, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha);
}`;

interface Swing {
  mesh: Mesh;
  material: ShaderMaterial;
  sourceId: string;
  start: number;
  life: number;
  active: boolean;
}

/** Original violet/white blade trails inspired by the uploaded sword-arc reference. */
export class MeleeAttackVfx {
  private slots: Swing[] = [];
  private cursor = 0;
  private template: Mesh;
  constructor(private scene: Scene) {
    this.template = MeshBuilder.CreatePlane('melee-arc-template', { size: 1 }, scene);
    this.template.setEnabled(false);
    this.template.isPickable = false;
    // Allocate once. Three-charge bursts and rapid replays never allocate new GPU resources.
    for (let i = 0; i < 32; i++) {
      const material = new ShaderMaterial(
        `melee-arc-${i}`,
        scene,
        { vertexSource: VERTEX, fragmentSource: FRAGMENT },
        {
          attributes: ['position', 'uv'],
          uniforms: [
            'worldViewProjection',
            'progress',
            'arcAngle',
            'swingSign',
            'weight',
            'thrust',
            'tint',
          ],
          needAlphaBlending: true,
        },
      );
      material.backFaceCulling = false;
      material.disableDepthWrite = true;
      material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      material.setFloat('progress', 0);
      const mesh = this.template.clone(`melee-blade-trail-${i}`)!;
      mesh.material = material;
      mesh.rotation.x = -Math.PI / 2;
      this.slots.push({ mesh, material, sourceId: '', start: 0, life: 1, active: false });
    }
  }
  prepare() {
    return this.slots[0].material.forceCompilationAsync(this.slots[0].mesh);
  }
  play(source: Entity, event: GameEvent, time: number) {
    const spec = basicAttackSpec(source);
    const cadence = event.duration ?? source.interval;
    const sequence = event.attackSequence ?? source.combo;
    const sign = sequence % 2 ? 1 : -1;
    const dual = source.classId === 'assassin' || source.classId === 'duelist';
    const weight = source.classId === 'berserker' ? 1.25 : dual ? 0.7 : 1;
    this.start(
      source,
      event,
      time,
      cadence * 0.84,
      spec.arc,
      spec.shape === 'line',
      sign,
      weight,
      1,
    );
    if (dual)
      this.start(
        source,
        event,
        time + cadence * 0.13,
        cadence * 0.72,
        spec.arc,
        false,
        -sign,
        0.5,
        0.88,
      );
  }
  private start(
    source: Entity,
    event: GameEvent,
    time: number,
    life: number,
    arc: number,
    thrust: boolean,
    sign: number,
    weight: number,
    size: number,
  ) {
    const slot = this.slots[this.cursor++ % this.slots.length];
    slot.active = true;
    slot.sourceId = source.id;
    slot.start = time;
    slot.life = Math.max(0.12, Math.min(0.55, life));
    slot.mesh.setEnabled(false);
    slot.mesh.position.set(source.position.x, 0.8, source.position.z);
    slot.mesh.rotation.y = event.facing ?? source.facing;
    slot.mesh.scaling.setAll((event.radius ?? source.range) * 2.12 * size);
    slot.material.setFloat('arcAngle', arc);
    slot.material.setFloat('swingSign', sign);
    slot.material.setFloat('weight', weight);
    slot.material.setFloat('thrust', thrust ? 1 : 0);
    slot.material.setColor3(
      'tint',
      Color3.FromHexString(source.classId === 'paladin' ? '#d8adff' : '#a16aff'),
    );
  }
  update(state: MatchState) {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const source = state.entities.find((e) => e.id === slot.sourceId && e.alive);
      const age = state.time - slot.start;
      if (!source || age >= slot.life) {
        slot.active = false;
        slot.mesh.setEnabled(false);
        continue;
      }
      slot.mesh.setEnabled(age >= 0);
      slot.mesh.position.set(source.position.x, 0.8, source.position.z);
      slot.material.setFloat('progress', Math.max(0, age / slot.life));
    }
  }
  get activeCount() {
    return this.slots.filter((s) => s.active).length;
  }
  clear() {
    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.setEnabled(false);
    }
  }
  dispose() {
    for (const slot of this.slots) {
      slot.mesh.dispose();
      slot.material.dispose();
    }
    this.slots = [];
    this.template.dispose();
  }
}
