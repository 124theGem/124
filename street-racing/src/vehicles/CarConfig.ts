/** SI units. Local +x is forward; +y is left. World uses X/Z. */
export const DEFAULT_CAR = {
  mass: 1250, inertia: 1850, wheelbase: 2.6, frontAxle: 1.2, rearAxle: 1.4,
  cgHeight: 0.48, length: 4.35, width: 1.86, wheelRadius: 0.34,
  engineForce: 6900, power: 145000, reverseForce: 3200, reverseMaxSpeed: 9,
  brakeForce: 14000, handbrakeForce: 5600, airDrag: 0.58, rolling: 165,
  maxSpeed: 50, maxSteer: 36 * Math.PI / 180, steeringRate: 6.5,
  frontStiffness: 112000, rearStiffness: 134000,
  asphaltGrip: 2.6, grassGrip: 0.85, shoulderGrip: 1.25,
  handbrakeGrip: 0.42, gripRecovery: 1.4, restitution: 0.12,
  // Arcade steering stays inside the normal tire budget; the handbrake opens it up.
  corneringMargin: 0.95, driftSteeringMultiplier: 1.8, minimumSteer: 0.022,
  stabilityAssist: 14, driftStabilityAssist: 10, maxAssistAcceleration: 20,
  maxDriftYawRate: 1.1, recoveryAlignment: 6,
  fixedStep: 1 / 60,
} as const;

export type CarSettings = { -readonly [K in keyof typeof DEFAULT_CAR]: number };
/** Loaded once from car-config.json before constructing the game and car meshes. */
export const CAR: CarSettings = { ...DEFAULT_CAR };
