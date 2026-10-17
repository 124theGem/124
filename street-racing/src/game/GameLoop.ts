import { CAR } from '../vehicles/CarConfig';
export class FixedStepper {
  accumulator = 0;
  advance(elapsed: number, step: (dt: number) => void) {
    this.accumulator += Math.min(Math.max(elapsed, 0), 0.25);
    let count = 0;
    while (this.accumulator + 1e-10 >= CAR.fixedStep) {
      step(CAR.fixedStep); this.accumulator -= CAR.fixedStep; count++;
    }
    return count;
  }
  reset() { this.accumulator = 0; }
}
