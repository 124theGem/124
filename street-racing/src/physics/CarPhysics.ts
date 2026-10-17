import { CAR } from '../vehicles/CarConfig';
import { clamp, tireForce } from './TireForces';

export interface Input { throttle: number; brake: number; steer: number; handbrake: boolean }
export const IDLE: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
export class CarPhysics {
  x = 0; z = 0; heading = 0;
  vx = 0; vy = 0; yawRate = 0; steer = 0; acceleration = 0;
  rearGrip = 1; slipAngle = 0; frontSlip = 0; rearSlip = 0;
  frontForce = 0; rearForce = 0; longitudinalForce = 0; slipIntensity = 0;
  surface: 'asphalt' | 'shoulder' | 'grass' = 'asphalt';
  get speed() { return Math.hypot(this.vx, this.vy); }
  get worldVelocity() {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: c * this.vx - s * this.vy, z: s * this.vx + c * this.vy };
  }
  setWorldVelocity(x: number, z: number) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    this.vx = c * x + s * z; this.vy = -s * x + c * z;
  }
  reset(x: number, z: number, heading: number) {
    Object.assign(this, { x, z, heading, vx: 0, vy: 0, yawRate: 0, steer: 0, acceleration: 0,
      rearGrip: 1, slipAngle: 0, frontSlip: 0, rearSlip: 0, slipIntensity: 0 });
  }
  step(input: Input, dt: number) {
    const speed = this.speed;
    const target = clamp(input.steer, -1, 1) * CAR.maxSteer / (1 + Math.abs(this.vx) / 38);
    this.steer += clamp(target - this.steer, -CAR.steeringRate * dt, CAR.steeringRate * dt);
    const gripTarget = input.handbrake ? CAR.handbrakeGrip : 1;
    this.rearGrip += clamp(gripTarget - this.rearGrip, -7 * dt, CAR.gripRecovery * dt);
    const mu = this.surface === 'grass' ? CAR.grassGrip : this.surface === 'shoulder' ? CAR.shoulderGrip : CAR.asphaltGrip;
    const transfer = clamp(CAR.mass * this.acceleration * CAR.cgHeight / CAR.wheelbase, -2200, 2200);
    const frontLoad = CAR.mass * 9.81 * CAR.rearAxle / CAR.wheelbase - transfer;
    const rearLoad = CAR.mass * 9.81 - frontLoad;
    let drive = input.throttle * Math.min(CAR.engineForce, CAR.power / Math.max(10, Math.abs(this.vx)));
    drive *= clamp((CAR.maxSpeed - this.vx) / 4, 0, 1);
    // S brakes until almost stopped, then engages reverse. W brakes while reversing.
    let brake = input.brake * CAR.brakeForce;
    if (input.brake > 0 && this.vx < 0.7) {
      drive -= input.brake * CAR.reverseForce * clamp((CAR.reverseMaxSpeed + this.vx) / 2, 0, 1);
      brake = 0;
    }
    if (this.vx < -0.7 && input.throttle > 0) { drive = 0; brake += input.throttle * CAR.brakeForce; }
    const direction = this.vx === 0 ? 0 : Math.sign(this.vx);
    const handbrake = input.handbrake ? CAR.handbrakeForce : 0;
    const denominator = Math.max(2.5, Math.abs(this.vx));
    this.frontSlip = Math.atan2(this.vy + CAR.frontAxle * this.yawRate, denominator) - this.steer * Math.tanh(this.vx / 2);
    this.rearSlip = Math.atan2(this.vy - CAR.rearAxle * this.yawRate, denominator);
    const front = tireForce(this.frontSlip, CAR.frontStiffness, frontLoad, mu, -direction * brake * 0.65);
    const rear = tireForce(this.rearSlip, CAR.rearStiffness, rearLoad, mu * this.rearGrip, drive - direction * (brake * 0.35 + handbrake));
    const c = Math.cos(this.steer), s = Math.sin(this.steer);
    const resistance = CAR.airDrag * this.vx * Math.abs(this.vx) + Math.tanh(this.vx * 2) * CAR.rolling * (this.surface === 'grass' ? 4 : 1);
    const fx = front.fx * c - front.fy * s + rear.fx - resistance;
    const fy = front.fy * c + front.fx * s + rear.fy;
    this.frontForce = front.fy; this.rearForce = rear.fy; this.longitudinalForce = rear.fx;
    this.acceleration = fx / CAR.mass;
    // Integrate inertial velocity in world coordinates; avoids energy injection from a rotating frame.
    const velocity = this.worldVelocity;
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    velocity.x += (ch * fx - sh * fy) / CAR.mass * dt;
    velocity.z += (sh * fx + ch * fy) / CAR.mass * dt;
    this.yawRate += (CAR.frontAxle * (front.fy * c + front.fx * s) - CAR.rearAxle * rear.fy) / CAR.inertia * dt;
    this.yawRate *= Math.exp(-0.28 * dt);
    if (speed < 1.5) this.yawRate *= Math.exp(-5 * dt);
    this.heading += this.yawRate * dt;
    this.setWorldVelocity(velocity.x, velocity.z);
    if (speed < 0.15 && !input.throttle && !input.brake) { this.vx = 0; this.vy = 0; }
    this.x += velocity.x * dt; this.z += velocity.z * dt;
    this.slipAngle = Math.atan2(this.vy, Math.max(0.1, Math.abs(this.vx)));
    this.slipIntensity = speed > 3 ? clamp((Math.max(Math.abs(this.rearSlip), Math.abs(this.slipAngle)) - 0.09) / 0.5, 0, 1) : 0;
  }
}
