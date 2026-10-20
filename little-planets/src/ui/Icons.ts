import { ALL_RESOURCE_LABELS } from "../../shared/resources";
const shapes: Record<string, string> = {
  wood: '<path fill="#966344" d="M7 8 24 4l4 17-17 5z"/><path fill="#c89966" d="M7 8 11 26l8-3-4-17z"/><ellipse cx="19" cy="22" rx="10" ry="6" fill="#e6bc86"/><ellipse cx="19" cy="22" rx="6" ry="3.4" fill="none" stroke="#a67449" stroke-width="1.4"/><path d="m6 12 3 9m9-13 2 7" stroke="#654b3c" stroke-width="2"/>',
  stone:
    '<path fill="#8198a8" d="m4 24 2-13L16 5l10 5 4 13-8 5H10z"/><path fill="#bccbd1" d="m6 11 10-6 4 10-9 4z"/><path fill="#6a7e90" d="m20 15 6-5 4 13-8 5z"/><path fill="#a1b5bf" d="m11 19 9-4 2 13H10l-6-4z"/>',
  crystal:
    '<path fill="#358ea9" d="m4 18 3-9 7 2 3-8 8 5 4 11-12 11z"/><path fill="#8be5eb" d="m7 9 7 2-3 8-7-1zm10-6 8 5-9 10-2-7z"/><path fill="#52bdce" d="m16 18 9-10 4 11-12 11z"/><path fill="#b8f7ed" d="m11 19 5-1 1 12z"/>',
  spores:
    '<path fill="#d9bdf0" d="m13 14-2 13q5 5 10 0l-2-13z"/><path fill="#9e6acf" d="M2 16Q4 2 16 3q12 1 14 13-13 7-28 0"/><path fill="#c99af0" d="M2 16Q4 2 16 3l-2 15z"/><circle fill="#f5d7f7" cx="10" cy="11" r="2"/><circle fill="#f5d7f7" cx="22" cy="12" r="2.5"/>',
  obsidian:
    '<path fill="#3e3b55" stroke="#83788f" d="m5 27 3-18 7 5 6-11 6 7 2 17-12 3z"/><path fill="#817790" d="m8 9 7 5-3 12zm13-6 6 7-7 14z"/><path fill="#a595ad" d="m21 3 2 12-3 9z"/>',
  thermal:
    '<path fill="#ef8851" d="M16 2q2 8 7 11l1-6q12 16 1 23H9Q-1 20 10 10l-1 9q7-4 7-17"/><path fill="#ffca72" d="M17 13q-1 6 4 7 3 8-4 10-8-1-6-8 6-3 6-9"/><path fill="#fff0b4" d="m17 23 2 6h-4z"/>',
};
export function resourceIcon(id: string) {
  let shape = shapes[id];
  if (!shape && ALL_RESOURCE_LABELS[id]) {
    const symbol: Record<string, string> = {
      iron: "Fe",
      quartz: "Si",
      copper: "Cu",
      silicon: "Si",
      carbon: "C",
      titanium: "Ti",
      cobalt: "Co",
      nickel: "Ni",
      aluminium: "Al",
      lithium: "Li",
      uranium: "U",
      gold: "Au",
      silver: "Ag",
      platinum: "Pt",
      ice: "H₂O",
      hydrogen: "H",
      helium: "He",
      sulfur: "S",
      salt: "Na",
      amber: "Am",
      biomass: "Bio",
      iridium: "Ir",
      osmium: "Os",
      xenon: "Xe",
    };
    let hash = 0;
    for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    const hue = 140 + (hash % 160);
    shape = `<path d="M16 2 28 9v14l-12 7L4 23V9Z" fill="hsl(${hue} 27% 24%)" stroke="hsl(${hue} 46% 68%)"/><path d="M8 10V8l8-4 8 4v2M8 22v2l8 4 8-4v-2" fill="none" stroke="hsl(${hue} 46% 68%)" opacity=".5"/><text x="16" y="20" text-anchor="middle" font-family="monospace" font-size="${(symbol[id] ?? id.slice(0, 2)).length > 2 ? 8 : 11}" fill="hsl(${hue} 48% 83%)">${symbol[id] ?? id.slice(0, 2).toUpperCase()}</text>`;
  }
  return shape
    ? `<svg class="item-art" viewBox="0 0 32 32" aria-hidden="true">${shape}</svg>`
    : "";
}
