import { CLASSES, getClass } from '../game/classes/catalog';
import type { ClassDef, MatchState, Mode } from '../game/core/types';
import type { Profile, Reward } from '../game/storage/profile';
import { levelForXp, xpForLevel } from '../game/storage/profile';
import { ITEMS, ITEM_BY_ID, RARITIES, SLOT_NAMES } from '../game/inventory/items';
import { abilityArtwork, locationArtwork } from './artwork';
import { icon, escapeHtml } from './icons';
export const MODES: Record<
  Mode,
  { name: string; tag: string; map: string; description: string; duration: string; icon: string }
> = {
  raid: {
    name: 'Рейд',
    tag: 'КООПЕРАТИВ · PvE',
    map: 'Забытые руины',
    description: 'Пройдите сквозь древние руины и пробудите их последнего хранителя.',
    duration: '2–5 мин',
    icon: 'skull',
  },
  siege: {
    name: 'Осада',
    tag: 'КОМАНДНЫЙ БОЙ · 3 × 3',
    map: 'Крепость Пепельного Ордена',
    description: 'Прорвите три рубежа обороны. Захватите сердце крепости.',
    duration: '7 мин',
    icon: 'fortress',
  },
  hill: {
    name: 'Царь горы',
    tag: 'ЗАХВАТ ТОЧКИ · 3 × 3',
    map: 'Святилище Титанов',
    description: 'Удерживайте древнее святилище. Первые 300 очков решают всё.',
    duration: '5 мин',
    icon: 'flag',
  },
};
const roleNames = {
  tank: 'Танк',
  melee: 'Ближний бой',
  ranged: 'Дальний бой',
  healer: 'Лекарь',
  support: 'Поддержка',
};
export function portrait(c: ClassDef, large = false) {
  return `<span class="portrait ${large ? 'large' : ''}" style="--class:${c.color}">${icon(c.icon, large ? 42 : 25)}<span class="portrait-glow"></span></span>`;
}
export function header(p: Profile, tab: string) {
  const level = levelForXp(p.xp);
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="Главное меню"><span class="brand-mark">${icon('swords', 26)}</span><span>RAID<span class="brand-amp"> & </span>SIEGE<small>CHRONICLES OF THE FALLEN</small></span></button><nav class="topnav" aria-label="Основная навигация">${[
    ['home', 'swords', 'Играть'],
    ['heroes', 'people', 'Герои'],
    ['inventory', 'bag', 'Арсенал'],
  ]
    .map(
      ([id, i, n]) =>
        `<button data-action="${id}" class="${tab === id ? 'active' : ''}">${icon(i, 17)}<span>${n}</span></button>`,
    )
    .join(
      '',
    )}</nav><div class="account"><span class="gold">${icon('coin', 18)} ${p.gold.toLocaleString('ru')}</span><span class="account-divider"></span><span class="avatar">${icon('helmet', 23)}<b>${level}</b></span><span class="account-name">${escapeHtml(p.name)}<small>Уровень ${level}</small></span><button class="icon-button" data-action="settings" aria-label="Настройки">${icon('settings', 19)}</button></div></header>`;
}
export function home(profile: Profile, mode: Mode, allies: [string, string]) {
  const c = getClass(profile.selectedClass),
    m = MODES[mode];
  return `<div class="menu-screen">${header(profile, 'home')}<main class="home-main"><div class="chapter"><span class="chapter-line"></span>ГЛАВА I <span class="chapter-dot">◆</span> ПРОБУЖДЕНИЕ ДРЕВНИХ</div><section class="hero-copy"><div class="eyebrow">${icon('compass', 14)} МИР ЖДЁТ СВОИХ ГЕРОЕВ</div><h1>${mode === 'raid' ? 'Забытые<br><em>руины</em>' : mode === 'siege' ? 'Пепельная<br><em>крепость</em>' : 'Святилище<br><em>Титанов</em>'}</h1><p>${m.description}</p><div class="hero-meta"><span>${icon('people', 16)} ${mode === 'raid' ? 'Отряд из 3 героев' : 'Две команды по 3'}</span><span>${icon('clock', 16)} ${m.duration}</span><span class="difficulty"><i></i><i></i><i></i> Обычная</span></div><button class="text-button" data-action="guide">Правила и управление ${icon('chevron', 15)}</button></section><aside class="party-panel"><div class="section-label">ВАШ ОТРЯД <span>3 / 3</span></div><div class="party-members">${[c, ...allies.map(getClass)].map((hero, i) => `<button class="party-member ${i === 0 ? 'local' : ''}" data-${i ? 'ally="' + (i - 1) + '"' : 'action="heroes"'}>${portrait(hero)}<span class="member-info"><b>${hero.name}</b><small>${roleNames[hero.role]}</small></span><span class="member-badge">${i ? 'ИИ' : 'ВЫ'}</span>${icon('chevron', 13)}</button>`).join('')}</div><div class="party-note"><span class="status-dot"></span> Ваши союзники готовы к бою</div><div class="local-note">${icon('shield', 13)} Локальный матч с ИИ</div></aside><div class="world-label"><span></span>ЗАБЫТЫЕ ЗЕМЛИ <small>СЕВЕРНОЕ КОРОЛЕВСТВО</small></div><section class="expedition"><div class="section-label">ВЫБЕРИТЕ СВОЁ СРАЖЕНИЕ <span>01 — 03</span></div><div class="mode-grid">${(Object.entries(MODES) as [Mode, typeof m][]).map(([id, data], i) => `<button class="mode-card ${mode === id ? 'selected' : ''} mode-${id}" data-mode="${id}"><div class="mode-art">${mapArt(id)}<span class="mode-number">0${i + 1}</span>${mode === id ? `<span class="selected-check">${icon('check', 13)}</span>` : ''}</div><div class="mode-info"><span class="mode-symbol">${icon(data.icon, 22)}</span><div><span class="mode-tag">${data.tag}</span><h3>${data.name}</h3><small>${data.map}</small></div>${icon('chevron', 17)}</div></button>`).join('')}</div><div class="embark-row"><div class="current-hero">${portrait(c)}<span><small>ВАШ ГЕРОЙ</small><b>${c.name} <span>· ${roleNames[c.role]}</span></b></span><button class="text-button" data-action="heroes">Сменить ${icon('refresh', 13)}</button></div><button class="primary embark" data-action="start">${icon('swords', 23)}<span>В бой<small>${m.name.toUpperCase()} · ${mode === 'raid' ? 'PvE' : '3 × 3'}</small></span>${icon('chevron', 22)}</button></div></section></main><footer class="menu-footer"><span><i class="status-dot"></i> ПРОТОТИП 0.5.0 <b>•</b> ЛОКАЛЬНАЯ СИМУЛЯЦИЯ</span><button data-action="credits">Мир, созданный для приключений ${icon('book', 14)}</button></footer></div>`;
}
function mapArt(mode: Mode) {
  return locationArtwork(mode);
}
export function heroes(profile: Profile, selected: string, slot: number | null) {
  const c = getClass(selected);
  return `<div class="panel-page">${header(profile, 'heroes')}<div class="page-heading"><div><span class="eyebrow">ЗАЛ ГЕРОЕВ</span><h2>${slot === null ? 'Найдите свой путь' : 'Выберите союзника'}</h2><p>${CLASSES.length} классов. Одна команда. Бесконечные возможности.</p></div><button class="text-button" data-action="home">${icon('logout', 16)} Назад</button></div><div class="heroes-layout"><div class="class-grid">${CLASSES.map((h, i) => `<button class="class-card ${h.id === selected ? 'chosen' : ''}" data-class="${h.id}" style="--class:${h.color}"><span class="class-number">${String(i + 1).padStart(2, '0')}</span>${portrait(h, true)}<h3>${h.name}</h3><small>${roleNames[h.role]}</small>${h.id === selected ? `<span class="class-check">${icon('check', 13)}</span>` : ''}</button>`).join('')}</div><aside class="hero-detail" style="--class:${c.color}"><div class="detail-top">${portrait(c, true)}<div><span class="eyebrow">${roleNames[c.role]}</span><h2>${c.name}</h2></div></div><p>${c.title}</p><div class="hero-preview-stage"><canvas id="hero-preview" aria-label="Трёхмерная модель героя"></canvas><span>3D · СКЕЛЕТНАЯ АНИМАЦИЯ</span></div><div class="hero-stats">${[
    ['heart', 'Здоровье', c.hp],
    ['sword', 'Атака', c.attack],
    ['armor', 'Защита', c.armor],
    ['dash', 'Скорость', c.speed],
  ]
    .map(([i, n, v]) => `<span>${icon(String(i), 15)}${n}<b>${v}</b></span>`)
    .join(
      '',
    )}</div><div class="section-label">СПОСОБНОСТИ <span>4 АКТИВНЫХ</span></div><div class="ability-list">${c.abilities.map((a, i) => `<div class="ability-description ${a.ultimate ? 'ultimate-desc' : ''}"><span class="ability-icon">${icon(a.icon, 22)}<b>${i + 1}</b></span><span><strong>${a.name}${a.ultimate ? '<em>ULT</em>' : ''}</strong><small>${a.description}</small><small class="skill-meta">${a.cooldown} с · ${a.ultimate ? '100% заряда' : a.cost + ' ресурса'}</small></span></div>`).join('')}</div><div class="passive"><span class="eyebrow">ПАССИВНАЯ СПОСОБНОСТЬ</span><p>${c.passive}</p></div><button class="secondary" data-demo-ult>${icon(c.abilities[3].icon, 18)} Демонстрация ультимейта</button><button class="primary" data-select-class="${c.id}">${icon('check', 18)} ${slot === null ? 'Выбрать героя' : 'Добавить в отряд'}</button><small class="asset-disclosure">Модели KayKit CC0 · варианты классов</small></aside></div></div>`;
}
export function inventory(profile: Profile, selected: string | null) {
  const item = selected ? ITEM_BY_ID[selected] : null,
    old = item ? ITEM_BY_ID[profile.equipment[item.slot] ?? ''] : null;
  return `<div class="panel-page">${header(profile, 'inventory')}<div class="page-heading"><div><span class="eyebrow">АРСЕНАЛ</span><h2>История каждого клинка</h2><p>Снаряжение усиливает героя в рейдах. В PvP характеристики нормализованы.</p></div><button class="text-button" data-action="home">${icon('logout', 16)} Назад</button></div><div class="inventory-layout"><aside class="equipment-panel"><div class="section-label">СНАРЯЖЕНИЕ</div>${Object.entries(
    SLOT_NAMES,
  )
    .map(([slot, name]) => {
      const e = ITEM_BY_ID[profile.equipment[slot as keyof typeof profile.equipment] ?? ''];
      return `<button class="equipped-item" ${e ? `data-item="${e.id}"` : ''}><span class="item-icon" style="--rarity:${e ? RARITIES[e.rarity].color : '#6a757a'}">${icon(e?.icon ?? 'plus', 26)}</span><span><small>${name}</small><strong>${e?.name ?? 'Пустой слот'}</strong></span></button>`;
    })
    .join(
      '',
    )}<button class="secondary" data-action="upgrades">${icon('plus', 17)} Улучшения героя</button></aside><section class="inventory-content"><div class="section-label">РЮКЗАК <span>${profile.inventory.length} / 30 ПРЕДМЕТОВ</span></div><div class="items-grid">${profile.inventory
    .map((id) => ITEM_BY_ID[id])
    .filter(Boolean)
    .map(
      (i) =>
        `<button class="item-card ${selected === i.id ? 'chosen' : ''}" data-item="${i.id}" style="--rarity:${RARITIES[i.rarity].color}"><span class="item-tier">${i.level}</span>${icon(i.icon, 40)}<strong>${i.name}</strong><small>${RARITIES[i.rarity].name}</small>${profile.equipment[i.slot] === i.id ? `<b class="equipped-tag">${icon('check', 11)} Надето</b>` : ''}</button>`,
    )
    .join(
      '',
    )}</div><p class="inventory-hint">${icon('gem', 17)} Новое снаряжение можно получить за победу в любом режиме.</p></section><aside class="item-detail">${item ? `<div class="item-showcase" style="--rarity:${RARITIES[item.rarity].color}">${icon(item.icon, 74)}</div><span class="eyebrow" style="color:${RARITIES[item.rarity].color}">${RARITIES[item.rarity].name} · ${SLOT_NAMES[item.slot]}</span><h3>${item.name}</h3><div class="hero-stats">${(['hp', 'attack', 'armor'] as const).map((key, i) => `<span>${['Здоровье', 'Атака', 'Защита'][i]}<b>+${item[key]} <em class="${item[key] - (old?.[key] ?? 0) >= 0 ? 'positive' : 'negative'}">(${item[key] - (old?.[key] ?? 0) >= 0 ? '+' : ''}${item[key] - (old?.[key] ?? 0)})</em></b></span>`).join('')}</div><button class="primary" data-equip="${item.id}" ${profile.equipment[item.slot] === item.id ? 'disabled' : ''}>${icon('check', 17)} ${profile.equipment[item.slot] === item.id ? 'Уже экипировано' : 'Экипировать'}</button>` : `<div class="empty-item">${icon('bag', 50)}<p>Выберите предмет,<br>чтобы сравнить характеристики</p></div>`}</aside></div></div>`;
}
export function hud(state: MatchState) {
  const c = getClass(state.entities[0].classId);
  return `<div class="battle-hud"><header class="mission-strip" aria-label="Ход миссии"><span class="battle-timer" id="timer">07:00</span><b id="objective"></b><small id="objective-detail" hidden></small><div class="objective-bar"><span id="objective-fill"></span></div></header><aside class="team-hud">${state.entities
    .filter((e) => e.team === 'A' && e.kind === 'hero')
    .map(
      (e) =>
        `<div class="team-row" id="team-${e.id}">${portrait(getClass(e.classId))}<div><b>${e.name === 'Вы' ? c.name : e.name}<small>${e.controller === 'HUMAN_LOCAL' ? 'ВЫ' : 'ИИ'}</small></b><div class="health-track"><i></i></div><span class="team-hp"></span></div></div>`,
    )
    .join(
      '',
    )}</aside><div id="world-labels"></div><div id="combat-text"></div><div id="skill-callout" class="skill-callout" hidden></div><div class="joystick" aria-label="Джойстик перемещения"><span class="joystick-cross"></span><div class="joystick-knob">${icon('plus', 24)}</div><small>W A S D</small></div><section class="ability-dock icons-only" aria-label="Способности"><div class="skill-buttons">${c.abilities.map((a, i) => `<button class="skill-button ${a.ultimate ? 'ultimate-button' : ''}" data-skill="${i}" style="--skill-color:${a.color}" aria-label="${a.name}" title="${a.name}: ${a.description}">${abilityArtwork(c, a, i)}<span class="cooldown"></span></button>`).join('')}</div></section><div class="combat-controls"><button class="attack-button" data-attack aria-label="Обычная атака">${icon(c.range > 5 ? 'target' : 'swords', 37)}<small>АТАКА</small></button></div><div class="rotate-hint">${icon('refresh', 18)} Для удобства поверните телефон</div><div id="death-notice" hidden></div>${import.meta.env.DEV ? '<button class="dev-hotspot" data-action="debug" aria-label="Отладка">F10</button>' : ''}</div>`;
}
export function results(state: MatchState, reward: Reward | null, profile: Profile) {
  const e = state.entities.find((e) => e.controller === 'HUMAN_LOCAL')!,
    win = state.winner === 'A',
    level = levelForXp(profile.xp),
    base = xpForLevel(level),
    next = xpForLevel(level + 1);
  return `<div class="overlay results-overlay"><section class="results-panel"><span class="result-emblem">${icon(win ? 'trophy' : 'shield', 54)}</span><div class="eyebrow">${MODES[state.mode].name} · ${state.map.name}</div><h2>${state.winner === 'draw' ? 'Ничья' : win ? 'Победа' : 'Поражение'}</h2><p>${win ? 'Ваш отряд вписал своё имя в историю.' : 'Каждое поражение — начало новой истории.'}</p><div class="result-stats">${[
    ['swords', 'Убийства', e.stats.kills],
    ['skull', 'Смерти', e.stats.deaths],
    ['flame', 'Урон', Math.round(e.stats.damage)],
    ['heart', 'Лечение', Math.round(e.stats.healing)],
    ['flag', 'Захват', Math.round(e.stats.capture) + ' с'],
  ]
    .map(([i, n, v]) => `<div>${icon(String(i), 20)}<strong>${v}</strong><small>${n}</small></div>`)
    .join(
      '',
    )}</div><div class="reward-row"><span>${icon('coin', 23)}<b>+${reward?.gold ?? 0}</b><small>ЗОЛОТО</small></span><span>${icon('gem', 23)}<b>+${reward?.xp ?? 0}</b><small>ОПЫТ</small></span>${reward?.item ? `<span class="loot-reward" style="color:${RARITIES[ITEM_BY_ID[reward.item].rarity].color}">${icon(ITEM_BY_ID[reward.item].icon, 27)}<b>${ITEM_BY_ID[reward.item].name}</b><small>ДОБЫЧА ИЗ СУНДУКА</small></span>` : ''}</div><div class="level-progress"><span>УРОВЕНЬ ${level}<b>${profile.xp - base} / ${next - base} XP</b></span><div><i style="width:${level === 30 ? 100 : Math.min(100, ((profile.xp - base) / (next - base)) * 100)}%"></i></div></div><div class="result-actions"><button class="secondary" data-action="home">В главное меню</button><button class="primary" data-action="restart">${icon('refresh', 19)} Ещё одно сражение</button></div></section></div>`;
}
export function settings(p: Profile) {
  return `<div class="modal-heading"><span class="eyebrow">ВАШ МИР</span><h2>Настройки</h2></div><div class="setting-row"><span><b>Качество графики</b><small>Тени, эффекты и разрешение</small></span><select data-setting="quality" aria-label="Качество графики">${['low', 'medium', 'high'].map((q, i) => `<option value="${q}" ${p.settings.quality === q ? 'selected' : ''}>${['Низкое', 'Среднее', 'Высокое'][i]}</option>`).join('')}</select></div><div class="setting-row"><span><b>Боевые звуки</b><small>Обратная связь способностей</small></span><button class="toggle ${p.settings.sound ? 'on' : ''}" data-setting="sound" aria-label="Боевые звуки" aria-pressed="${p.settings.sound}"><i></i></button></div><div class="setting-row"><span><b>Сложность ИИ</b><small>Применится к следующему матчу</small></span><select data-setting="difficulty" aria-label="Сложность ИИ">${['easy', 'normal', 'hard'].map((d, i) => `<option value="${d}" ${p.settings.difficulty === d ? 'selected' : ''}>${['Лёгкая', 'Обычная', 'Сложная'][i]}</option>`).join('')}</select></div><div class="notice">${icon('shield', 18)} Прогресс хранится на этом устройстве. Локальные сохранения не защищены от изменения.</div>`;
}
export function guide() {
  return `<div class="modal-heading"><span class="eyebrow">ПЕРЕД СРАЖЕНИЕМ</span><h2>Искусство боя</h2></div><div class="guide-grid"><div>${icon('plus', 24)}<b>Перемещение</b><p>Левый джойстик или WASD. Стрелки также работают.</p></div><div>${icon('swords', 24)}<b>Обычная атака</b><p>Удерживайте большую кнопку атаки или пробел. Цель выбирается автоматически.</p></div><div>${icon('flame', 24)}<b>Способности</b><p>Кнопки 1–4. Для прицеливания протяните палец от кнопки навыка в нужную сторону.</p></div><div>${icon('dash', 24)}<b>Уклонение</b><p>Shift или кнопка рывка. Короткая неуязвимость, перезарядка 5 секунд.</p></div></div><div class="notice">Рейд: очистите 4 зоны и победите Хранителя. Осада: захватите A → B → C. Царь горы: удерживайте центр до 300 очков. Красные кольца предупреждают об опасности.</div><p class="muted">Ультимейт заряжается со временем, от урона и лечения. ESC — пауза. В рейде автоматического возрождения нет; жрец может поднять одного союзника за применение ультимейта.</p>`;
}
