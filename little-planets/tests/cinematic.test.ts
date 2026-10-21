import { describe, expect, it } from "vitest";
import { applyAction, newGame } from "../shared/model";
import { prologueActions } from "./fixtures";
import { Models } from "../src/world/Models";
import {
  ObservationScene,
  REVEAL_DURATION,
} from "../src/world/ObservationScene";
import { PrologueEffects } from "../src/world/PrologueEffects";
import * as T from "three";
import { SphereWorld, spherePoint, sphereUp } from "../src/world/SphereWorld";
import { STORY_PLANTS } from "../shared/prologue";

describe("Deep Signal cinematics", () => {
  it("lets a player select a resource by its floating beacon and removes that target after collection", () => {
    const kit = new Models();
    let save = applyAction(
      newGame(1000, true, true),
      { type: "story", step: "begin" },
      1000,
    );
    const world = new SphereWorld(kit, save, 1000);
    const at = STORY_PLANTS[0];
    const ray = new T.Ray(spherePoint(at, 7), sphereUp(at).negate());
    try {
      expect(world.pickStory(ray)).toBe(0);
      save.position = at;
      save = applyAction(
        save,
        { type: "story", step: "plant", index: 0 },
        1000,
      );
      world.rebuild(save, 1000);
      expect(world.pickStory(ray)).not.toBe(0);
    } finally {
      world.dispose();
      kit.dispose();
    }
  });
  it("shows hundreds of real worlds without unlocking their resources or moving the player", () => {
    const save = newGame(1000, true, true),
      before = JSON.stringify(save);
    const kit = new Models(),
      view = new ObservationScene(kit, save, "home", true);
    try {
      view.update(0, 1.375);
      const start = view.stats;
      expect(start.finished).toBe(false);
      view.update(REVEAL_DURATION / 2, 1.375);
      expect(view.stats.distance).toBeGreaterThan(start.distance * 30);
      expect(view.stats.finished).toBe(false);
      view.update(REVEAL_DURATION / 2, 1.375);
      expect(view.stats.finished).toBe(true);
      expect(view.stats.planetsInFrame).toBeGreaterThan(500);
      expect(view.stats.distance).toBeGreaterThan(10000);
      expect(JSON.stringify(save)).toBe(before);
    } finally {
      view.dispose();
      kit.dispose();
    }
  });
  it("removes collected resource markers and stops crash smoke after engine repair", () => {
    const effects = new PrologueEffects();
    let save = newGame(1000, true, true);
    try {
      effects.update(save);
      expect(effects.stats.smoke).toBeGreaterThan(0);
      for (const action of prologueActions()) {
        save = applyAction(save, action, 1000);
        effects.update(save);
        effects.animate(2);
        if (save.prologue.phase === "plants")
          expect(effects.stats.targets).toBe(3 - save.prologue.plants.length);
        if (
          save.prologue.phase === "meteor" ||
          save.prologue.phase === "repair"
        )
          expect(effects.stats.targets).toBe(1);
        if (save.prologue.phase === "launch") {
          expect(effects.stats.smoke).toBe(0);
          expect(effects.stats.targets).toBe(1);
        }
      }
      expect(effects.stats).toEqual({ smoke: 0, targets: 0 });
    } finally {
      effects.dispose();
    }
  });
});
