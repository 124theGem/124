import * as T from "three";
/** Responsive horizontal travel with bounded ascent and gravitational descent. */
export class SurfaceFollower {
  readonly position = new T.Vector3();
  private velocity = 0;
  private ready = false;
  reset(p: T.Vector3) {
    this.position.copy(p);
    this.velocity = 0;
    this.ready = true;
  }
  update(target: T.Vector3, up: T.Vector3, dt: number) {
    if (!this.ready) {
      this.reset(target);
      return this.position;
    }
    const difference = target.clone().sub(this.position),
      height = difference.dot(up);
    const horizontal = difference.addScaledVector(up, -height);
    horizontal.clampLength(0, Math.max(0.001, 8 * dt));
    this.position.add(horizontal);
    if (height > 0.002) {
      this.velocity = 0;
      this.position.addScaledVector(up, Math.min(height, 2.8 * dt));
    } else if (height < -0.002) {
      this.velocity -= 24 * dt;
      const step = Math.max(height, this.velocity * dt);
      this.position.addScaledVector(up, step);
      if (step === height) this.velocity = 0;
    } else {
      this.position.addScaledVector(up, height);
      this.velocity = 0;
    }
    return this.position;
  }
}
/** Smooth server snapshots without exposing authoritative movement as render jumps. */
export class ActorFollower {
  readonly position = new T.Vector3();
  private ready = false;
  update(target: T.Vector3, dt: number, snap = false) {
    if (!this.ready || snap) {
      this.position.copy(target);
      this.ready = true;
    } else this.position.lerp(target, 1 - Math.exp(-4 * dt));
    return this.position;
  }
}
