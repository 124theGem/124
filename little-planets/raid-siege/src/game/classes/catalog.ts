import { HERO_BALANCE, heroStats } from './balance';
import { COMBAT_SPEED, combatDuration } from '../core/tempo';
import type { AbilityDef, ClassDef, EffectSpec, Role } from '../core/types';
const e = (kind: EffectSpec['kind'], power: number, duration?: number): EffectSpec => ({
  kind,
  power,
  duration,
});
const a = (
  name: string,
  icon: string,
  target: AbilityDef['target'],
  effects: EffectSpec[],
  options: Partial<AbilityDef> = {},
): AbilityDef => ({
  id: '',
  name,
  description: '',
  icon,
  target,
  effects,
  range: 8,
  radius: 0,
  cooldown: 9,
  cost: 18,
  duration: 0,
  type: target === 'self' || target === 'team' || target === 'ally' ? 'buff' : 'area',
  color: '',
  animation: 'Spellcast_Shoot',
  sound: 'cast',
  ai: target === 'ally' ? 'heal' : target === 'team' || target === 'self' ? 'defense' : 'offense',
  ultimate: false,
  ...options,
});
const damage = (n: number) => e('damage', n);
const ult = (s: AbilityDef) => ({
  ...s,
  ultimate: true,
  cooldown: 40,
  cost: 0,
  animation: 'Spellcast_Raise',
  sound: 'ultimate',
});
const skillClips: Record<string, string[]> = {
  demolitionist: ['Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Shoot', 'Spellcast_Long'],
  guardian: ['Block_Attack', 'Spellcast_Raise', 'Spellcast_Long', 'Dodge_Forward'],
  berserker: [
    '2H_Melee_Attack_Slice',
    '2H_Melee_Attack_Chop',
    'Spellcast_Raise',
    '2H_Melee_Attack_Spin',
  ],
  assassin: [
    'Dualwield_Melee_Attack_Slice',
    'Dodge_Forward',
    'Spellcast_Long',
    'Dualwield_Melee_Attack_Slice',
  ],
  duelist: [
    'Dualwield_Melee_Attack_Slice',
    '1H_Melee_Attack_Stab',
    '2H_Melee_Attack_Spin',
    'Dualwield_Melee_Attack_Slice',
  ],
  lancer: [
    '2H_Melee_Attack_Stab',
    '2H_Melee_Attack_Slice',
    '2H_Melee_Attack_Spin',
    '2H_Melee_Attack_Chop',
  ],
  archer: ['2H_Ranged_Shoot', '2H_Ranged_Shoot', '2H_Ranged_Shoot', 'Spellcast_Raise'],
  crossbow: ['2H_Ranged_Shoot', '2H_Ranged_Shoot', 'Spellcast_Long', '2H_Ranged_Shoot'],
  firemage: ['Spellcast_Shoot', 'Spellcast_Long', 'Spellcast_Shoot', 'Spellcast_Raise'],
  icemage: ['Spellcast_Shoot', 'Spellcast_Long', 'Spellcast_Raise', 'Spellcast_Raise'],
  necromancer: ['Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcast_Raise'],
  priest: ['Spellcast_Shoot', 'Spellcast_Long', 'Spellcast_Raise', 'Spellcast_Raise'],
  druid: ['Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcast_Raise'],
  paladin: ['1H_Melee_Attack_Chop', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcast_Raise'],
  bard: ['1H_Melee_Attack_Stab', 'Spellcast_Long', 'Spellcast_Raise', 'Spellcast_Raise'],
  shaman: ['Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcast_Raise'],
};
function hero(
  id: string,
  name: string,
  title: string,
  role: Role,
  color: string,
  icon: string,
  model: string,
  weapon: string,
  passive: string,
  skills: AbilityDef[],
  stats: Partial<ClassDef> = {},
): ClassDef {
  return {
    id,
    name,
    title,
    role,
    color,
    icon,
    model,
    weapon,
    passive,
    description: `${title}. ${passive}`,
    speed: (role === 'melee' ? 5.04 : 4.62) * COMBAT_SPEED,
    range: ['ranged', 'healer', 'support'].includes(role) ? 8 : 2.3,
    interval: combatDuration(0.82),
    ...stats,
    ...heroStats(id),
    abilities: skills
      .map((skill, i) => {
        const s = {
          ...skill,
          effects: skill.effects.map((effect) => ({
            ...effect,
            power: HERO_BALANCE[id].skills[i]?.[effect.kind] ?? effect.power,
          })),
        };
        return {
          ...s,
          cooldown: combatDuration(s.cooldown),
          ...(id === 'guardian' && s.delivery === 'jump' ? { cooldown: 3, chargeCost: 0 } : {}),
          id: `${id}-${i + 1}`,
          animation: skillClips[id]?.[i] ?? s.animation,
          color,
          description:
            s.description ||
            s.effects
              .map(
                (f) =>
                  `${{ damage: 'Урон', heal: 'Лечение', shield: 'Щит', stun: 'Оглушение', slow: 'Замедление', root: 'Корни', poison: 'Яд', burn: 'Горение', defense: 'Защита', power: 'Сила', haste: 'Скорость', stealth: 'Скрытность', weakness: 'Ослабление', taunt: 'Провокация', invulnerable: 'Неуязвимость', cleanse: 'Очищение', revive: 'Возрождение', dash: 'Рывок', blink: 'Теневой шаг', knockback: 'Отбрасывание', summon: 'Призыв', reset: 'Перезарядка', barrier: 'Защитная стена' }[f.kind]} ${f.power}${f.duration ? ` · ${f.duration} с` : ''}`,
              )
              .join(' / '),
        };
      })
      .filter(
        (_, i) =>
          i !== (({ priest: 1, icemage: 1, berserker: 1 } as Record<string, number>)[id] ?? 2),
      ) as ClassDef['abilities'],
  };
}
export const CLASSES: ClassDef[] = [
  hero(
    'demolitionist',
    'Минёр',
    'Мастер живых мин',
    'ranged',
    '#ffb45b',
    'bomb',
    'Rogue',
    'bombs',
    'Кассетный арсенал: обычная атака разбрасывает три взводящиеся мины.',
    [
      a('Кассетный залп', 'bomb', 'ground', [damage(105)], {
        range: 14,
        radius: 3.8,
        cooldown: 10,
        cost: 22,
        delivery: 'mines',
        mineCount: 6,
        description:
          'Бросает кассету из 6 мин. Каждая взводится за 0,5 с и взрывается при приближении врага или через 5 с.',
      }),
      a('Последний рубеж', 'burst', 'self', [e('invulnerable', 1, 1)], {
        cooldown: 18,
        cost: 20,
        delivery: 'repulse',
        ai: 'defense',
        description:
          'На 1 с становится неуязвимым, затем отбрасывает врагов взрывом на 4 м и наносит 120 урона.',
      }),
      a('Минное поле', 'target', 'ground', [damage(85)], {
        range: 12,
        radius: 4.5,
        cooldown: 16,
        cost: 25,
        delivery: 'mines',
        mineCount: 8,
        description:
          'Оставляет на выбранном участке 8 отдельных мин, которые взрываются при приближении противника.',
      }),
      ult(
        a('Самоходный заряд', 'skull', 'self', [damage(440)], {
          delivery: 'seeker',
          ai: 'offense',
          description:
            'Выпускает управляемый заряд с 320 HP: он ищет врага до 8 с и взрывается рядом с ним. Заряд можно уничтожить.',
        }),
      ),
    ],
    { range: 14, interval: combatDuration(1.6) },
  ),

  hero(
    'guardian',
    'Страж',
    'Оплот команды',
    'tank',
    '#59d4f0',
    'shield',
    'Knight',
    'sword-shield',
    'Закалённая броня: +16 защиты.',
    [
      a('Удар щитом', 'shield', 'enemy', [damage(135), e('stun', 1, 1.5)], {
        range: 3,
        cooldown: 7,
        animation: 'Block_Attack',
      }),
      a('Провокация', 'target', 'ground', [e('taunt', 0.3, 5)], {
        range: 0,
        radius: 7,
        cooldown: 12,
      }),
      a('Железная защита', 'armor', 'self', [e('defense', 0.65, 5)], { cooldown: 16 }),
      ult(
        a('Прыжок титана', 'meteor', 'ground', [damage(320), e('stun', 1, 3)], {
          range: 16,
          radius: 5.5,
          delivery: 'jump',
          arenaDuration: 5,
          description:
            'Дальний прыжок: 192 урона при приземлении, оглушение врагов на 3 с и арена на 5 с. Через границу арены нельзя выйти. Откат 3 с, без накопления заряда.',
        }),
      ),
    ],
  ),
  hero(
    'berserker',
    'Берсерк',
    'Неудержимая ярость',
    'melee',
    '#ff844b',
    'axe',
    'Barbarian',
    'axe',
    'Кровавая ярость: до +60% урона при потере HP.',
    [
      a('Рассекающий удар', 'axe', 'ground', [damage(180)], {
        range: 4.5,
        radius: 0,
        shape: 'cone',
        arc: Math.PI * 0.65,
        animation: '2H_Melee_Attack_Slice',
      }),
      a('Боевой рывок', 'dash', 'enemy', [e('dash', 7), damage(100)], {
        cooldown: 10,
        animation: '2H_Melee_Attack_Chop',
      }),
      a('Ярость крови', 'flame', 'self', [e('power', 0.4, 7), e('haste', 0.35, 7)], {
        cooldown: 18,
        ai: 'buff',
      }),
      ult(
        a('Кровавый вихрь', 'whirl', 'ground', [damage(115)], {
          range: 0,
          radius: 5,
          duration: 4,
          animation: '2H_Melee_Attack_Spin',
        }),
      ),
    ],
  ),
  hero(
    'assassin',
    'Убийца',
    'Клинок из тени',
    'melee',
    '#c28aff',
    'dagger',
    'Rogue_Hooded',
    'daggers',
    'Удар в спину наносит на 35% больше урона.',
    [
      a('Отравленный клинок', 'dagger', 'enemy', [damage(95), e('poison', 28, 6)], { range: 3 }),
      a('Теневой шаг', 'dash', 'enemy', [e('blink', 1), damage(100)], { range: 10, cooldown: 12 }),
      a('Скрытность', 'eye', 'self', [e('stealth', 1, 5), e('haste', 0.35, 5)], { cooldown: 18 }),
      ult(a('Казнь из тени', 'dagger', 'enemy', [damage(650), e('stun', 1, 1)], { range: 4 })),
    ],
    { interval: combatDuration(0.64) },
  ),
  hero(
    'duelist',
    'Дуэлянт',
    'Танцующий с клинками',
    'melee',
    '#ffd486',
    'swords',
    'Rogue',
    'swords',
    'Комбо из трёх атак ускоряет следующую атаку на 25%.',
    [
      a('Двойной удар', 'swords', 'enemy', [damage(210)], {
        range: 3,
        animation: 'Dualwield_Melee_Attack_Slice',
      }),
      a('Контратака', 'shield', 'self', [e('defense', 0.85, 2), e('power', 0.5, 3)], {
        cooldown: 12,
      }),
      a('Танец клинков', 'whirl', 'ground', [damage(140), e('haste', 0.2, 4)], {
        range: 0,
        radius: 4,
        cooldown: 10,
      }),
      ult(
        a('Тысяча разрезов', 'swords', 'ground', [damage(155)], {
          range: 0,
          radius: 6,
          duration: 4,
        }),
      ),
    ],
    { interval: combatDuration(0.7) },
  ),
  hero(
    'lancer',
    'Копейщик',
    'Хранитель дистанции',
    'melee',
    '#5de0bb',
    'spear',
    'Knight',
    'spear',
    'Длинное копьё: дальность ближней атаки 4 метра.',
    [
      a('Пронзающий выпад', 'spear', 'line', [damage(185)], {
        range: 9,
        radius: 1,
        animation: '2H_Melee_Attack_Stab',
      }),
      a('Отбрасывание', 'dash', 'enemy', [damage(90), e('knockback', 4)], { range: 4 }),
      a('Круговая атака', 'whirl', 'ground', [damage(150)], { range: 0, radius: 4 }),
      ult(
        a('Копья возмездия', 'spear', 'ground', [damage(350), e('stun', 1, 2)], {
          range: 8,
          radius: 6,
        }),
      ),
    ],
    { range: 4 },
  ),
  hero(
    'archer',
    'Лучник',
    'Глаз сокола',
    'ranged',
    '#a2e965',
    'bow',
    'Rogue_Hooded',
    'bow',
    'Дальнобойность: базовая атака достигает 11 метров.',
    [
      a('Точный выстрел', 'target', 'enemy', [damage(220)], { range: 14, type: 'projectile' }),
      a('Замедляющая стрела', 'snow', 'enemy', [damage(100), e('slow', 0.5, 4)], {
        range: 12,
        type: 'projectile',
      }),
      a('Стрелковый залп', 'bow', 'ground', [damage(180)], { range: 11, radius: 4 }),
      ult(
        a('Дождь стрел', 'bow', 'ground', [damage(110)], {
          range: 12,
          radius: 6,
          duration: 5,
          delay: 0.6,
        }),
      ),
    ],
    { range: 11 },
  ),
  hero(
    'crossbow',
    'Арбалетчик',
    'Тяжёлый аргумент',
    'ranged',
    '#ffc06a',
    'crossbow',
    'Rogue',
    'crossbow',
    'Бронебойность: игнорирует половину брони цели.',
    [
      a('Бронебойный болт', 'crossbow', 'enemy', [damage(250)], { range: 13, type: 'projectile' }),
      a('Взрывной болт', 'burst', 'ground', [damage(190)], { range: 10, radius: 3.8 }),
      a('Быстрая перезарядка', 'refresh', 'self', [e('reset', 1), e('haste', 0.45, 5)], {
        cooldown: 20,
        ai: 'buff',
      }),
      ult(a('Последний аргумент', 'crossbow', 'line', [damage(600)], { range: 18, radius: 1.4 })),
    ],
    { interval: combatDuration(1) },
  ),
  hero(
    'firemage',
    'Огненный маг',
    'Повелитель пламени',
    'ranged',
    '#ff9b3e',
    'flame',
    'Mage',
    'staff',
    'Раскалённые угли: горение наносит на 30% больше урона.',
    [
      a('Огненный шар', 'flame', 'enemy', [damage(180), e('burn', 22, 4)], {
        type: 'projectile',
        range: 11,
      }),
      a('Огненное кольцо', 'burst', 'ground', [e('burn', 35, 4)], {
        radius: 4,
        range: 0,
        duration: 5,
      }),
      a('Взрыв пламени', 'burst', 'ground', [damage(190)], { range: 8, radius: 4 }),
      ult(
        a('Метеорит', 'meteor', 'ground', [damage(570), e('burn', 35, 5)], {
          range: 13,
          radius: 6,
          delay: 1.2,
        }),
      ),
    ],
  ),
  hero(
    'icemage',
    'Ледяной маг',
    'Дыхание зимы',
    'ranged',
    '#7beaff',
    'snow',
    'Mage',
    'ice',
    'Леденящее касание: базовые атаки замедляют на 15%.',
    [
      a('Ледяное копьё', 'spear', 'enemy', [damage(155), e('slow', 0.4, 4)], {
        range: 12,
        type: 'projectile',
      }),
      a('Морозная ловушка', 'snow', 'ground', [damage(60), e('slow', 0.5, 2.5)], {
        range: 9,
        radius: 3,
        duration: 4,
      }),
      a('Ледяная броня', 'armor', 'self', [e('shield', 240), e('defense', 0.25, 6)], {
        cooldown: 16,
      }),
      ult(
        a('Абсолютный холод', 'snow', 'ground', [damage(80), e('stun', 1, 1.2)], {
          range: 11,
          radius: 6,
          duration: 5,
          delay: 0.8,
        }),
      ),
    ],
  ),
  hero(
    'necromancer',
    'Некромант',
    'Владыка мёртвых',
    'ranged',
    '#c287ff',
    'skull',
    'Mage',
    'wand',
    'Жатва душ: смерть врага рядом восстанавливает 20 ресурса.',
    [
      a('Проклятие слабости', 'skull', 'enemy', [e('weakness', 0.35, 6), damage(65)], {
        range: 11,
      }),
      a('Призыв скелета', 'summon', 'self', [e('summon', 1, 18)], { cooldown: 18, ai: 'buff' }),
      a('Похищение жизни', 'heart', 'enemy', [damage(190), e('heal', 140)], { range: 9 }),
      ult(a('Армия мёртвых', 'summon', 'self', [e('summon', 3, 20)], { ai: 'buff' })),
    ],
  ),
  hero(
    'priest',
    'Жрец',
    'Свет надежды',
    'healer',
    '#ffe391',
    'sun',
    'Mage',
    'holy',
    'Благодать: все исходящие исцеления усилены на 25%.',
    [
      a('Исцеление', 'heart', 'ground', [e('heal', 280)], {
        range: 12,
        radius: 4,
        cooldown: 5,
        cost: 16,
        friendly: true,
        ai: 'heal',
        description:
          'Посылает целительный заряд в выбранную область радиусом 4 м. При прибытии восстанавливает каждому союзнику 200 HP с учётом Благодати. Анимация следует за каждым получателем лечения.',
      }),
      a('Очищение', 'sun', 'ally', [e('cleanse', 1), e('heal', 90)], { range: 12 }),
      a('Божественный щит', 'shield', 'ally', [e('shield', 260)], {
        range: 12,
        cooldown: 12,
        ai: 'defense',
      }),
      ult(
        a('Свет возрождения', 'sun', 'team', [e('heal', 480), e('revive', 0.45)], {
          radius: 15,
          ai: 'heal',
        }),
      ),
    ],
  ),
  hero(
    'druid',
    'Друид',
    'Голос природы',
    'healer',
    '#73e9a2',
    'leaf',
    'Mage',
    'nature',
    'Живая природа: восстанавливает 0,6% HP в секунду.',
    [
      a('Порыв природы', 'leaf', 'ground', [damage(160), e('knockback', 3)], {
        range: 10,
        radius: 3.5,
        description:
          'Посылает вихрь листьев в выбранную точку. При попадании наносит 180 урона и отбрасывает врагов на 3 м, не лишая их возможности двигаться.',
      }),
      a('Природное исцеление', 'heart', 'ally', [e('heal', 240)], { range: 12, cooldown: 6 }),
      a('Ядовитые споры', 'leaf', 'ground', [e('poison', 36, 6)], { range: 9, radius: 4 }),
      ult(
        a('Древо жизни', 'tree', 'team', [e('heal', 100), e('defense', 0.25, 2)], {
          radius: 9,
          duration: 8,
          ai: 'heal',
        }),
      ),
    ],
  ),
  hero(
    'paladin',
    'Паладин',
    'Клятва света',
    'tank',
    '#ffdd79',
    'sun',
    'Knight',
    'paladin',
    'Аура веры: союзники в 7 метрах получают на 10% меньше урона.',
    [
      a('Священный удар', 'sword', 'enemy', [damage(185)], { range: 3 }),
      a('Стена клятвы', 'shield', 'line', [e('barrier', 1, 5)], {
        range: 3,
        radius: 4.5,
        cooldown: 14,
        delivery: 'wall',
        ai: 'defense',
        description:
          'На 5 с создаёт перед паладином щитовую стену шириной 9 м. Защищает союзников от атак с фронта; её можно обойти.',
      }),
      a('Исцеляющий свет', 'heart', 'ally', [e('heal', 220)], { range: 10, cooldown: 8 }),
      ult(
        a('Божественное вмешательство', 'sun', 'team', [e('defense', 0.75, 7), e('cleanse', 1)], {
          radius: 14,
        }),
      ),
    ],
  ),
  hero(
    'bard',
    'Бард',
    'Песнь победы',
    'support',
    '#f8a0e1',
    'music',
    'Rogue',
    'lute',
    'Вдохновение: союзники рядом восстанавливают ресурс на 30% быстрее.',
    [
      a('Звуковой удар', 'music', 'ground', [damage(145), e('knockback', 2)], {
        range: 8,
        radius: 3,
      }),
      a('Песнь скорости', 'dash', 'team', [e('haste', 0.35, 7)], {
        radius: 10,
        cooldown: 14,
        ai: 'buff',
      }),
      a('Песнь силы', 'swords', 'team', [e('power', 0.3, 7)], {
        radius: 10,
        cooldown: 16,
        ai: 'buff',
      }),
      ult(
        a(
          'Гимн героев',
          'music',
          'team',
          [e('power', 0.45, 9), e('haste', 0.3, 9), e('shield', 180)],
          { radius: 14, ai: 'buff' },
        ),
      ),
    ],
  ),
  hero(
    'shaman',
    'Шаман',
    'Проводник стихий',
    'support',
    '#58ecdb',
    'bolt',
    'Barbarian',
    'totem',
    'Сила духов: радиус и длительность тотемов увеличены на 25%.',
    [
      a('Цепная молния', 'bolt', 'ground', [damage(170)], { range: 11, radius: 4 }),
      a('Тотем замедления', 'totem', 'ground', [e('slow', 0.5, 2)], {
        range: 7,
        radius: 5,
        duration: 10,
      }),
      a('Духовная защита', 'shield', 'team', [e('shield', 190), e('defense', 0.2, 5)], {
        radius: 9,
        cooldown: 14,
      }),
      ult(
        a(
          'Гнев стихий',
          'bolt',
          'ground',
          [damage(400), e('slow', 0.45, 5), e('weakness', 0.25, 5)],
          { range: 12, radius: 6, delay: 0.8 },
        ),
      ),
    ],
  ),
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<
  string,
  ClassDef
>;
export const getClass = (id: string) => CLASS_BY_ID[id] ?? CLASS_BY_ID.guardian;
