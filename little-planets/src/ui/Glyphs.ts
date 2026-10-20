const paths: Record<string, string> = {
  inventory: "M4 7h16v13H4zM8 7V4h8v3M4 12h16M9 15h6",
  craft: "m4 19 9-9m-1-6 4 4 4-1-3 6-5-5-6 3 1-4ZM3 20l2 1 2-2-2-2Z",
  garden:
    "M12 21V10M12 15C4 16 3 10 3 6c7 0 10 3 9 9Zm0-4c0-6 4-8 9-8 0 6-3 9-9 8Z",
  build: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
  automation:
    "M5 7h14v12H5zM9 11h1m4 0h1M9 15h6M12 7V3m-2 0h4M2 11v5m20-5v5M8 19v3m8-3v3",
  galaxy:
    "M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  settings:
    "M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  profile: "M8 8a4 4 0 1 1 8 0 4 4 0 0 1-8 0ZM4 21v-3c0-4 16-4 16 0v3",
  ship: "m12 2 5 9 4 5-7-2-2 7-2-7-7 2 4-5ZM10 10h4M7 20l-2 2m12-2 2 2",
  pickaxe: "m4 5 15 14M3 10l4-6 6-1 5 3M14 5l5 5",
  grapple: "M4 20 15 9m-4-5 9 9m-9-9h9v9M4 15l5 5",
  sword: "m5 3 14 14m-1-14L7 14l3 3L21 6V3ZM4 13l7 7M3 21l4-4",
  spear: "m3 21 13-13m-3-1 8-4-4 8Z",
  blaster: "M3 9h16l3 3H9v7H5v-7H3ZM16 7v2M10 12v3h3",
  none: "M7 13V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v8l-3 6H9l-5-6a2 2 0 0 1 3-2Z",
  view: "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6M7 12s4-6 10 0c-6 6-10 0-10 0Z",
  planet:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 6-5 12 0 18 5-6 5-12 0-18Z",
  audio: "M4 9h4l5-5v16l-5-5H4ZM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  muted: "M4 9h4l5-5v16l-5-5H4ZM17 9l5 6m0-6-5 6",
  block: "m12 2 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5m-9 5v10",
  menu: "M3 5h18M3 12h18M3 19h18",
  close: "m5 5 14 14M19 5 5 19",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  scanner: "M12 21v-9M6 21h12M4 4c-3 6 6 15 12 12ZM12 12l7-7m-3-2c3 0 5 2 5 5",
  planetdrill: "M3 4h18l-3 12H6ZM6 8h12M8 16l4 6 4-6M12 16v6",
  shipyard: "M3 21V5h4v12h10V5h4v16ZM7 5h10M10 10h4",
  health: "M12 21 3 12C-2 4 8-1 12 6c4-7 14-2 9 6ZM8 12h3l1-3 1 6 1-3h2",
  levels: "m3 18 4-4 4 2 8-11M14 5h5v5",
  shield: "m12 2 9 4-2 10-7 6-7-6L3 6ZM8 12l3 3 5-6",
  resource: "m12 2 8 6-3 13H7L4 8ZM4 8h16M8 8l4 13 4-13M12 2 8 8m4-6 4 6",
  house: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
  laboratory: "M8 3h8m-6 0v7L4 20h16l-6-10V3M7 15h10",
  greenhouse: "M3 10 9-7 9 7v11H3ZM8 7v14m8-14v14M3 13h18",
  warehouse: "M3 8 12 3l9 5v13H3ZM7 21V11h10v10M7 15h10",
  extractor: "M4 21 7 3h10l3 18M5 16h14M6 11h12M7 6h10M12 3v18",
  bioextractor: "M4 21V10h16v11ZM8 10V5c5 0 8 2 8 5M12 10V3",
  hunter: "M5 4h14v8H5ZM9 7h6M7 12v8H4m13-8v8h3M2 7v9m20-9v9",
  drone:
    "M8 9h8v7H8ZM3 4h4v4H3Zm14 0h4v4h-4ZM3 17h4v4H3Zm14 0h4v4h-4ZM7 8l2 2m6 0 2-2M7 17l2-2m6 0 2 2",
  crawler:
    "M6 6h12v9H6ZM5 15h14a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6ZM6 18h1m4 0h1m4 0h1",
  refinery: "M4 21V7h5v6l5-4v4l6-4v12ZM6 3h3v4M8 17h1m5 0h1",
};
export function hudIcon(name: string, extra = "") {
  const key = name === "headquarters" ? "house" : name;
  return `<svg class="ui-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key] ?? paths.resource}"/></svg>`;
}
