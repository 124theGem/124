import type { AbilityDef, ClassDef, Mode } from '../game/core/types';
import { icon } from './icons';

/** Original layered vector illustrations; every slot keeps its class palette and skill emblem. */
export function abilityArtwork(c: ClassDef, a: AbilityDef, index: number) {
  const id = `art-${a.id}`;
  const shards = Array.from({ length: 9 }, (_, i) => {
    const angle = i * 2.399,
      r = 17 + (i % 3) * 6,
      x = 40 + Math.sin(angle) * r,
      y = 40 + Math.cos(angle) * r;
    return `<path d="m${x} ${y - 3} 2 3-2 6-2-6Z" fill="${i % 2 ? '#fff6cc' : c.color}" opacity="${0.3 + (i % 4) * 0.12}" transform="rotate(${i * 29} ${x} ${y})"/>`;
  }).join('');
  return `<svg class="ability-artwork" viewBox="0 0 80 80" aria-hidden="true"><defs><radialGradient id="${id}-bg"><stop stop-color="${c.color}" stop-opacity=".85"/><stop offset=".55" stop-color="#243b62"/><stop offset="1" stop-color="#080e20"/></radialGradient><linearGradient id="${id}-metal" x2="1" y2="1"><stop stop-color="#fff7cd"/><stop offset=".4" stop-color="${c.color}"/><stop offset="1" stop-color="#987951"/></linearGradient></defs><path d="M1 1h78v78H1Z" fill="url(#${id}-bg)"/><path d="m6 72 18-40 12 16 17-34 21 58Z" fill="#081324" opacity=".5"/><path d="m-5 54 84-42M2 65 78 28M15 80 80 45" stroke="${c.color}" stroke-width="5" opacity=".12"/>${shards}<circle cx="40" cy="38" r="24" fill="none" stroke="${c.color}" opacity=".35" stroke-dasharray="2 5"/><g transform="translate(17 16)" color="#070e1a" opacity=".9">${icon(a.icon, 48)}</g><g transform="translate(16 13)" color="#fff2c9">${icon(a.icon, 48)}</g><path d="M4 17V4h14M62 4h14v14M4 62v14h14M62 76h14V62" fill="none" stroke="url(#${id}-metal)" stroke-width="2"/><path d="m40 3 4 4-4 4-4-4Zm0 66 4 4-4 4-4-4Z" fill="${a.ultimate ? '#ffde82' : c.color}"/><path d="M8 8h64v64H8Z" fill="none" stroke="#d6c295" stroke-opacity=".2"/><text x="69" y="68" text-anchor="middle" fill="#fff5c9" font-size="8" font-family="serif">${['I', 'II', 'III', 'IV'][index]}</text></svg>`;
}
export function locationArtwork(mode: Mode) {
  const sky = mode === 'raid' ? '#527f9c' : mode === 'siege' ? '#c77b67' : '#6d9b97';
  const towers =
    mode === 'siege'
      ? '<path d="M130 160V72h14v14h16V72h14v88m88 0V58h16v14h16V58h16v102"/><path d="M170 156V96h96v64h-36v-28q-14-24-28 0v24Z"/>'
      : mode === 'raid'
        ? '<path d="M130 164V69h24v95m94 0V69h24v95M145 73q58-65 115 0v20q-58-57-115 0Z"/><path d="M164 174v-47q37-49 74 0v47" fill="#0c2440"/>'
        : '<path d="m144 166 56-30 57 30-57 28Z"/><path d="m163 139 37-19 38 19-38 22Z"/><path d="m190 126 10-66 12 66-12 12Z" fill="#95e9e4"/>';
  const foreground = Array.from({ length: 12 }, (_, i) => {
    const x = i * 39 - 15,
      y = 178 + (i % 3) * 9;
    return `<path d="m${x} 220 10-32 5 11 7-30 13 34 8-12 9 29Z" fill="${mode === 'siege' ? '#362d3b' : '#173f40'}"/>`;
  }).join('');
  return `<svg class="map-illustration illustrated-location" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="scene-${mode}" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#182941"/></linearGradient></defs><path d="M0 0h400v220H0Z" fill="url(#scene-${mode})"/><circle cx="310" cy="48" r="24" fill="#f9deb0" opacity=".65"/><path d="m0 130 50-63 35 38 46-64 48 76 55-85 72 85 43-51 51 65v89H0Z" fill="#22364a" opacity=".65"/><path d="m0 179 150-42 250 24v59H0Z" fill="${mode === 'siege' ? '#7a5f59' : '#4d7564'}"/><path d="m190 164 24-1 58 57H132Z" fill="#c2b18a" opacity=".7"/><g fill="${mode === 'siege' ? '#b99c87' : '#c9bd95'}" stroke="#e6d9b8" stroke-width="1.5">${towers}</g><g fill="#8e785f" stroke="#b7a281"><path d="m61 178 9-12 22 8-2 9Z"/><path d="m287 186 13-17 23 9-2 11Z"/><path d="m104 195 11-11 17 6-4 9Z"/></g><g fill="${mode === 'siege' ? '#bc4552' : '#3d9eb4'}"><path d="M153 92v39l15-9V92Zm103 4v34l16 8V96Z"/></g><g fill="#ffd48b"><circle cx="120" cy="155" r="3"/><circle cx="280" cy="155" r="3"/><path d="m118 152 2-10 3 10Zm160 0 2-10 3 10Z"/></g>${foreground}<path d="M10 27V10h24m332 0h24v17M10 193v17h24m332 0h24v-17" fill="none" stroke="#e0cd9c" opacity=".6"/></svg>`;
}
