export type EquipmentSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface Item {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: Rarity;
  level: number;
  hp: number;
  attack: number;
  armor: number;
  icon: string;
}
export const RARITIES: Record<Rarity, { name: string; color: string }> = {
  common: { name: 'Обычный', color: '#b8c0c5' },
  uncommon: { name: 'Необычный', color: '#8db98d' },
  rare: { name: 'Редкий', color: '#7aaed3' },
  epic: { name: 'Эпический', color: '#b6a0d6' },
  legendary: { name: 'Легендарный', color: '#dab778' },
};
export const SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: 'Оружие',
  helmet: 'Шлем',
  armor: 'Доспех',
  gloves: 'Перчатки',
  boots: 'Обувь',
  accessory: 'Аксессуар',
};
const slots: EquipmentSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory'];
const bases = ['Клинок', 'Шлем', 'Доспех', 'Рукавицы', 'Сапоги', 'Амулет'];
const suffixes = [
  'странника',
  'лесного дозора',
  'забытых руин',
  'пепельного ордена',
  'древних титанов',
];
export const ITEMS: Item[] = Array.from({ length: 30 }, (_, i) => {
  const tier = Math.floor(i / 6),
    s = i % 6,
    power = tier + 1;
  return {
    id: `item-${i}`,
    name: `${bases[s]} ${suffixes[tier]}`,
    slot: slots[s],
    rarity: (['common', 'uncommon', 'rare', 'epic', 'legendary'] as Rarity[])[tier],
    level: 1 + tier * 5,
    hp: s === 2 ? power * 70 : s === 5 ? power * 35 : power * 12,
    attack: s === 0 ? power * 12 : s === 3 ? power * 4 : 0,
    armor: s === 0 ? 0 : power * (s === 2 ? 4 : 2),
    icon: ['sword', 'helmet', 'armor', 'hand', 'boot', 'gem'][s],
  };
});
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export function rollLoot(random: () => number): Item {
  const r = random(),
    tier = r < 0.45 ? 0 : r < 0.75 ? 1 : r < 0.92 ? 2 : r < 0.985 ? 3 : 4;
  return ITEMS[tier * 6 + Math.floor(random() * 6)];
}
