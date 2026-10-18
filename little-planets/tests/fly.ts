import { applyAction, type Save } from "../shared/model";
import { landingInfo, type PilotInput } from "../shared/space";
export const autoInput: PilotInput = {
  throttle: 0,
  turn: 0,
  pitch: 0,
  brake: false,
  boost: false,
  autopilot: true,
};
/** Exercise the same bounded, timed commands submitted by the cockpit. */
export function finishFlight(initial: Save) {
  let save = initial,
    now = Math.max(initial.updatedAt, initial.flight!.lastUpdate);
  for (let i = 0; i < 250 && !landingInfo(save.flight!).allowed; i++) {
    now += 1000;
    save = applyAction(
      save,
      {
        type: "pilot",
        commands: Array.from({ length: 10 }, () => ({
          input: autoInput,
          dt: 0.1,
        })),
      },
      now,
    );
  }
  if (!landingInfo(save.flight!).allowed)
    throw new Error(`Autopilot failed: ${JSON.stringify(save.flight)}`);
  return applyAction(save, { type: "land" }, now + 3000);
}
