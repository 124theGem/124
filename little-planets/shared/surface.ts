import { surfaceDistance } from "./sphere";
import {
  PLANETS,
  planetSize,
  ship,
  type PlanetId,
  type SphereTheme,
} from "./catalog";
export type LandmarkKind = "cave" | "waterfall" | "volcano" | "cliff";
export interface Landmark {
  id: string;
  kind: LandmarkKind;
  x: number;
  z: number;
  scale: number;
}
export const THEME_COLORS: Record<SphereTheme, number[]> = {
  meadow: [0x8db960, 0x7fa850, 0x94b56a, 0xb2ad6d, 0x6b9951],
  forest: [0x528650, 0x639451, 0x47774b, 0x7ca55d, 0x697d58],
  ice: [0xd5e5de, 0xe4ede2, 0xb8d9df, 0xc9ded8, 0x9ec2cf],
  desert: [0xd9b579, 0xe9c88d, 0xc7a06c, 0xb99063, 0xdfbd85],
  volcanic: [0x65585b, 0x514c54, 0x7a5e59, 0x8b665b, 0x5d5960],
  tropical: [0x75b2a1, 0x69a29f, 0x97bd8b, 0xd9d09b, 0x61b4b7],
  fungal: [0x746293, 0x8c72a1, 0x665b86, 0x957da8, 0x687a95],
  alpine: [0x98a18d, 0xabb1a0, 0x889186, 0xb7b7a4, 0x7b9274],
};
export function terrainSeed(n: number) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
export function landmarks(p: PlanetId): Landmark[] {
  const width = planetSize(p),
    pad = ship(p),
    theme = PLANETS[p].sphereTheme ?? "meadow",
    relative = [
      { kind: "cave", x: -8, z: 5 },
      { kind: "cliff", x: 7, z: 5 },
      { kind: theme === "volcanic" ? "volcano" : "waterfall", x: 9, z: -7 },
      { kind: "cliff", x: -12, z: -11 },
    ] as const;
  const result: Landmark[] = relative.map((v, i) => ({
    id: `landmark-${i}`,
    kind: v.kind,
    x: (pad.x + v.x + width) % width,
    z: Math.max(4, Math.min(width / 2 - 4, pad.z + v.z)),
    scale: theme === "alpine" ? 1.35 : 1,
  }));
  for (let i = 0; i < 6; i++)
    result.push({
      id: `landmark-${i + 4}`,
      kind:
        theme === "volcanic" && i % 2 === 0
          ? "volcano"
          : i % 3 === 0
            ? "cave"
            : i % 3 === 1 && theme !== "desert"
              ? "waterfall"
              : "cliff",
      x: (width * (0.08 + i * 0.173)) % width,
      z: width * (0.07 + (i % 3) * 0.16),
      scale: 0.8 + (i % 3) * 0.22,
    });
  for (const feature of result) {
    if (surfaceDistance(feature, pad, p) < 9) {
      feature.x = (feature.x + width * 0.28) % width;
      if (surfaceDistance(feature, pad, p) < 9)
        feature.x = (pad.x + width * 0.5) % width;
    }
  }
  return result;
}
