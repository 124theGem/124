export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function tireForce(slip: number, stiffness: number, load: number, grip: number, longitudinal: number) {
  const limit = Math.max(1, load * grip);
  const fx = clamp(longitudinal, -limit, limit);
  const lateralLimit = Math.sqrt(Math.max(0, limit * limit - fx * fx));
  // Smooth saturation avoids a discontinuous breakaway. Combined force stays in friction circle.
  const fy = -lateralLimit * Math.tanh(stiffness * slip / Math.max(lateralLimit, 1));
  return { fx, fy, limit };
}
