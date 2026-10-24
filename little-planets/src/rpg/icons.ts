const paths: Record<string, string> = {
  sword: "m5 19 12-12 2-4-4 2L3 17m1-3 6 6m-5-1-2 2m10-8 3 3",
  bag: "M5 8h14l1 13H4L5 8Zm3 0V6a4 4 0 0 1 8 0v2m-8 5h8",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm0 4v9m-4-5h8",
  map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16",
  scroll: "M7 3h13v3h-3v13c0 3-5 3-5 0H4v-3h8M7 3v13m10-10H7m3 3h4m-4 3h4",
  flame:
    "M12 2c2 6 8 8 8 13a8 8 0 0 1-16 0c0-3 2-6 5-9-1 5 3 5 3 8 3-3 1-7 0-12Z",
  star: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9L12 3Z",
  coin: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-6-4h-3l-2 4h6l-2 4h-3",
  heart:
    "M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z",
  bolt: "m13 2-9 12h7l-1 8 10-13h-7l0-7Z",
  potion: "M9 3h6m-5 0v6l-5 8c-1 2 0 4 2 4h10c2 0 3-2 2-4l-5-8V3M7 15h10",
  arrow: "m5 12 14 0m-6-6 6 6-6 6",
  close: "m6 6 12 12M6 18 18 6",
  sound: "m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  mute: "m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m-6 0 6-6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3-1 3 4-2 3 2 3-3 4-3-1-1 3h-4l-1-3-3 1-3-4 2-3-2-3 3-4 3 1 1-3Z",
  check: "m5 12 4 4L19 6",
  chevron: "m9 5 7 7-7 7",
  skull: "M6 17v-2a8 8 0 1 1 12 0v2h-3v4H9v-4H6Zm2-7h1m6 0h1m-4 3v1",
  camp: "m3 17 9-14 9 14H3Zm9-14v14m-7 4 14-3m-14 0 14 3",
  hand: "M7 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v10c0 5-3 7-7 7-3 0-5-2-6-4l-3-5c-1-2 1-3 3-1l1 1",
  boots: "M6 3h6v10l6 3v5H4v-6l2-12Zm0 5h6m-8 9h14",
  ring: "M19 14a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM8 3h8l2 4-6 5-6-5 2-4Z",
  pause: "M8 4v16m8-16v16",
};
export function icon(name: string, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.star}"/></svg>`;
}
