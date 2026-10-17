/** SI units. Local +x is forward; +y is left. World uses X/Z. */
export const CAR = {
  mass: 1250, inertia: 1850, wheelbase: 2.6, frontAxle: 1.2, rearAxle: 1.4,
  cgHeight: 0.48, length: 4.35, width: 1.86, wheelRadius: 0.34,
  engineForce: 6900, power: 145000, reverseForce: 3200, reverseMaxSpeed: 9,
  brakeForce: 14000, handbrakeForce: 5600, airDrag: 0.58, rolling: 165,
  maxSpeed: 50, maxSteer: 32 * Math.PI / 180, steeringRate: 2.5,
  frontStiffness: 66000, rearStiffness: 72000,
  asphaltGrip: 1.12, grassGrip: 0.56, shoulderGrip: 0.8,
  handbrakeGrip: 0.30, gripRecovery: 2.0, restitution: 0.12,
  fixedStep: 1 / 60,
} as const;
