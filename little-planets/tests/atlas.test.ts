import { describe, it, expect } from "vitest";
import * as T from "three";
import { Models } from "../src/world/Models";
import { IndustrialSurface } from "../src/world/IndustrialSurface";
import { updateIndustrialLights } from "../src/world/IndustrialLighting";
import { SHIP_CLASSES, starterShip } from "../shared/ships";
import { newGame, parseSave, applyAction } from "../shared/model";
import { shipFrame } from "../shared/shipFrames";

describe("Atlas unique engineering and backwards compatible designs", () => {
  it("builds nine distinct physical layouts and preserves their exact external/cockpit design", () => {
    const kit = new Models(),
      signatures = new Set<string>();
    try {
      for (const cls of SHIP_CLASSES)
        for (const mk of [1, 2, 3] as const) {
          const design = { ...starterShip(), class: cls, model: mk },
            root = kit.ship(design),
            cabin = kit.cockpit(design);
          const box = new T.Box3().setFromObject(root).getSize(new T.Vector3());
          expect(root.userData.frame).toBe(shipFrame(design).family);
          expect(cabin.userData.frame).toBe(root.userData.frame);
          expect(root.userData.design).toEqual(cabin.userData.design);
          signatures.add(
            box
              .toArray()
              .map((n) => n.toFixed(2))
              .join(","),
          );
          expect(root.userData.anchors).toHaveLength(6);
          expect(box.z).toBeGreaterThan(3);
          expect(box.x).toBeLessThan(6);
          root.traverse((o) => {
            if (o instanceof T.InstancedMesh) o.dispose();
          });
        }
      expect(signatures.size).toBe(9);
    } finally {
      kit.dispose();
    }
  });
  it("physically connects the forward cargo landing hips to the central keel", () => {
    const kit = new Models();
    const root = kit.ship({ ...starterShip(), class: "cargo", model: 2 });
    try {
      root.updateMatrixWorld(true);
      for (const side of [-1, 1]) {
        // Cast between the narrow pressure hull and the hip; an unsupported leg leaves this empty.
        const ray = new T.Raycaster(
          new T.Vector3(side * 0.75, 1.2, 4.4 * 0.28),
          new T.Vector3(0, -1, 0),
          0,
          0.65,
        );
        expect(
          ray.intersectObject(root.getObjectByName("landing-gear")!, true)
            .length,
        ).toBeGreaterThan(0);
      }
    } finally {
      root.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      kit.dispose();
    }
  });
  it("preserves existing progress, legacy names and stats while saving a new ochre design", () => {
    let s = newGame(1000, true);
    s.progression.xp = 1234;
    s.inventory.wood = 456;
    const old = structuredClone(s.fleet);
    s.worlds.home.buildings.push({
      id: "yard",
      kind: "shipyard",
      x: 4,
      z: 5,
      rotation: 0,
    });
    s = applyAction(
      s,
      {
        type: "saveShipDesign",
        ship: { ...starterShip(), name: "Кестрел", color: "ochre" },
      },
      1500,
    );
    s = parseSave(JSON.stringify(s));
    expect(s.generation).toBe(3);
    expect(s.fleet).toEqual(old);
    expect(s.progression.xp).toBe(1234);
    expect(s.inventory.wood).toBe(456);
    expect(s.shipBlueprints[0].color).toBe("ochre");
    expect(s.freeConstruction).toBe(true);
  });
  it("keeps structural texture maps in data space and albedo in sRGB with measurable surface variation", () => {
    const p = new IndustrialSurface(128);
    try {
      expect(p.color.colorSpace).toBe(T.SRGBColorSpace);
      for (const map of [p.normal, p.roughness, p.ao, p.metalness])
        expect(map.colorSpace).toBe(T.NoColorSpace);
      expect(new Set(p.roughness.image.data).size).toBeGreaterThan(50);
      expect(new Set(p.normal.image.data).size).toBeGreaterThan(10);
    } finally {
      p.dispose();
    }
  });
  it("has different building structures and limits actual night lights by distance and graphics quality", () => {
    const kit = new Models(),
      scene = new T.Scene(),
      architectures = new Set<string>();
    for (const [i, kind] of [
      "house",
      "headquarters",
      "warehouse",
      "refinery",
      "scanner",
      "shipyard",
    ].entries()) {
      const b = kit.architecture.build(kind);
      b.position.x = i * 3;
      scene.add(b);
      architectures.add(b.userData.architecture);
    }
    const active = () => {
      let n = 0;
      scene.traverse((o) => {
        if (o instanceof T.PointLight && o.visible && o.intensity > 0) n++;
      });
      return n;
    };
    try {
      expect(architectures.size).toBe(6);
      updateIndustrialLights(scene, new T.Vector3(), 0, "high", 1);
      expect(active()).toBe(4);
      updateIndustrialLights(scene, new T.Vector3(), 0, "balanced", 2);
      expect(active()).toBe(2);
      updateIndustrialLights(scene, new T.Vector3(), 0, "economy", 3);
      expect(active()).toBe(0);
      updateIndustrialLights(scene, new T.Vector3(), 1, "high", 4);
      expect(active()).toBe(0);
      updateIndustrialLights(scene, new T.Vector3(1000, 0, 0), 0, "high", 5);
      expect(active()).toBe(0);
    } finally {
      kit.dispose();
    }
  });
});
