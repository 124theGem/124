import type { ClassDef } from '../core/types';

// Burst cadence and one-charge reloads, in real seconds. Skills retain their own timers.
// These are profiles for our heroes, inspired by Brawl's ammo rhythm.
const TIMING: Record<string, [number, number]> = {
  guardian: [0.45, 1.6],
  berserker: [0.4, 1.6],
  assassin: [0.35, 1.8],
  duelist: [0.3, 1.3],
  lancer: [0.45, 1.7],
  archer: [0.5, 2.1],
  crossbow: [0.55, 2.2],
  firemage: [0.5, 1.8],
  icemage: [0.45, 1.7],
  necromancer: [0.5, 1.8],
  priest: [0.4, 1.6],
  druid: [0.45, 1.7],
  paladin: [0.5, 1.7],
  bard: [0.35, 1.5],
  shaman: [0.5, 1.9],
  demolitionist: [0.65, 2.3],
};
export function basicAttackTiming(
  id: string,
): Pick<ClassDef, 'interval' | 'ammoCapacity' | 'reloadTime'> {
  const [interval, reloadTime] = TIMING[id];
  return { interval, reloadTime, ammoCapacity: 3 };
}
