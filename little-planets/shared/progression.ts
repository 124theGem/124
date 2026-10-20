export const SKILLS = {
  farming: "Садоводство",
  mining: "Добыча",
  combat: "Боевой опыт",
} as const;
export type Skill = keyof typeof SKILLS;
export interface Progression {
  xp: number;
  skills: Record<Skill, number>;
}
export const freshProgression = (): Progression => ({
  xp: 0,
  skills: { farming: 0, mining: 0, combat: 0 },
});
export function experienceLevel(xp: number) {
  return Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / 100)) / 2);
}
export function levelFloor(level: number) {
  return (100 * level * (level - 1)) / 2;
}
export function skillPoints(p: Progression) {
  return (
    experienceLevel(p.xp) -
    1 -
    Object.values(p.skills).reduce((a, b) => a + b, 0)
  );
}
export function gainExperience(
  save: { progression: Progression },
  amount: number,
) {
  save.progression.xp = Math.min(
    1000000000,
    save.progression.xp + Math.max(0, Math.floor(amount)),
  );
}
