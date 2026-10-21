import * as T from "three";
import type { Models } from "./Models";
import { planetSize, type PlanetId } from "../../shared/catalog";
import { drillSize } from "../../shared/sector";
import { starterShip, type Starship } from "../../shared/ships";
export function industrialBuilding(
  k: Models,
  kind: string,
  planet: PlanetId,
  level = 1,
) {
  const g = new T.Group(),
    ivory = 0xc8d2ce,
    dark = 0x293d4b,
    metal = 0x637e88,
    light = 0x6fe0ea;
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c = ivory,
    glow = false,
    alpha = 1,
  ) => k.box(g, x, y, z, w, h, d, c, glow, alpha);
  if (kind === "telescope") {
    box(0, 0.15, 0, 3, 0.3, 3, dark);
    box(0, 0.75, 0, 2.3, 1, 2.1);
    for (const side of [-1, 1]) {
      box(side * 1.1, 1.45, 0, 0.22, 1.3, 0.4, metal);
      box(side * 1.45, 0.6, 0, 0.35, 0.12, 2.5, 0x374e60);
      for (let i = -2; i <= 2; i++)
        box(side * 1.45, 0.68, i * 0.45, 0.3, 0.03, 0.3, 0x73c7de, true);
    }
    const tube = new T.Group();
    tube.position.set(0, 1.9, 0);
    tube.rotation.x = -0.55;
    k.box(tube, 0, 0, 0, 1.05, 1.05, 2.6, ivory);
    k.box(tube, 0, 0, 1.34, 1.12, 1.12, 0.14, dark);
    k.box(tube, 0, 0, 1.43, 0.84, 0.84, 0.04, light, true);
    for (const z of [-0.9, 0.7]) k.box(tube, 0, 0, z, 1.18, 1.18, 0.1, metal);
    g.add(tube);
    box(0.5, 0.8, -1.1, 0.7, 0.45, 0.15, dark);
    box(0.5, 0.84, -1.2, 0.5, 0.24, 0.04, light, true);
  } else if (kind === "planetdrill") {
    const width = drillSize(level, planetSize(planet)),
      height = [0, 5.8, 8, 12, 17, 23][level],
      half = width / 2;
    // Suspended, bevelled industrial superstructure, inspired by a planetary resource harvester.
    for (let j = 0; j < 7; j++) {
      const f = j / 6;
      box(
        0,
        height * 0.42 + j * height * 0.065,
        0,
        width * (0.48 + 0.52 * f),
        height * 0.075,
        width * (0.42 + 0.45 * f),
        j % 2 ? metal : ivory,
      );
    }
    box(0, height * 0.89, 0, width * 1.03, height * 0.055, width * 0.9, dark);
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        box(
          x * half * 0.74,
          height * 0.48,
          z * half * 0.62,
          width * 0.1,
          height * 0.88,
          width * 0.12,
          metal,
        );
        box(
          x * half * 0.74,
          0.16,
          z * half * 0.62,
          width * 0.22,
          0.3,
          width * 0.25,
          ivory,
        );
        for (let i = 0; i < level + 3; i++)
          box(
            x * half * 0.77,
            height * (0.4 + i * 0.06),
            z * half * 0.78,
            width * 0.11,
            0.09,
            width * 0.06,
            light,
            true,
          );
      }
    box(0, height * 0.29, 0, width * 0.32, 0.25, width * 0.3, dark);
    box(
      0,
      height * 0.16,
      0,
      width * 0.08,
      height * 0.27,
      width * 0.08,
      light,
      true,
      0.42,
    );
    for (let i = 0; i < level * 4 + 8; i++) {
      const x = -width * 0.4 + (i / (level * 4 + 7)) * width * 0.8;
      box(x, height * 0.74, half * 0.45, 0.07, height * 0.25, 0.14, dark);
    }
    for (let i = 0; i < level; i++)
      for (const sign of [-1, 1]) {
        box(
          sign * width * 0.24,
          height * 0.94,
          -width * 0.25 + i * 0.35,
          width * 0.18,
          0.18,
          0.24,
          metal,
        );
        box(
          sign * width * 0.24,
          height * 0.99,
          -width * 0.25 + i * 0.35,
          width * 0.14,
          0.05,
          0.17,
          light,
          true,
        );
      }
    // Service deck stays readable from the planetary overview as well as from below.
    box(0, height * 0.93, 0, width * 0.12, height * 0.05, width * 0.68, ivory);
    for (let i = 0; i <= level; i++) {
      const z = -width * 0.28 + (i / level) * width * 0.56;
      for (const sign of [-1, 1]) {
        const x = sign * width * 0.26;
        box(
          x,
          height * 0.94,
          z,
          width * 0.19,
          height * 0.055,
          width * 0.09,
          metal,
        );
        box(x, height * 0.975, z, width * 0.15, 0.08, width * 0.065, ivory);
        box(
          sign * width * 0.13,
          height * 0.93,
          z,
          width * 0.15,
          0.08,
          0.08,
          light,
          true,
        );
        for (let rib = 0; rib < 3; rib++)
          box(
            x + (rib - 1) * width * 0.045,
            height * 0.98,
            z,
            0.04,
            0.04,
            width * 0.06,
            dark,
          );
      }
      box(0, height * 0.968, z, width * 0.06, 0.06, width * 0.04, light, true);
    }
    g.userData.width = width;
    g.userData.height = height;
  } else if (kind === "scanner") {
    const scale = 1 + (level - 1) * 0.11;
    box(0, 0.16, 0, 3.5, 0.3, 3.5, metal);
    box(0, 0.8, 0, 2.6, 1.3, 2.6, ivory);
    box(0, 1.5, 0, 3, 0.18, 3, dark);
    box(0, 2.2, 0, 0.5, 1.5, 0.5, metal);
    const dish = new T.Group();
    dish.position.set(0, 3, 0);
    dish.rotation.z = 0.55;
    g.add(dish);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.box(
        dish,
        Math.cos(a),
        0.2,
        Math.sin(a),
        0.46,
        0.12,
        0.35,
        ivory,
      ).rotation.y = -a;
    }
    k.facet(dish, 0, 0, 0, 1.15, 0.12, 1.15, metal);
    k.box(dish, 0, 0.35, 0, 0.08, 0.7, 0.08, light, true);
    for (let i = 0; i < level + 2; i++) {
      const a = (i / (level + 2)) * Math.PI * 2,
        x = Math.cos(a) * 1.28,
        z = Math.sin(a) * 1.28,
        h = 1.3 + (i % 3) * 0.55 + level * 0.08;
      box(x, 1.5 + h / 2, z, 0.07, h, 0.07, metal);
      box(x, 1.5 + h, z, 0.18, 0.12, 0.18, light, true);
      for (let j = 0; j < 2 + level / 3; j++)
        box(x, 1.7 + j * 0.3, z, 0.48, 0.045, 0.08, ivory);
    }
    for (let i = 0; i < level; i++)
      box(
        ((i % 3) - 1) * 0.65,
        0.65,
        1.38 + Math.floor(i / 3) * 0.12,
        0.5,
        0.7,
        0.35,
        i % 2 ? metal : dark,
      );
    g.scale.setScalar(scale);
  } else {
    box(0, 0.15, 0, 5, 0.3, 4.4, metal);
    for (const x of [-2.1, 2.1]) {
      box(x, 1.8, 0, 0.35, 3.3, 3.7, ivory);
      box(x, 3.6, 0, 0.55, 0.35, 4.2, metal);
      for (let i = 0; i < 5; i++)
        box(x, 1.2 + i * 0.4, 1.9, 0.4, 0.06, 0.12, light, true);
    }
    box(0, 3.65, -1.3, 4.5, 0.4, 0.6, ivory);
    box(0, 0.4, -1.2, 2.5, 0.2, 1.6, dark);
    for (let i = 0; i < 7; i++)
      box(-1.5 + i * 0.5, 0.33, 0, 0.06, 0.025, 3.6, light, true);
    box(-2.65, 0.8, 0.9, 0.6, 1.3, 1, metal);
    box(-2.65, 1.5, 0.9, 0.7, 0.12, 1.1, dark);
    box(2.45, 2.7, -0.9, 1.1, 0.18, 0.25, metal);
    box(2.9, 2, -0.9, 0.15, 1.4, 0.15, metal);
  }
  k.batch(g);
  g.userData.architecture = "orbital-industry";
  g.userData.level = level;
  return g;
}
export function modularShip(k: Models, design: Starship = starterShip()) {
  return k.ship(design);
}
