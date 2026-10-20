import { describe, it, expect } from "vitest";
import {
  newGame,
  applyAction,
  parseSave,
  gardenBeds,
  walkable,
} from "../shared/model";
import { prologueActions } from "./fixtures";
import { STORY_PLANTS } from "../shared/prologue";
import { sphereCoordinates, sphereRadius } from "../shared/sphere";
import { cubeNormal, MAX_TERRAIN_HEIGHT } from "../shared/voxel";
import { BUILDINGS } from "../shared/catalog";
import { Models } from "../src/world/Models";
import { ObservationScene } from "../src/world/ObservationScene";

describe("First Light introduction, optics and gardens", () => {
  it("starts real new players with a house, broken starter ship and no unlocked routes", () => {
    const s = newGame(1000, true, true);
    expect(s.prologue.phase).toBe("arrival");
    expect(s.discovered).toEqual(["home"]);
    expect(s.worlds.home.buildings[0].kind).toBe("headquarters");
    expect(s.worlds.home.launchPad?.shipId).toBe("starter");
    expect(STORY_PLANTS).toHaveLength(3);
    expect(() => applyAction(s, { type: "boardShip" }, 1000)).toThrow(
      "восстановите",
    );
    expect(() =>
      applyAction(s, { type: "story", step: "repair" }, 1000),
    ).toThrow("предыдущий");
  });
  it("requires three distinct plants, actual meteor iron and paid repairs even in test mode, saving every stage", () => {
    let s = newGame(1000, true, true);
    const wood = s.inventory.wood;
    for (const a of prologueActions()) {
      s = applyAction(s, a, 1000);
      s = parseSave(JSON.stringify(s));
      if (a.type === "story" && a.step === "plant")
        expect(() => applyAction(s, a, 1000)).toThrow();
      if (a.type === "story" && a.step === "meteor")
        expect(s.inventory.iron).toBe(3);
      if (a.type === "story" && a.step === "repair") {
        expect(s.inventory.iron).toBe(0);
        expect(s.inventory["engine:fiber"]).toBe(0);
      }
    }
    expect(s.inventory.wood).toBe(wood);
    expect(s.prologue.phase).toBe("complete");
    expect(s.discovered).toHaveLength(5);
    expect(applyAction(s, { type: "boardShip" }, 1000).flight).not.toBeNull();
  });
  it("preserves current-generation progress and rejects remote quest collection", () => {
    const old: any = newGame(1000, true);
    delete old.prologue;
    delete old.inventory["tool:cultivator"];
    expect(parseSave(JSON.stringify(old)).prologue.phase).toBe("complete");
    expect(parseSave(JSON.stringify(old)).inventory["tool:cultivator"]).toBe(1);
    let s = newGame(1000, true, true);
    s = applyAction(s, { type: "story", step: "begin" }, 1000);
    s.position = { x: 35, z: 10 };
    expect(() =>
      applyAction(s, { type: "story", step: "plant", index: 0 }, 1000),
    ).toThrow();
  });
  it("cultivates, plants, harvests and reloads new beds on different cube faces", () => {
    for (const normal of [
      cubeNormal(0, 0.2, 0.1),
      cubeNormal(2, 0.2, 0.2),
      cubeNormal(5, 0.2, 0.2),
    ]) {
      let s = newGame(1000, true);
      s.position = sphereCoordinates(normal, "home");
      const at = { x: Math.round(s.position.x), z: Math.round(s.position.z) };
      s.position = at;
      expect(() => applyAction(s, { type: "cultivate", ...at }, 1000)).toThrow(
        "культиватор",
      );
      s = applyAction(s, { type: "hand", item: "cultivator" }, 1000);
      s = applyAction(s, { type: "cultivate", ...at }, 1000);
      expect(gardenBeds(s, "home")).toContainEqual(at);
      expect(() => applyAction(s, { type: "cultivate", ...at }, 1000)).toThrow(
        "уже",
      );
      s = applyAction(s, { type: "plant", ...at, plant: "carrot" }, 1000);
      s = parseSave(JSON.stringify(s));
      s = applyAction(s, { type: "harvest", ...at }, 17000);
      expect(s.inventory["crop:carrot"]).toBe(3);
      expect(s.worlds.home.gardens).toContainEqual(at);
    }
  });
  it.each(["wood", "stone", "energy"] as const)(
    "places, saves, blocks passage and removes a %s fence",
    (kind) => {
      let s = newGame(1000, true);
      s.position = { x: 6, z: 7 };
      s = applyAction(
        s,
        { type: "fence", kind, x: 7, z: 7, rotation: 1 },
        1000,
      );
      s = parseSave(JSON.stringify(s));
      expect(s.worlds.home.fences[0]).toMatchObject({ kind, rotation: 1 });
      expect(walkable(s, "home", 7, 7)).toBe(false);
      expect(() =>
        applyAction(s, { type: "fence", kind, x: 7, z: 7, rotation: 0 }, 1000),
      ).toThrow();
      s = applyAction(s, { type: "removeFence", index: 0 }, 1000);
      expect(s.worlds.home.fences).toEqual([]);
    },
  );
  it("constructs a real telescope and observes the target without changing saves or world scene roots", () => {
    let s = newGame(1000, true);
    s.position = { x: 6, z: 7 };
    s = applyAction(
      s,
      { type: "build", kind: "telescope", ...s.position, rotation: 0 },
      1000,
    );
    s = parseSave(JSON.stringify(s));
    expect(s.worlds.home.buildings.at(-1)?.kind).toBe("telescope");
    expect(BUILDINGS.telescope.size).toBe(3);
    const before = JSON.stringify(s),
      k = new Models(),
      scene = new ObservationScene(k, s, "listoria");
    scene.update(1, 1.5);
    const p = scene.camera.position.clone();
    scene.rotate(200, 400);
    scene.magnify(0.7);
    scene.update(1, 1.5);
    expect(scene.camera.position.distanceTo(p)).toBeGreaterThan(1);
    scene.magnify(0.001);
    scene.rotate(300, 500);
    scene.update(1, 1.5);
    const camera = scene.camera.position;
    expect(
      Math.max(Math.abs(camera.x), Math.abs(camera.y), Math.abs(camera.z)),
    ).toBeGreaterThan(sphereRadius("listoria") + MAX_TERRAIN_HEIGHT);
    expect(JSON.stringify(s)).toBe(before);
    scene.dispose();
    k.dispose();
  });
});
