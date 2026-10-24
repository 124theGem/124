import {
  CLASSES,
  Dungeon,
  RARITIES,
  RPG,
  TILE,
  type HeroClass,
  type Item,
  type Prop,
} from "./model";

type Ctx = CanvasRenderingContext2D;
export const noise = (x: number, y: number, seed = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
const box = (
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};
const line = (
  c: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
) => {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
};
function polygon(c: Ctx, points: number[][], color: string, stroke?: string) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.stroke();
  }
}
const spriteCache = new Map<string, HTMLCanvasElement>();
export function sprite(
  name: string,
  variant = 0,
  cls: HeroClass = "knight",
): HTMLCanvasElement {
  const key = `${name}-${variant}-${cls}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 56;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  c.translate(24, 44);
  const p = (x: number, y: number, w: number, h: number, color: string) =>
    box(c, x, y, w, h, color);
  if (["hero", "merchant", "skeleton", "warden"].includes(name)) {
    const frame = variant % 2,
      bone = name === "skeleton" || name === "warden",
      boss = name === "warden";
    if (boss) c.scale(1.35, 1.35);
    if (bone) {
      p(-8, -15, 4, 11, "#302b29");
      p(3, -15, 4, 11, "#302b29");
      p(-7, -13, 2, 10 - frame * 2, "#b5a58d");
      p(4, -13, 2, 8 + frame * 2, "#c6b79c");
      p(-10, -3 - frame * 2, 7, 3, "#d1c2a9");
      p(3, -3 + frame * 2, 7, 3, "#d1c2a9");
      p(-7, -26, 14, 13, "#322c2c");
      p(-5, -26, 10, 14, "#a19785");
      p(-1, -25, 2, 14, "#e0d1b5");
      for (let i = 0; i < 3; i++) {
        p(-6, -25 + i * 4, 12, 2, "#d7c8ad");
        p(-4, -23 + i * 4, 8, 1, "#52483e");
      }
      p(-10, -26, 4, 5, "#d6c3a6");
      p(-12, -23, 3, 10, "#ab9c86");
      p(-13, -15, 4, 4, "#dfcfb1");
      p(7, -26, 4, 5, "#d8c9ad");
      p(10, -22, 3, 11, "#a99b85");
      p(9, -13, 5, 3, "#deccaa");
      p(-7, -41, 14, 13, "#302a2a");
      p(-8, -39, 16, 9, "#ae9d87");
      p(-6, -41, 12, 11, "#d5c5a6");
      p(-4, -42, 8, 3, "#ebdfc4");
      p(-5, -36, 4, 4, "#352c2b");
      p(2, -36, 4, 4, "#352c2b");
      p(-4, -36, 2, 2, boss ? "#f8764f" : "#a85d4e");
      p(3, -36, 2, 2, boss ? "#f8764f" : "#a85d4e");
      p(-1, -32, 2, 2, "#514037");
      p(-4, -29, 8, 3, "#c9b79a");
      for (let i = -3; i < 4; i += 2) p(i, -29, 1, 2, "#55483c");
      p(13, -28, 2, 21, "#72533c");
      polygon(
        c,
        [
          [11, -27],
          [15, -39],
          [17, -28],
          [15, -16],
        ],
        boss ? "#bd7655" : "#8e9b9a",
        "#363436",
      );
      p(12, -16, 7, 2, "#c6a267");
      if (boss) {
        p(-10, -30, 20, 5, "#514653");
        p(-9, -28, 4, 12, "#756277");
        p(6, -28, 4, 12, "#756277");
        p(-9, -44, 18, 3, "#ae8750");
        p(-8, -48, 3, 6, "#d2af6b");
        p(-1, -50, 3, 8, "#e4c88a");
        p(6, -48, 3, 6, "#d2af6b");
      }
    } else {
      const merchant = name === "merchant",
        cloak = merchant
          ? "#57665b"
          : cls === "mage"
            ? "#6b5486"
            : cls === "ranger"
              ? "#52765c"
              : "#4f7881";
      polygon(
        c,
        [
          [-9, -28],
          [8, -28],
          [12, -7],
          [-12, -8],
        ],
        "#26232b",
      );
      polygon(
        c,
        [
          [-8, -28],
          [8, -28],
          [11, -9],
          [-11, -9],
        ],
        cloak,
      );
      p(-7, -17, 14, 3, "#684936");
      p(-2, -17, 4, 3, "#d4ab63");
      p(-8, -10, 5, 8 - frame * 2, "#362e2d");
      p(3, -10, 5, 6 + frame * 2, "#362e2d");
      p(-10, -3 - frame * 2, 7, 4, "#674a39");
      p(3, -3 + frame * 2, 8, 4, "#674a39");
      p(-10, -3 - frame * 2, 7, 1, "#9b7350");
      p(-12, -28, 6, 7, "#b0aa94");
      p(6, -28, 6, 7, "#b0aa94");
      p(-12, -22, 5, 8, "#687778");
      p(8, -22, 4, 9, "#687778");
      p(-12, -15, 5, 5, "#e7b27c");
      p(9, -15, 4, 5, "#e7b27c");
      p(-8, -40, 16, 13, "#3c2e2c");
      p(-7, -39, 14, 12, "#d58d59");
      p(-6, -39, 12, 9, "#f1bb7e");
      p(-5, -36, 3, 2, "#4b3f3d");
      p(3, -36, 2, 2, "#4b3f3d");
      p(-4, -37, 2, 1, "#fff0c9");
      p(3, -37, 2, 1, "#fff0c9");
      p(-2, -31, 5, 1, "#a55e44");
      if (merchant) {
        p(-10, -43, 20, 5, "#587363");
        p(-7, -47, 14, 6, "#789078");
        p(-11, -40, 22, 2, "#b99a63");
        p(-5, -31, 10, 6, "#c7b898");
        p(-3, -28, 6, 5, "#e0d2b2");
        p(-1, -26, 2, 3, "#e8dbc1");
      } else {
        p(-9, -42, 18, 5, "#8c4f2e");
        p(-8, -44, 14, 5, "#c9813b");
        p(-5, -46, 9, 5, "#e7a74c");
        p(-9, -39, 3, 8, "#b77032");
        p(6, -40, 4, 7, "#9f5e2e");
        p(-5, -43, 4, 3, "#ffd081");
        p(2, -44, 3, 3, "#f7c46b");
        p(-10, -43, 4, 3, "#e5a24b");
        if (cls === "mage") {
          p(14, -38, 2, 32, "#8b6542");
          p(12, -41, 6, 7, "#8d6dc1");
          p(13, -42, 4, 3, "#dfbaff");
          p(14, -41, 2, 2, "#f6e6ff");
        } else if (cls === "ranger") {
          c.strokeStyle = "#c99b56";
          c.lineWidth = 2;
          c.beginPath();
          c.ellipse(13, -22, 8, 17, -0.15, -Math.PI / 2, Math.PI / 2);
          c.stroke();
          line(c, 14, -39, 14, -5, "#b1ae8e");
        } else {
          polygon(
            c,
            [
              [14, -35],
              [17, -40],
              [19, -35],
              [17, -13],
              [14, -13],
            ],
            "#bfc7c1",
            "#383b3a",
          );
          p(16, -35, 1, 20, "#f3e9cd");
          p(12, -14, 10, 3, "#c99d55");
          p(15, -11, 3, 7, "#72503a");
          polygon(
            c,
            [
              [-16, -24],
              [-8, -24],
              [-7, -14],
              [-12, -9],
              [-18, -14],
            ],
            "#947748",
            "#302b2b",
          );
          polygon(
            c,
            [
              [-15, -22],
              [-10, -22],
              [-9, -15],
              [-12, -12],
              [-16, -15],
            ],
            "#6e8c88",
          );
          p(-14, -21, 2, 7, "#c4b58a");
        }
      }
    }
  } else if (name === "slime") {
    const h = variant % 2 ? 17 : 20;
    polygon(
      c,
      [
        [-13, -3],
        [-15, -10],
        [-10, -h],
        [0, -h - 4],
        [10, -h],
        [15, -9],
        [12, -2],
      ],
      "#4a6351",
      "#272c2b",
    );
    polygon(
      c,
      [
        [-11, -5],
        [-10, -13],
        [-6, -h + 2],
        [4, -h + 1],
        [11, -10],
        [9, -4],
      ],
      "#7c9f66",
    );
    p(-8, -h + 5, 5, 3, "#b1c783");
    p(-5, -11, 2, 3, "#293b36");
    p(5, -11, 2, 3, "#293b36");
    p(-3, -5, 7, 1, "#536e4e");
  } else if (name === "barrel") {
    p(-9, -28, 18, 27, "#322727");
    p(-11, -24, 22, 19, "#483029");
    p(-9, -26, 18, 23, "#92603e");
    p(-8, -27, 16, 4, "#b48250");
    for (let x = -8; x < 9; x += 4) {
      p(x, -23, 1, 20, "#543928");
      p(x + 1, -23, 1, 19, "#ba8452");
    }
    p(-11, -22, 22, 3, "#4a5050");
    p(-10, -21, 20, 1, "#979583");
    p(-11, -9, 22, 3, "#454a49");
    p(-10, -8, 20, 1, "#9b9984");
    p(-8, -28, 16, 2, "#d3a268");
    p(-6, -27, 12, 1, "#68442e");
  } else if (name === "crate") {
    polygon(
      c,
      [
        [-14, -26],
        [7, -29],
        [16, -23],
        [-5, -19],
      ],
      "#ad7d48",
      "#30272a",
    );
    polygon(
      c,
      [
        [-14, -26],
        [-5, -20],
        [-5, -1],
        [-14, -6],
      ],
      "#6e472e",
      "#30272a",
    );
    polygon(
      c,
      [
        [-5, -20],
        [16, -23],
        [16, -5],
        [-5, -1],
      ],
      "#95633c",
      "#30272a",
    );
    for (let x = -2; x < 15; x += 5) line(c, x, -19, x, -4, "#5c3d2d");
    line(c, -4, -19, 15, -22, "#cf9a5c", 2);
    line(c, -4, -3, 15, -6, "#c89455", 2);
    line(c, -4, -19, 14, -6, "#c28f52", 3);
    line(c, -4, -3, 14, -22, "#b9864b", 3);
    p(-14, -25, 3, 18, "#b3824b");
    p(13, -23, 3, 19, "#c18f52");
    p(-5, -21, 3, 20, "#5c492f");
    p(12, -22, 4, 3, "#a9a288");
    p(12, -7, 4, 3, "#a9a288");
  } else if (name === "mushrooms") {
    for (const [x, y, h] of [
      [-6, -1, 9],
      [3, 0, 14],
      [10, 0, 7],
    ]) {
      p(x, y - h, 2, h, "#b4a38e");
      polygon(
        c,
        [
          [x - 5, y - h],
          [x - 4, y - h - 3],
          [x, y - h - 6],
          [x + 5, y - h - 3],
          [x + 6, y - h],
        ],
        "#a65e5b",
        "#49333c",
      );
      p(x - 3, y - h - 2, 9, 2, "#c47c76");
      p(x, y - h - 5, 2, 2, "#e4b6a2");
    }
  } else if (name === "ore") {
    for (let i = 0; i < 8; i++) {
      const x = noise(i, 4) * 27 - 14,
        y = -noise(i, 8) * 28;
      polygon(
        c,
        [
          [x - 4, y - 4],
          [x, y - 8],
          [x + 5, y - 5],
          [x + 6, y],
          [x, y + 4],
          [x - 5, y + 1],
        ],
        "#756758",
        "#30292a",
      );
      line(c, x - 2, y - 5, x + 2, y - 6, "#a28a69");
      if (i % 2) {
        p(x, y - 3, 3, 4, "#b79953");
        p(x, y - 3, 2, 2, "#e8cb82");
      }
    }
  } else if (name === "chest") {
    p(-15, -22, 30, 21, "#302326");
    p(-14, -20, 28, 17, "#7b492d");
    p(-13, -23, 26, 8, "#a67440");
    p(-11, -25, 22, 3, "#bd9552");
    for (let x = -10; x < 13; x += 6) p(x, -22, 1, 18, "#513a2b");
    p(-15, -17, 30, 3, "#c9a255");
    p(-13, -23, 3, 20, "#d1ac65");
    p(10, -23, 3, 20, "#d1ac65");
    p(-14, -5, 28, 3, "#a17e44");
    p(-3, -19, 6, 8, "#e4c274");
    p(-1, -16, 2, 3, "#40332c");
    if (variant) {
      p(-11, -24, 22, 7, "#30252b");
      p(-15, -31, 30, 10, "#936035");
      p(-15, -31, 30, 2, "#e0b56a");
      p(-13, -30, 3, 8, "#c9a255");
      p(10, -30, 3, 8, "#c9a255");
    }
  } else if (name === "torch") {
    p(-3, -19, 7, 17, "#33292b");
    p(-2, -24, 4, 20, "#836042");
    p(-5, -24, 10, 4, "#454344");
    p(-4, -23, 8, 2, "#ac9874");
    polygon(
      c,
      [
        [-4, -25],
        [-6, -31],
        [-3, -36],
        [0, -43 - variant * 2],
        [3, -36],
        [6, -31],
        [3, -25],
      ],
      "#d26831",
    );
    polygon(
      c,
      [
        [-3, -26],
        [-3, -33],
        [0, -39 + variant],
        [4, -31],
        [2, -26],
      ],
      "#f5ab48",
    );
    p(-1, -34, 3, 8, "#ffe6a0");
    p(-2, -30, 5, 4, "#ffecc0");
  } else if (name === "crystal") {
    polygon(
      c,
      [
        [-16, -2],
        [-10, -7],
        [11, -8],
        [18, -1],
        [9, 3],
        [-9, 3],
      ],
      "#3c3b47",
    );
    polygon(
      c,
      [
        [-7, -4],
        [-10, -20],
        [-4, -31],
        [1, -20],
        [-1, -4],
      ],
      "#74508d",
      "#3e304f",
    );
    polygon(
      c,
      [
        [-3, -3],
        [-3, -35],
        [4, -44],
        [11, -32],
        [8, -4],
      ],
      "#ab7ac1",
      "#493254",
    );
    polygon(
      c,
      [
        [-1, -34],
        [4, -41],
        [4, -7],
        [0, -4],
      ],
      "#d7a4e3",
    );
    polygon(
      c,
      [
        [10, -3],
        [10, -20],
        [15, -26],
        [19, -18],
        [16, -2],
      ],
      "#8c68ad",
    );
    line(c, 4, -39, 8, -32, "#f7d2f5", 2);
  } else if (name === "bones") {
    p(-9, -5, 17, 2, "#a4977e");
    p(-11, -6, 3, 4, "#bbaa8b");
    p(6, -6, 4, 4, "#bbaa8b");
    p(-1, -12, 9, 8, "#9a8e7a");
    p(0, -13, 7, 6, "#b7a98e");
    p(0, -10, 2, 2, "#39322e");
    p(5, -10, 2, 2, "#39322e");
    line(c, -10, -11, 9, 1, "#b4a38a", 2);
  } else if (name === "stairs") {
    p(-19, -26, 38, 29, "#24232a");
    for (let i = 0; i < 5; i++) {
      p(
        -17,
        -23 + i * 5,
        34,
        4,
        ["#433b3b", "#514743", "#61524a", "#766050", "#8d745b"][i],
      );
      p(-17, -23 + i * 5, 34, 1, "#a18a69");
    }
    p(-20, -27, 4, 31, "#54443e");
    p(17, -27, 4, 31, "#54443e");
  }
  spriteCache.set(key, canvas);
  return canvas;
}

export function drawItem(
  c: Ctx,
  item: Pick<Item, "slot" | "rarity">,
  x: number,
  y: number,
  size = 32,
) {
  c.save();
  c.translate(x, y);
  c.scale(size / 32, size / 32);
  const color = RARITIES[item.rarity].color;
  if (item.slot === "weapon") {
    c.rotate(0.65);
    box(c, -3, -16, 6, 24, "#332b37");
    polygon(
      c,
      [
        [-2, -14],
        [0, -19],
        [3, -14],
        [3, 5],
        [-2, 5],
      ],
      "#b4c6c4",
    );
    box(c, 0, -14, 2, 18, "#f3e4c5");
    box(c, -7, 3, 14, 3, color);
    box(c, -1, 6, 3, 8, "#856147");
    box(c, -2, 13, 5, 3, color);
  }
  if (item.slot === "armor") {
    polygon(
      c,
      [
        [-6, -13],
        [-13, -8],
        [-11, -1],
        [-7, -3],
        [-8, 11],
        [8, 11],
        [7, -3],
        [11, -1],
        [13, -8],
        [6, -13],
        [3, -8],
        [-3, -8],
      ],
      "#3a3945",
      "#24232d",
    );
    polygon(
      c,
      [
        [-6, -10],
        [-10, -7],
        [-8, -4],
        [-5, -5],
        [-5, 8],
        [5, 8],
        [5, -5],
        [8, -4],
        [10, -7],
        [6, -10],
        [3, -6],
        [-3, -6],
      ],
      color,
    );
    box(c, -3, -4, 6, 8, "#78929a");
    box(c, -5, 5, 10, 2, "#e3bc70");
  }
  if (item.slot === "ring") {
    c.strokeStyle = "#493a2f";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, 2, 9, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = "#d4ad65";
    c.lineWidth = 3;
    c.stroke();
    polygon(
      c,
      [
        [-5, -6],
        [-3, -12],
        [3, -12],
        [5, -6],
        [0, -2],
      ],
      color,
      "#dfc48e",
    );
    box(c, -1, -10, 2, 3, "#f7e7df");
  }
  if (item.slot === "boots") {
    for (const x of [-11, 2]) {
      box(c, x, -11, 8, 19, "#48372f");
      box(c, x + 1, -10, 6, 16, color);
      box(c, x - 2, 5, 10, 6, "#93734f");
      box(c, x - 2, 9, 10, 2, "#b59664");
      box(c, x + 1, -5, 6, 2, "#cfab72");
    }
  }
  c.restore();
}
export function itemURL(slot: Item["slot"], rarity: Item["rarity"] = "rare") {
  const key = `item-${slot}-${rarity}`;
  let canvas = spriteCache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    drawItem(c, { slot, rarity }, 32, 33, 44);
    spriteCache.set(key, canvas);
  }
  return canvas.toDataURL();
}

export class DungeonView {
  private ctx: Ctx;
  private terrain: HTMLCanvasElement;
  private floor = 0;
  private w = 1;
  private h = 1;
  private scale = 1.8;
  private camera = { x: 0, y: 0 };
  private initialized = false;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly game: RPG,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.terrain = document.createElement("canvas");
    this.bake(game.dungeon);
  }
  worldAt(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.w / 2) / this.scale + this.camera.x,
      y: (clientY - r.top - this.h / 2) / this.scale + this.camera.y,
    };
  }
  private bake(d: Dungeon) {
    this.floor = d.floor;
    this.terrain.width = d.width * TILE;
    this.terrain.height = d.height * TILE;
    const c = this.terrain.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#16151c";
    c.fillRect(0, 0, this.terrain.width, this.terrain.height);
    for (let y = 0; y < d.height; y++)
      for (let x = 0; x < d.width; x++) {
        const t = d.tile(x, y),
          px = x * TILE,
          py = y * TILE,
          n = noise(x, y, d.floor);
        if (t > 0) {
          box(c, px, py, TILE, TILE, n > 0.5 ? "#594437" : "#554033");
          if (t === 2) {
            box(c, px, py, TILE, TILE, "#352a29");
            for (let k = 0; k < 4; k++) {
              const v = noise(x, y, k);
              box(
                c,
                px + k * 8 + 1,
                py,
                7,
                31,
                ["#956039", "#a16a3e", "#ad7545", "#8e5834"][Math.floor(v * 4)],
              );
              box(c, px + k * 8 + 1, py, 1, 30, "#c58b51");
              line(
                c,
                px + k * 8 + 4,
                py + 3,
                px + k * 8 + 4,
                py + 27,
                "#825233",
              );
              box(c, px + k * 8 + 3, py + 3, 2, 2, "#47372b");
              box(c, px + k * 8 + 3, py + 27, 2, 2, "#47372b");
            }
            if (y % 3 === 0) {
              box(c, px, py, 32, 3, "#5e402d");
              box(c, px, py, 32, 1, "#d19b5c");
            }
          } else {
            for (let k = 0; k < 22; k++) {
              const nx = noise(x + k, y, 2),
                ny = noise(x, y + k, 9);
              box(
                c,
                px + nx * 30,
                py + ny * 30,
                noise(x, k) > 0.7 ? 2 : 1,
                1,
                k % 2 ? "#6c5140" : "#47372f",
              );
            }
            if (n > 0.66) {
              const rx = px + 6 + n * 14,
                ry = py + 8 + noise(y, x) * 12;
              polygon(
                c,
                [
                  [rx - 5, ry],
                  [rx - 3, ry - 4],
                  [rx + 3, ry - 5],
                  [rx + 6, ry - 1],
                  [rx + 4, ry + 3],
                  [rx - 3, ry + 3],
                ],
                "#332d2c",
              );
              polygon(
                c,
                [
                  [rx - 4, ry - 1],
                  [rx - 2, ry - 5],
                  [rx + 3, ry - 5],
                  [rx + 5, ry - 2],
                  [rx + 2, ry + 1],
                  [rx - 3, ry + 1],
                ],
                n > 0.8 ? "#817569" : "#736558",
              );
              box(c, rx - 2, ry - 4, 4, 1, "#a18c73");
            }
            if (n < 0.08) {
              for (let j = 0; j < 5; j++) {
                const xx = px + 10 + j * 3;
                line(
                  c,
                  xx,
                  py + 26,
                  xx - 2,
                  py + 18 - (j % 3) * 3,
                  "#677351",
                  2,
                );
                box(c, xx - 2, py + 18 - (j % 3) * 3, 2, 2, "#91a069");
              }
            }
          }
          // Contact shadows keep the soil inset beneath the surrounding stone.
          if (!d.tile(x - 1, y)) {
            box(c, px, py, 8, 32, "#16121b30");
            box(c, px, py, 3, 32, "#16121b35");
          }
          if (!d.tile(x + 1, y)) box(c, px + 27, py, 5, 32, "#16121b35");
          if (!d.tile(x, y - 1)) {
            box(c, px, py, 32, 10, "#16121b40");
            box(c, px, py, 32, 4, "#16121b40");
          }
        } else {
          let near = false;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (d.tile(x + dx, y + dy) > 0) near = true;
          if (!near) continue;
          box(c, px, py + 7, 32, 30, "#242026");
          for (let row = 0; row < 3; row++)
            for (let col = 0; col < 3; col++) {
              const rx = px + col * 11 + (row % 2 ? -3 : 0),
                ry = py + row * 12,
                shade = noise(x * 3 + col, y * 3 + row);
              const colr = [
                "#77604e",
                "#886a50",
                "#967452",
                "#6e5749",
                "#a17c56",
              ][Math.floor(shade * 5)];
              polygon(
                c,
                [
                  [rx + 2, ry + 1],
                  [rx + 8, ry],
                  [rx + 11, ry + 4],
                  [rx + 10, ry + 10],
                  [rx + 6, ry + 14],
                  [rx, ry + 11],
                  [rx - 1, ry + 5],
                ],
                "#332b2b",
                "#211f25",
              );
              polygon(
                c,
                [
                  [rx + 2, ry + 1],
                  [rx + 8, ry],
                  [rx + 10, ry + 4],
                  [rx + 8, ry + 8],
                  [rx + 3, ry + 9],
                  [rx, ry + 5],
                ],
                colr,
              );
              line(
                c,
                rx + 2,
                ry + 2,
                rx + 7,
                ry + 1,
                shade > 0.5 ? "#bd9262" : "#9b7a57",
              );
              line(c, rx + 1, ry + 9, rx + 3, ry + 12, "#4b3d34");
              if (shade > 0.6) {
                line(c, rx + 7, ry + 2, rx + 5, ry + 5, "#57473b");
                line(c, rx + 5, ry + 5, rx + 7, ry + 7, "#57473b");
              }
              if (shade < 0.17) box(c, rx + 3, ry + 4, 2, 2, "#b8a17b");
            }
          if (d.tile(x, y + 1)) {
            box(c, px, py + 31, 32, 6, "#2e2627");
            box(c, px + 2, py + 31, 28, 2, "#77563e");
          }
        }
      }
    // Hand-built mine supports, rails, joists and rope posts sit inside the world.
    const beam = (x: number, y: number, w: number, h: number) => {
      box(c, x - 2, y + 2, w + 4, h + 4, "#292326");
      box(c, x, y, w, h, "#715035");
      box(c, x, y, w, 2, "#b88950");
      box(c, x + 2, y + 3, Math.max(1, w - 4), Math.max(1, h - 5), "#8e613d");
      for (let i = 3; i < w; i += 13) box(c, x + i, y + 2, 2, 2, "#392d29");
    };
    beam(9 * TILE - 7, 5 * TILE - 16, 10, 5 * TILE + 18);
    beam(18 * TILE - 3, 5 * TILE - 16, 10, 5 * TILE + 18);
    beam(9 * TILE - 7, 5 * TILE - 21, 9 * TILE + 14, 12);
    for (const [x1, x2, yy] of [
      [4, 11, 25],
      [24, 31, 28],
    ]) {
      beam(x1 * TILE - 3, yy * TILE + 3, (x2 - x1 + 1) * TILE + 3, 6);
      beam(x1 * TILE - 3, yy * TILE + 19, (x2 - x1 + 1) * TILE + 3, 5);
      for (let xx = x1; xx <= x2 + 1; xx += 2) {
        beam(xx * TILE - 4, yy * TILE - 10, 8, 38);
        box(c, xx * TILE - 3, yy * TILE - 12, 6, 3, "#c0935e");
      }
    }
    for (let y = 11; y <= 16; y++) {
      box(c, 13 * TILE, y * TILE + 3, 3 * TILE, 5, "#5e3f2e");
      box(c, 13 * TILE, y * TILE + 3, 3 * TILE, 1, "#be8a50");
    }
    beam(13 * TILE - 5, 11 * TILE, 6, 6 * TILE);
    beam(16 * TILE - 1, 11 * TILE, 6, 6 * TILE);
    for (const [x, y] of [
      [5, 11],
      [22, 27],
      [35, 10],
    ]) {
      for (let k = 0; k < 7; k++) {
        const rx = x * TILE + noise(k, x) * 22,
          ry = y * TILE + noise(k, y) * 15;
        polygon(
          c,
          [
            [rx, ry],
            [rx + 3, ry - 3],
            [rx + 6, ry - 1],
            [rx + 4, ry + 4],
          ],
          "#a9a08c",
          "#35302c",
        );
        box(c, rx + 2, ry - 2, 2, 2, "#d1c7ac");
      }
    }
  }
  render(dt: number) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (this.w !== Math.round(r.width) || this.h !== Math.round(r.height)) {
      this.w = Math.round(r.width);
      this.h = Math.round(r.height);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
    }
    const dpr = this.canvas.width / this.w,
      c = this.ctx,
      g = this.game,
      s = g.save;
    if (this.floor !== g.dungeon.floor) {
      this.bake(g.dungeon);
      this.initialized = false;
    }
    this.scale = this.w < 600 ? 1.45 : this.w < 950 ? 1.55 : 1.65;
    const target = {
      x: s.x + (this.w > 700 ? 12 : 0),
      y: s.y - (this.h < 450 ? 0 : 28),
    };
    if (!this.initialized) {
      this.camera = target;
      this.initialized = true;
    } else {
      const smooth = 1 - Math.exp(-dt * 7);
      this.camera.x += (target.x - this.camera.x) * smooth;
      this.camera.y += (target.y - this.camera.y) * smooth;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    box(c, 0, 0, this.w, this.h, "#15141b");
    c.save();
    c.translate(
      Math.round(this.w / 2 - this.camera.x * this.scale),
      Math.round(this.h / 2 - this.camera.y * this.scale),
    );
    c.scale(this.scale, this.scale);
    c.drawImage(this.terrain, 0, 0);
    const t = this.reduced ? 0 : g.time;
    for (const p of g.dungeon.props) {
      if (p.type === "torch")
        this.glow(
          c,
          p.x,
          p.y - 22,
          105 + Math.sin(t * 5 + p.x) * 5,
          "#ed8e38",
          0.4,
        );
      if (p.type === "crystal")
        this.glow(
          c,
          p.x,
          p.y - 20,
          90,
          "#aa65d5",
          s.opened.includes(p.id) ? 0.05 : 0.16,
        );
      if (p.type === "chest" && !s.opened.includes(p.id))
        this.glow(c, p.x, p.y - 10, 64, "#e4ac53", 0.12);
    }
    const actors: { y: number; draw: () => void }[] = g.dungeon.props.map(
      (p) => ({ y: p.y, draw: () => this.prop(c, p, t) }),
    );
    for (const e of g.dungeon.enemies)
      if (!e.dead)
        actors.push({
          y: e.y,
          draw: () => {
            this.shadow(c, e.x, e.y, e.type === "warden" ? 20 : 13);
            c.save();
            c.translate(Math.round(e.x), Math.round(e.y));
            if (e.hurt > 0) c.filter = "brightness(1.8)";
            c.drawImage(
              sprite(e.type, Math.floor(t * (e.type === "slime" ? 3 : 5)) % 2),
              -24,
              -44,
            );
            c.restore();
            if (e.hp < e.maxHp || e.type === "warden") {
              const w = e.type === "warden" ? 46 : 26;
              box(
                c,
                e.x - w / 2 - 1,
                e.y - (e.type === "warden" ? 69 : 49),
                w + 2,
                5,
                "#252129",
              );
              box(
                c,
                e.x - w / 2,
                e.y - (e.type === "warden" ? 68 : 48),
                (w * e.hp) / e.maxHp,
                3,
                "#b25750",
              );
              if (e.type === "warden") {
                c.font = "7px monospace";
                c.textAlign = "center";
                c.fillStyle = "#e2bc7b";
                c.fillText("ХРАНИТЕЛЬ", e.x, e.y - 74);
              }
            }
          },
        });
    for (const drop of s.drops)
      actors.push({
        y: drop.y,
        draw: () => {
          const bob = Math.sin(t * 3 + drop.x) * 2;
          if (drop.kind === "item" && drop.item) {
            c.save();
            const beam = c.createLinearGradient(
              drop.x,
              drop.y - 64,
              drop.x,
              drop.y + 4,
            );
            beam.addColorStop(0, "transparent");
            beam.addColorStop(1, RARITIES[drop.item.rarity].color);
            c.fillStyle = beam;
            c.globalAlpha = 0.23;
            c.fillRect(drop.x - 7, drop.y - 64, 14, 68);
            c.restore();
          }
          this.glow(
            c,
            drop.x,
            drop.y - 5,
            35,
            drop.item ? RARITIES[drop.item.rarity].color : "#efbe55",
            0.18,
          );
          if (drop.kind === "item" && drop.item) {
            c.save();
            c.translate(drop.x, drop.y + bob);
            drawItem(c, drop.item, 0, -6, 22);
            c.restore();
          } else {
            for (let i = 0; i < Math.min(28, 8 + drop.amount / 3); i++) {
              const x = drop.x + noise(i, drop.x) * 22 - 11,
                y = drop.y + noise(i, drop.y) * 14 - 7;
              box(c, x, y + bob, 4, 3, "#a87432");
              box(c, x, y - 1 + bob, 4, 2, "#eac668");
              box(c, x + 1, y - 1 + bob, 2, 1, "#fff0a6");
            }
          }
        },
      });
    actors.push({
      y: s.y,
      draw: () => {
        this.shadow(c, s.x, s.y, 14);
        c.save();
        c.translate(
          Math.round(s.x),
          Math.round(s.y) +
            (g.moving && !this.reduced ? Math.sin(t * 14) * 1.1 : 0),
        );
        if (g.hurtTime > 0 && Math.floor(t * 14) % 2) c.globalAlpha = 0.5;
        c.scale(g.facing, 1);
        c.drawImage(
          sprite("hero", g.moving ? Math.floor(t * 7) % 2 : 0, s.heroClass),
          -24,
          -44,
        );
        c.restore();
        if (g.swing > 0 && s.heroClass === "knight") {
          c.save();
          c.translate(s.x, s.y - 15);
          c.rotate(Math.atan2(g.aim.y, g.aim.x));
          c.strokeStyle = "#fce2a4";
          c.lineWidth = 3;
          c.globalAlpha = g.swing / 0.24;
          c.beginPath();
          c.arc(0, 0, 40, -0.9, 0.9);
          c.stroke();
          c.strokeStyle = "#d8964c";
          c.lineWidth = 7;
          c.globalAlpha *= 0.35;
          c.stroke();
          c.restore();
        }
        if (t - g.lastSkill < 0.5 && t - g.lastSkill >= 0) {
          const progress = (t - g.lastSkill) / 0.5;
          c.save();
          c.globalAlpha = 1 - progress;
          c.strokeStyle = CLASSES[s.heroClass].color;
          c.lineWidth = 4 - progress * 3;
          c.beginPath();
          c.ellipse(
            s.x,
            s.y - 6,
            100 * progress,
            50 * progress,
            0,
            0,
            Math.PI * 2,
          );
          c.stroke();
          c.restore();
        }
      },
    });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) {
      if (Math.abs(a.y - this.camera.y) < this.h / this.scale + 90) a.draw();
    }
    for (const p of g.projectiles) {
      this.glow(
        c,
        p.x,
        p.y,
        20,
        s.heroClass === "mage" ? "#f4b35d" : "#d8d4b8",
        0.35,
      );
      c.strokeStyle = s.heroClass === "mage" ? "#f8bc71" : "#d7c59d";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      c.stroke();
    }
    for (const p of g.particles) {
      c.globalAlpha = Math.max(0, p.life / p.maxLife);
      box(c, p.x, p.y, p.size, p.size, p.color);
    }
    c.globalAlpha = 1;
    if (!this.reduced)
      for (let i = 0; i < 32; i++) {
        const x =
            this.camera.x - 250 + noise(i, 6) * 500 + Math.sin(t * 0.3 + i) * 7,
          y =
            this.camera.y -
            200 +
            ((((noise(i, 8) * 400 - t * 3 + i * 11) % 400) + 400) % 400);
        c.globalAlpha = 0.1 + Math.sin(t + i) * 0.08;
        box(c, x, y, 1, 1, "#e8c795");
      }
    c.globalAlpha = 1;
    for (const f of g.floats) {
      c.save();
      c.globalAlpha = Math.min(1, f.life * 3);
      c.font = "bold 9px monospace";
      c.textAlign = "center";
      c.fillStyle = "#222029";
      c.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y) + 1);
      c.fillStyle = f.color;
      c.fillText(f.text, Math.round(f.x), Math.round(f.y));
      c.restore();
    }
    const near = g.nearestProp();
    if (near) {
      c.font = "bold 8px sans-serif";
      c.textAlign = "center";
      const label =
        near.type === "chest"
          ? "ОТКРЫТЬ"
          : near.type === "crystal"
            ? "ВОССТАНОВИТЬСЯ"
            : near.type === "merchant"
              ? "ТОРГОВЕЦ"
              : "СПУСТИТЬСЯ";
      const w = c.measureText(label).width + 18;
      box(c, near.x - w / 2, near.y - 61, w, 15, "#242129");
      c.strokeStyle = "#9e8056";
      c.lineWidth = 0.5;
      c.strokeRect(near.x - w / 2, near.y - 61, w, 15);
      c.fillStyle = "#e6cb98";
      c.fillText(label, near.x, near.y - 51);
    }
    c.restore();
    const vignette = c.createRadialGradient(
      this.w * 0.48,
      this.h * 0.45,
      this.h * 0.1,
      this.w * 0.48,
      this.h * 0.45,
      Math.max(this.w, this.h) * 0.65,
    );
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(0.65, "rgba(13,12,19,.08)");
    vignette.addColorStop(1, "rgba(13,12,19,.76)");
    c.fillStyle = vignette;
    c.fillRect(0, 0, this.w, this.h);
    if (g.hurtTime > 0.2 && g.hurtTime < 0.6) {
      c.fillStyle = `rgba(148,43,36,${g.hurtTime * 0.12})`;
      c.fillRect(0, 0, this.w, this.h);
    }
  }
  private prop(c: Ctx, p: Prop, t: number) {
    const opened = this.game.save.opened.includes(p.id);
    this.shadow(c, p.x, p.y, p.type === "merchant" ? 15 : 11);
    c.save();
    c.translate(Math.round(p.x), Math.round(p.y));
    if (p.type === "crystal" && opened) c.globalAlpha = 0.4;
    c.drawImage(
      sprite(
        p.type,
        p.type === "torch"
          ? Math.floor(t * 7) % 2
          : p.type === "chest" && opened
            ? 1
            : 0,
      ),
      -24,
      -44,
    );
    c.restore();
    if (p.type === "merchant") {
      c.font = "7px sans-serif";
      c.fillStyle = "#dab77a";
      c.textAlign = "center";
      c.fillText("МОРВИН", p.x, p.y - 54);
    }
    if (p.type === "chest" && !opened) {
      c.fillStyle = "#f1d082";
      c.globalAlpha = 0.4 + Math.sin(t * 3) * 0.25;
      box(c, p.x - 1, p.y - 34, 2, 3, "#f1d082");
      c.globalAlpha = 1;
    }
  }
  private glow(
    c: Ctx,
    x: number,
    y: number,
    radius: number,
    color: string,
    opacity: number,
  ) {
    const g = c.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    c.save();
    c.globalCompositeOperation = "screen";
    c.globalAlpha = opacity;
    c.fillStyle = g;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    c.restore();
  }
  private shadow(c: Ctx, x: number, y: number, size: number) {
    c.fillStyle = "rgba(17,15,20,.35)";
    c.beginPath();
    c.ellipse(x, y + 1, size, size * 0.35, 0, 0, Math.PI * 2);
    c.fill();
  }
}
