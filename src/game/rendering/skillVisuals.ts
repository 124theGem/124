/** Explicit art direction for every ability, independent of effect ordering. */
export const SKILL_VISUALS: Record<string, readonly string[]> = {
  demolitionist: ['cluster-mines', 'last-resort', 'minefield', 'seeking-charge'],
  guardian: ['shield-bash', 'challenge', 'armor', 'titan-leap'],
  berserker: ['cleave', 'charge', 'rage', 'whirlwind'],
  assassin: ['venom-blade', 'shadow-step', 'stealth', 'execution'],
  duelist: ['double-slash', 'parry', 'blade-dance', 'thousand-cuts'],
  lancer: ['spear-thrust', 'spear-push', 'spear-sweep', 'spear-rain'],
  archer: ['precision-arrow', 'frost-arrow', 'volley', 'arrow-rain'],
  crossbow: ['piercing-bolt', 'explosive-bolt', 'reload', 'rail-bolt'],
  firemage: ['fireball', 'flame-trail', 'fire-eruption', 'meteor'],
  icemage: ['ice-lance', 'ice-trap', 'ice-armor', 'blizzard'],
  necromancer: ['curse-skull', 'summon', 'life-drain', 'undead-army'],
  priest: ['healing', 'cleanse', 'holy-shield', 'resurrection'],
  druid: ['roots', 'nature-heal', 'spores', 'life-tree'],
  paladin: ['holy-strike', 'oath-wall', 'holy-heal', 'divine-wings'],
  bard: ['sound-wave', 'speed-song', 'power-song', 'hero-anthem'],
  shaman: ['chain-lightning', 'spirit-totem', 'spirit-guard', 'elemental-storm'],
};
export const skillVisual = (classId: string, index: number) => SKILL_VISUALS[classId]?.[index];
