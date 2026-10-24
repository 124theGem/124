import { ITEM_BY_ID, rollLoot, type EquipmentSlot } from '../inventory/items';
import { clamp, seeded } from '../core/math';
import type { MatchState } from '../core/types';
export interface Profile {
  version: 1;
  name: string;
  xp: number;
  gold: number;
  selectedClass: string;
  inventory: string[];
  equipment: Partial<Record<EquipmentSlot, string>>;
  upgrades: number;
  rewardedMatches: string[];
  settings: {
    quality: 'low' | 'medium' | 'high';
    sound: boolean;
    difficulty: 'easy' | 'normal' | 'hard';
  };
}
export interface ProfileStore {
  load(): Profile;
  save(profile: Profile): boolean;
}
export const createProfile = (): Profile => ({
  version: 1,
  name: 'Странник',
  xp: 0,
  gold: 450,
  selectedClass: 'archer',
  inventory: ['item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
  equipment: {
    weapon: 'item-0',
    helmet: 'item-1',
    armor: 'item-2',
    gloves: 'item-3',
    boots: 'item-4',
    accessory: 'item-5',
  },
  upgrades: 0,
  rewardedMatches: [],
  settings: { quality: 'medium', sound: true, difficulty: 'normal' },
});
export class LocalProfileStore implements ProfileStore {
  private key = 'raid-siege.profile.v1';
  load(): Profile {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return createProfile();
      const p = JSON.parse(raw);
      if (p.version !== 1) return createProfile();
      const base = createProfile();
      return {
        ...base,
        ...p,
        xp: Math.max(0, Number(p.xp) || 0),
        gold: Math.max(0, Number(p.gold) || 0),
        upgrades: clamp(Number(p.upgrades) || 0, 0, 10),
        inventory: Array.isArray(p.inventory)
          ? p.inventory.filter((id: unknown) => typeof id === 'string' && ITEM_BY_ID[id])
          : base.inventory,
        equipment: Object.fromEntries(
          Object.entries(p.equipment ?? {}).filter(
            ([slot, id]) => typeof id === 'string' && ITEM_BY_ID[id]?.slot === slot,
          ),
        ),
        settings: { ...base.settings, ...p.settings },
        rewardedMatches: Array.isArray(p.rewardedMatches) ? p.rewardedMatches : [],
      };
    } catch {
      return createProfile();
    }
  }
  save(profile: Profile) {
    try {
      localStorage.setItem(this.key, JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }
}
export const levelForXp = (xp: number) => clamp(1 + Math.floor(Math.sqrt(xp / 100)), 1, 30);
export const xpForLevel = (level: number) => Math.pow(level - 1, 2) * 100;
export function equipmentStats(profile: Profile) {
  return Object.values(profile.equipment).reduce(
    (s, id) => {
      const i = ITEM_BY_ID[id!];
      return i ? { hp: s.hp + i.hp, attack: s.attack + i.attack, armor: s.armor + i.armor } : s;
    },
    { hp: profile.upgrades * 25, attack: profile.upgrades * 3, armor: profile.upgrades },
  );
}
export function equip(profile: Profile, id: string) {
  const item = ITEM_BY_ID[id];
  if (!item || !profile.inventory.includes(id)) return false;
  profile.equipment[item.slot] = id;
  return true;
}
export interface Reward {
  xp: number;
  gold: number;
  item: string | null;
}
export function rewardMatch(profile: Profile, state: MatchState): Reward | null {
  if (state.status !== 'finished' || profile.rewardedMatches.includes(state.id)) return null;
  const win = state.winner === 'A',
    xp = win ? 400 : 100,
    gold = win ? 180 : 40,
    item = win ? rollLoot(seeded(state.seed + state.tick)).id : null;
  profile.xp += xp;
  profile.gold += gold;
  if (item && !profile.inventory.includes(item)) profile.inventory.push(item);
  profile.rewardedMatches.push(state.id);
  return { xp, gold, item };
}
