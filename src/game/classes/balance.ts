import type { ClassDef, EffectKind } from '../core/types';

type Powers = Partial<Record<EffectKind, number>>;
interface HeroBalance {
  hp: number;
  attack: number;
  armor: number;
  resist: number;
  /** Original catalog ordinal, before the unused ordinary skill is removed. */
  skills: Partial<Record<number, Powers>>;
}
const profile = (
  hp: number,
  attack: number,
  skills: HeroBalance['skills'],
  armor = 0,
): HeroBalance => ({ hp, attack, armor, resist: 0, skills });

/** Brawl Stars v64.226, power 11 ratios, translated to 1/10 health units.
 * Damage is per hit/tick/mine, not the sum of every possible hit in an area.
 * Baseline armor is zero; the Guardian retains his explicit armor passive.
 */
export const HERO_BALANCE: Record<string, HeroBalance> = {
  demolitionist: profile(440, 136, { 0: { damage: 110 }, 3: { damage: 400 } }),
  guardian: profile(1340, 232, { 0: { damage: 260 }, 3: { damage: 192 } }, 16),
  berserker: profile(1000, 300, { 0: { damage: 320 }, 1: { damage: 180 }, 3: { damage: 100 } }),
  assassin: profile(760, 200, {
    0: { damage: 170, poison: 20 },
    1: { damage: 160 },
    3: { damage: 380 },
  }),
  duelist: profile(960, 260, { 0: { damage: 340 }, 3: { damage: 120 } }),
  lancer: profile(900, 250, { 0: { damage: 300 }, 1: { damage: 190 }, 3: { damage: 340 } }),
  archer: profile(460, 300, { 0: { damage: 340 }, 1: { damage: 180 }, 3: { damage: 90 } }),
  crossbow: profile(560, 260, { 0: { damage: 360 }, 1: { damage: 280 }, 3: { damage: 520 } }),
  firemage: profile(560, 220, {
    0: { damage: 240, burn: 12 },
    1: { burn: 16 },
    3: { damage: 380, burn: 18 },
  }),
  icemage: profile(640, 200, { 0: { damage: 240 }, 2: { shield: 160 }, 3: { damage: 70 } }),
  necromancer: profile(720, 190, { 0: { damage: 180 } }),
  priest: profile(760, 152, { 0: { heal: 160 }, 2: { shield: 200 }, 3: { heal: 336 } }),
  druid: profile(760, 160, { 0: { damage: 180 }, 1: { heal: 220 }, 3: { heal: 60 } }),
  paladin: profile(1060, 240, { 0: { damage: 300 } }),
  bard: profile(760, 152, { 0: { damage: 200 }, 3: { shield: 120 } }),
  shaman: profile(720, 180, { 0: { damage: 240 }, 3: { damage: 360 } }),
};
export function heroStats(id: string): Pick<ClassDef, 'hp' | 'attack' | 'armor' | 'resist'> {
  const { hp, attack, armor, resist } = HERO_BALANCE[id];
  return { hp, attack, armor, resist };
}
export const MINER_REPULSE_DAMAGE = 120;
export const SEEKER_HEALTH = 320;
export const SEEKER_DAMAGE = 400;
export const SKELETON_HEALTH = 320;
export const SKELETON_DAMAGE = 90;
