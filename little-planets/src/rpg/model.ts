export const TILE = 32;
export type HeroClass = "knight" | "ranger" | "mage";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Slot = "weapon" | "armor" | "ring" | "boots";
export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  attack: number;
  defense: number;
  health: number;
  level: number;
  value: number;
  icon: string;
  lore: string;
}
export interface Enemy {
  id: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  hp: number;
  maxHp: number;
  type: "skeleton" | "slime" | "warden";
  cooldown: number;
  hurt: number;
  attack: number;
  dead: boolean;
}
export interface Loot {
  id: string;
  x: number;
  y: number;
  kind: "gold" | "potion" | "item" | "key";
  amount: number;
  item?: Item;
}
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}
export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}
export interface Quest {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  claimed: boolean;
  gold: number;
  xp: number;
}
export interface Save {
  schema: 1;
  heroClass: HeroClass;
  name: string;
  level: number;
  xp: number;
  gold: number;
  potions: number;
  hp: number;
  mana: number;
  x: number;
  y: number;
  floor: number;
  inventory: Item[];
  equipment: Partial<Record<Slot, Item>>;
  quests: Quest[];
  talents: { power: number; vitality: number; spirit: number };
  kills: number;
  opened: string[];
  dead: number[];
  drops: Loot[];
  bossDefeated: boolean;
  explored: string[];
  seconds: number;
}
export const RARITIES: Record<Rarity, { name: string; color: string }> = {
  common: { name: "Обычный", color: "#c2bbb0" },
  uncommon: { name: "Необычный", color: "#8cce83" },
  rare: { name: "Редкий", color: "#6eb9f3" },
  epic: { name: "Эпический", color: "#d29bf1" },
  legendary: { name: "Легендарный", color: "#edbe66" },
};
export const CLASSES: Record<
  HeroClass,
  {
    name: string;
    title: string;
    attack: number;
    hp: number;
    skill: string;
    color: string;
    description: string;
  }
> = {
  knight: {
    name: "Рыцарь",
    title: "Хранитель пламени",
    attack: 13,
    hp: 120,
    skill: "Вихрь стали",
    color: "#dbaa63",
    description:
      "Меч, крепкая броня и круговой удар. Всегда в сердце сражения.",
  },
  ranger: {
    name: "Следопыт",
    title: "Страж сумерек",
    attack: 11,
    hp: 95,
    skill: "Град стрел",
    color: "#96bd89",
    description:
      "Быстрые стрелы и залп по ближайшим врагам. Держитесь на расстоянии.",
  },
  mage: {
    name: "Маг",
    title: "Искатель искр",
    attack: 16,
    hp: 85,
    skill: "Кольцо огня",
    color: "#b49be2",
    description:
      "Огненные снаряды и взрывная магия. Точность сильнее тяжёлых доспехов.",
  },
};
const names: Record<Slot, string[]> = {
  weapon: [
    "Клинок странника",
    "Серебряный клык",
    "Шёпот глубин",
    "Рассекатель тьмы",
    "Пепельный рассвет",
  ],
  armor: [
    "Куртка странника",
    "Кольчуга дозорного",
    "Доспех глубин",
    "Панцирь хранителя",
    "Сердце кузни",
  ],
  ring: [
    "Медное кольцо",
    "Печать леса",
    "Кольцо сапфира",
    "Печать забвения",
    "Око феникса",
  ],
  boots: [
    "Походные сапоги",
    "Сапоги дозорного",
    "Шаг тумана",
    "Поступь тени",
    "Сапоги феникса",
  ],
};
let serial = 0;
export function makeItem(slot: Slot, rarity: Rarity, level: number): Item {
  const rank = Object.keys(RARITIES).indexOf(rarity),
    strength = rank + Math.max(1, level);
  return {
    id: `i-${Date.now().toString(36)}-${++serial}`,
    name: names[slot][rank],
    slot,
    rarity,
    level,
    attack:
      slot === "weapon" ? 3 + strength * 3 : slot === "ring" ? strength : 0,
    defense:
      slot === "armor" ? 2 + strength * 2 : slot === "boots" ? strength : 0,
    health:
      slot === "armor" ? strength * 8 : slot === "ring" ? strength * 4 : 0,
    value: 15 + strength * 16,
    icon: slot,
    lore: [
      "Надёжный спутник первых путешествий.",
      "Работа мастеров старого королевства.",
      "Сохранил отблеск давно угасшего света.",
      "В глубине металла пульсирует древняя сила.",
      "Говорят, этот артефакт помнит рождение солнца.",
    ][rank],
  };
}
export const SAVE_KEY = "emberfall.rpg.save.v1";
export function newSave(heroClass: HeroClass = "knight"): Save {
  const save: Save = {
    schema: 1,
    heroClass,
    name: "Странник",
    level: 1,
    xp: 0,
    gold: 120,
    potions: 3,
    hp: CLASSES[heroClass].hp,
    mana: 100,
    x: 14.5 * TILE,
    y: 19.5 * TILE,
    floor: 1,
    inventory: [
      makeItem("weapon", "epic", 1),
      makeItem("armor", "uncommon", 1),
      makeItem("ring", "rare", 1),
    ],
    equipment: {
      weapon: makeItem("weapon", "common", 1),
      armor: makeItem("armor", "common", 1),
      boots: makeItem("boots", "common", 1),
    },
    quests: [
      {
        id: "bones",
        title: "Тишина в шахте",
        description: "Победите обитателей заброшенной шахты.",
        target: 6,
        progress: 0,
        claimed: false,
        gold: 120,
        xp: 90,
      },
      {
        id: "chests",
        title: "То, что осталось",
        description: "Найдите и откройте древние сундуки.",
        target: 3,
        progress: 0,
        claimed: false,
        gold: 180,
        xp: 120,
      },
      {
        id: "warden",
        title: "Последний хранитель",
        description: "Отыщите и победите хранителя глубин.",
        target: 1,
        progress: 0,
        claimed: false,
        gold: 400,
        xp: 250,
      },
    ],
    talents: { power: 0, vitality: 0, spirit: 0 },
    kills: 0,
    opened: [],
    dead: [],
    drops: [
      {
        id: "arrival-gold",
        x: 8.4 * TILE,
        y: 19.2 * TILE,
        kind: "gold",
        amount: 25,
      },
      {
        id: "arrival-relic",
        x: 7.9 * TILE,
        y: 18.8 * TILE,
        kind: "item",
        amount: 1,
        item: makeItem("boots", "epic", 1),
      },
    ],
    bossDefeated: false,
    explored: [],
    seconds: 0,
  };
  save.hp = stats(save).maxHp;
  return save;
}
const finite = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
function validItem(i: unknown): i is Item {
  if (!i || typeof i !== "object") return false;
  const v = i as Item;
  return (
    typeof v.id === "string" &&
    v.id.length < 128 &&
    typeof v.name === "string" &&
    v.name.length < 100 &&
    typeof v.lore === "string" &&
    v.lore.length < 500 &&
    typeof v.icon === "string" &&
    ["weapon", "armor", "ring", "boots"].includes(v.slot) &&
    Object.hasOwn(RARITIES, v.rarity) &&
    ["attack", "defense", "health", "level", "value"].every((k) =>
      finite(v[k as keyof Item], 0, 10000),
    )
  );
}
export function decodeSave(raw: string): Save | null {
  try {
    const s = JSON.parse(raw) as Save;
    if (
      s.schema !== 1 ||
      typeof s.name !== "string" ||
      s.name.length > 40 ||
      typeof s.bossDefeated !== "boolean" ||
      !Number.isInteger(s.level) ||
      !Number.isInteger(s.floor) ||
      !Number.isInteger(s.potions) ||
      !Object.hasOwn(CLASSES, s.heroClass) ||
      !finite(s.level, 1, 100) ||
      !finite(s.xp, 0, 1e9) ||
      !finite(s.gold, 0, 1e9) ||
      !finite(s.floor, 1, 3) ||
      !finite(s.x, 0, 1440) ||
      !finite(s.y, 0, 1120) ||
      !finite(s.hp, 0, 10000) ||
      !finite(s.mana, 0, 100) ||
      !finite(s.potions, 0, 999) ||
      !Array.isArray(s.inventory) ||
      s.inventory.length > 100 ||
      !s.inventory.every(validItem) ||
      !s.equipment ||
      !Object.values(s.equipment).every(validItem) ||
      !Array.isArray(s.quests) ||
      s.quests.length !== 3 ||
      !s.quests.every(
        (q) =>
          q &&
          ["bones", "chests", "warden"].includes(q.id) &&
          typeof q.title === "string" &&
          typeof q.description === "string" &&
          typeof q.claimed === "boolean" &&
          typeof q.id === "string" &&
          finite(q.progress, 0, 9999) &&
          finite(q.target, 1, 9999) &&
          finite(q.gold, 0, 10000) &&
          finite(q.xp, 0, 10000),
      ) ||
      !s.talents ||
      !["power", "vitality", "spirit"].every((k) =>
        finite(s.talents[k as keyof Save["talents"]], 0, 100),
      ) ||
      !finite(s.kills, 0, 1e8) ||
      !Array.isArray(s.opened) ||
      !s.opened.every((x) => typeof x === "string") ||
      !Array.isArray(s.dead) ||
      !s.dead.every((x) => finite(x, 0, 10000)) ||
      !Array.isArray(s.explored) ||
      !s.explored.every((x) => typeof x === "string") ||
      !Array.isArray(s.drops) ||
      !s.drops.every(
        (d) =>
          finite(d.x, 0, 1440) &&
          finite(d.y, 0, 1120) &&
          finite(d.amount, 0, 10000) &&
          ["gold", "potion", "item", "key"].includes(d.kind) &&
          (d.kind !== "item" || validItem(d.item)),
      ) ||
      !finite(s.seconds, 0, 1e10)
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
export function stats(s: Save) {
  const items = Object.values(s.equipment),
    cls = CLASSES[s.heroClass];
  return {
    attack:
      cls.attack +
      (s.level - 1) * 3 +
      s.talents.power * 3 +
      items.reduce((n, i) => n + i.attack, 0),
    defense: 2 + s.level + items.reduce((n, i) => n + i.defense, 0),
    maxHp:
      cls.hp +
      (s.level - 1) * 15 +
      s.talents.vitality * 20 +
      items.reduce((n, i) => n + i.health, 0),
    speed: s.heroClass === "ranger" ? 119 : 106,
    crit: 10 + s.talents.spirit * 3,
    xpNext: 75 + s.level * 45,
    skillCost: Math.max(12, 30 - s.talents.spirit * 2),
    points: Math.max(
      0,
      s.level - 1 - s.talents.power - s.talents.vitality - s.talents.spirit,
    ),
  };
}

export interface Prop {
  id: string;
  x: number;
  y: number;
  type:
    | "barrel"
    | "chest"
    | "torch"
    | "crystal"
    | "merchant"
    | "stairs"
    | "bones"
    | "pillar"
    | "crate"
    | "mushrooms"
    | "ore";
}
export class Dungeon {
  readonly width = 45;
  readonly height = 35;
  readonly tiles = new Uint8Array(this.width * this.height);
  readonly props: Prop[] = [];
  readonly enemies: Enemy[] = [];
  constructor(readonly floor: number) {
    this.room(5, 13, 18, 23);
    this.room(9, 4, 17, 16);
    this.room(4, 20, 11, 25);
    this.room(18, 16, 29, 26);
    this.room(25, 3, 41, 18);
    this.room(32, 21, 42, 31);
    this.room(18, 16, 27, 18);
    this.room(28, 16, 36, 25);
    for (let y = 5; y <= 10; y++)
      for (let x = 9; x <= 17; x++) this.set(x, y, 2);
    for (let y = 20; y <= 24; y++)
      for (let x = 4; x <= 11; x++) this.set(x, y, 2);
    for (let y = 11; y <= 16; y++)
      for (let x = 13; x <= 15; x++) this.set(x, y, 2);
    for (let y = 25; y <= 27; y++)
      for (let x = 24; x <= 31; x++) this.set(x, y, 2);
    const add = (type: Prop["type"], x: number, y: number) =>
      this.props.push({
        id: `${floor}-${type}-${x}-${y}`,
        type,
        x: (x + 0.5) * TILE,
        y: (y + 0.5) * TILE,
      });
    for (const [x, y] of [
      [9, 12],
      [4, 17],
      [8, 17],
      [10, 21],
      [19, 19],
      [12, 25],
      [19, 12],
      [25, 9],
      [32, 5],
      [39, 16],
      [35, 23],
      [40, 29],
    ])
      add("torch", x, y);
    for (const [x, y] of [
      [10, 7],
      [5, 21],
      [17, 9],
      [25, 27],
      [39, 5],
      [33, 12],
      [5, 20],
      [10, 20],
      [17, 17],
    ])
      add("barrel", x, y);
    for (const [x, y] of [
      [5, 23],
      [10, 24],
      [17, 22],
      [27, 5],
      [34, 22],
    ])
      add("crate", x, y);
    for (const [x, y] of [
      [5, 14],
      [18, 13],
      [25, 6],
      [37, 23],
    ])
      add("ore", x, y);
    for (const [x, y] of [
      [6, 16],
      [17, 23],
      [26, 25],
      [38, 14],
      [10, 10],
    ])
      add("mushrooms", x, y);
    for (const [x, y] of [
      [6, 19],
      [29, 6],
      [38, 26],
      [17, 6],
    ])
      add("chest", x, y);
    for (const [x, y] of [
      [7, 18],
      [28, 14],
      [36, 7],
    ])
      add("crystal", x, y);
    for (const [x, y] of [
      [18, 23],
      [23, 19],
      [31, 28],
      [39, 13],
    ])
      add("bones", x, y);
    add("merchant", 6, 24);
    add("stairs", 39, 28);
    const placements: [number, number, Enemy["type"]][] = [
      [19, 17, "skeleton"],
      [22, 21, "skeleton"],
      [16, 13, "skeleton"],
      [13, 9, "skeleton"],
      [24, 18, "slime"],
      [27, 24, "skeleton"],
      [29, 10, "skeleton"],
      [35, 13, "slime"],
      [37, 7, "skeleton"],
      [37, 24, "skeleton"],
      [32, 28, "slime"],
      [39, 27, "warden"],
    ];
    placements.forEach(([x, y, type], id) => {
      const hp =
        (type === "warden" ? 240 : type === "slime" ? 38 : 52) *
        (1 + (floor - 1) * 0.45);
      this.enemies.push({
        id,
        x: (x + 0.5) * TILE,
        y: (y + 0.5) * TILE,
        homeX: (x + 0.5) * TILE,
        homeY: (y + 0.5) * TILE,
        hp,
        maxHp: hp,
        type,
        cooldown: 0,
        hurt: 0,
        attack: type === "warden" ? 20 : 8,
        dead: false,
      });
    });
  }
  private set(x: number, y: number, v: number) {
    this.tiles[y * this.width + x] = v;
  }
  private room(x1: number, y1: number, x2: number, y2: number) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) this.set(x, y, 1);
  }
  tile(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height
      ? 0
      : this.tiles[Math.floor(y) * this.width + Math.floor(x)];
  }
  walkable(x: number, y: number, radius = 8) {
    return [
      [-radius, -radius],
      [radius, -radius],
      [-radius, radius],
      [radius, radius],
    ].every(
      ([dx, dy]) =>
        this.tile(Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE)) > 0,
    );
  }
  move(body: { x: number; y: number }, dx: number, dy: number) {
    if (this.walkable(body.x + dx, body.y)) body.x += dx;
    if (this.walkable(body.x, body.y + dy)) body.y += dy;
  }
}

export class RPG {
  save: Save;
  dungeon: Dungeon;
  particles: Particle[] = [];
  floats: FloatText[] = [];
  projectiles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    damage: number;
  }[] = [];
  time = 0;
  attackTime = 0;
  skillTime = 0;
  dashTime = 0;
  hurtTime = 0;
  swing = 0;
  facing = 1;
  moving = false;
  paused = false;
  dead = false;
  aim = { x: 1, y: 0 };
  autoAttack = false;
  lastSkill = -100;
  saveError = false;
  onEvent: (message: string, kind?: string) => void = () => {};
  onChange: () => void = () => {};
  private flow = new Int16Array(45 * 35).fill(-1);
  private flowCell = -1;
  constructor(save?: Save) {
    this.save = save ?? newSave();
    this.dungeon = new Dungeon(this.save.floor);
    for (const e of this.dungeon.enemies)
      e.dead = this.save.dead.includes(e.id);
    if (!this.dungeon.walkable(this.save.x, this.save.y)) {
      this.save.x = 14.5 * TILE;
      this.save.y = 19.5 * TILE;
    }
    this.dead = this.save.hp <= 0;
  }
  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
      this.saveError = false;
    } catch {
      if (!this.saveError)
        this.onEvent(
          "Хранилище недоступно. Не закрывайте игру: прогресс пока только в памяти.",
          "error",
        );
      this.saveError = true;
    }
  }
  emit(message: string, kind = "info") {
    this.onEvent(message, kind);
  }
  update(dt: number, mx: number, my: number) {
    dt = Math.min(0.05, dt);
    if (this.paused || this.dead) return;
    this.time += dt;
    this.save.seconds += dt;
    this.attackTime = Math.max(0, this.attackTime - dt);
    this.skillTime = Math.max(0, this.skillTime - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.swing = Math.max(0, this.swing - dt);
    this.save.mana = Math.min(
      100,
      this.save.mana + dt * (4 + this.save.talents.spirit),
    );
    const len = Math.hypot(mx, my);
    this.moving = len > 0.1;
    if (this.moving) {
      mx /= Math.max(1, len);
      my /= Math.max(1, len);
      this.dungeon.move(
        this.save,
        mx * stats(this.save).speed * dt,
        my * stats(this.save).speed * dt,
      );
      this.aim = { x: mx, y: my };
      if (Math.abs(mx) > 0.05) this.facing = mx < 0 ? -1 : 1;
    }
    this.updateFlow();
    for (const e of this.dungeon.enemies) {
      if (e.dead) continue;
      e.cooldown = Math.max(0, e.cooldown - dt);
      e.hurt = Math.max(0, e.hurt - dt);
      const dx = this.save.x - e.x,
        dy = this.save.y - e.y,
        d = Math.hypot(dx, dy),
        range = e.type === "warden" ? 220 : 165;
      if (d < range && d > 23) {
        const speed =
          (e.type === "slime"
            ? 33
            : e.type === "warden"
              ? e.hp < e.maxHp * 0.5
                ? 52
                : 38
              : 43) * dt;
        let targetX = this.save.x,
          targetY = this.save.y,
          clear = true;
        for (let step = 12; step < d; step += 12)
          if (
            !this.dungeon.walkable(
              e.x + (dx / d) * step,
              e.y + (dy / d) * step,
              7,
            )
          ) {
            clear = false;
            break;
          }
        if (!clear) {
          const tx = Math.floor(e.x / TILE),
            ty = Math.floor(e.y / TILE),
            width = this.dungeon.width;
          let best = this.flow[ty * width + tx];
          for (const [ox, oy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const value = this.flow[(ty + oy) * width + tx + ox];
            if (value >= 0 && (best < 0 || value < best)) {
              best = value;
              targetX = (tx + ox + 0.5) * TILE;
              targetY = (ty + oy + 0.5) * TILE;
            }
          }
        }
        const vx = targetX - e.x,
          vy = targetY - e.y,
          length = Math.hypot(vx, vy);
        if (length > 1)
          this.dungeon.move(e, (vx / length) * speed, (vy / length) * speed);
      }
      if (d < 31 && e.cooldown === 0) {
        e.cooldown = e.type === "warden" ? 1.5 : 1.15;
        this.takeDamage(e.attack + (this.save.floor - 1) * 4);
      }
    }
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (!this.dungeon.walkable(p.x, p.y, 2)) p.life = 0;
      const hit = this.dungeon.enemies.find(
        (e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 17,
      );
      if (hit && p.life > 0) {
        this.hitEnemy(hit, p.damage);
        p.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 35 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.y -= dt * 19;
      f.life -= dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
    for (const drop of [...this.save.drops])
      if (Math.hypot(drop.x - this.save.x, drop.y - this.save.y) < 25)
        this.collect(drop.id);
    const sector = `${Math.floor(this.save.x / 96)},${Math.floor(this.save.y / 96)}`;
    if (!this.save.explored.includes(sector)) this.save.explored.push(sector);
    if (
      this.autoAttack &&
      this.dungeon.enemies.some(
        (e) =>
          !e.dead &&
          Math.hypot(e.x - this.save.x, e.y - this.save.y) <
            (this.save.heroClass === "knight" ? 70 : 220),
      )
    )
      this.attack();
  }
  private updateFlow() {
    const d = this.dungeon,
      cell =
        Math.floor(this.save.y / TILE) * d.width +
        Math.floor(this.save.x / TILE) +
        this.save.floor * 10000;
    if (cell === this.flowCell) return;
    this.flowCell = cell;
    this.flow.fill(-1);
    const start = cell % 10000,
      queue = [start];
    this.flow[start] = 0;
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i],
        x = n % d.width,
        y = Math.floor(n / d.width);
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + ox,
          ny = y + oy,
          key = ny * d.width + nx;
        if (d.tile(nx, ny) && this.flow[key] < 0) {
          this.flow[key] = this.flow[n] + 1;
          queue.push(key);
        }
      }
    }
  }
  attack() {
    if (this.paused || this.dead || this.attackTime > 0) return false;
    this.attackTime = this.save.heroClass === "ranger" ? 0.4 : 0.52;
    this.swing = 0.24;
    const nearest = this.dungeon.enemies
      .filter((e) => !e.dead)
      .sort(
        (a, b) =>
          Math.hypot(a.x - this.save.x, a.y - this.save.y) -
          Math.hypot(b.x - this.save.x, b.y - this.save.y),
      )[0];
    const d = nearest
      ? Math.hypot(nearest.x - this.save.x, nearest.y - this.save.y)
      : Infinity;
    if (nearest && d > 0.001 && d < 230) {
      this.aim = {
        x: (nearest.x - this.save.x) / d,
        y: (nearest.y - this.save.y) / d,
      };
      this.facing = this.aim.x < 0 ? -1 : 1;
    }
    const damage = stats(this.save).attack;
    if (this.save.heroClass === "knight") {
      for (const e of this.dungeon.enemies)
        if (!e.dead && Math.hypot(e.x - this.save.x, e.y - this.save.y) < 64)
          this.hitEnemy(e, damage);
    } else
      this.projectiles.push({
        x: this.save.x,
        y: this.save.y - 8,
        vx: this.aim.x * 300,
        vy: this.aim.y * 300,
        life: 0.9,
        damage,
      });
    this.onChange();
    return true;
  }
  skill() {
    const cost = stats(this.save).skillCost;
    if (this.paused || this.dead || this.skillTime > 0) return false;
    if (this.save.mana < cost) {
      this.emit("Недостаточно маны.", "error");
      return false;
    }
    this.save.mana -= cost;
    this.skillTime = 6;
    this.lastSkill = this.time;
    for (const e of this.dungeon.enemies)
      if (
        !e.dead &&
        Math.hypot(e.x - this.save.x, e.y - this.save.y) <
          (this.save.heroClass === "knight" ? 115 : 185)
      )
        this.hitEnemy(e, stats(this.save).attack * 2.6);
    this.burst(
      this.save.x,
      this.save.y,
      CLASSES[this.save.heroClass].color,
      38,
    );
    this.emit(CLASSES[this.save.heroClass].skill, "skill");
    this.onChange();
    return true;
  }
  dash() {
    if (this.paused || this.dead || this.dashTime > 0) return;
    this.dashTime = 3;
    this.hurtTime = 0.5;
    for (let i = 0; i < 14; i++) {
      this.burst(this.save.x, this.save.y, "#d0bda1", 1);
      this.dungeon.move(this.save, this.aim.x * 5, this.aim.y * 5);
    }
  }
  potion() {
    if (this.paused || this.dead) return;
    const max = stats(this.save).maxHp;
    if (this.save.potions <= 0)
      return this.emit("Зелья закончились. Загляните к торговцу.", "error");
    if (this.save.hp >= max) return this.emit("Здоровье уже восстановлено.");
    this.save.potions--;
    this.save.hp = Math.min(max, this.save.hp + max * 0.5);
    this.burst(this.save.x, this.save.y, "#8dbd79", 18);
    this.float(this.save.x, this.save.y - 30, "+50% здоровья", "#a4d288");
    this.changed();
  }
  private takeDamage(amount: number) {
    if (this.hurtTime > 0) return;
    const value = Math.max(
      1,
      amount - Math.floor(stats(this.save).defense * 0.45),
    );
    this.save.hp = Math.max(0, this.save.hp - value);
    this.hurtTime = 0.45;
    this.float(this.save.x, this.save.y - 30, `−${value}`, "#f09383");
    this.burst(this.save.x, this.save.y, "#bd5652", 8);
    if (this.save.hp <= 0) {
      this.dead = true;
      this.emit("Пламя ещё не погасло. Возродитесь у входа.", "death");
      this.persist();
    }
    this.onChange();
  }
  hitEnemy(e: Enemy, amount: number) {
    if (e.dead) return;
    const crit = Math.random() * 100 < stats(this.save).crit,
      damage = Math.round(amount * (crit ? 1.7 : 1));
    e.hp = Math.max(0, e.hp - damage);
    e.hurt = 0.18;
    this.float(
      e.x,
      e.y - 32,
      `${crit ? "✦ " : ""}${damage}`,
      crit ? "#f8d779" : "#f6ebd3",
    );
    this.burst(e.x, e.y - 6, "#c2b49a", 8);
    if (e.hp === 0) {
      e.dead = true;
      this.save.dead.push(e.id);
      this.save.kills++;
      this.quest("bones", 1);
      const boss = e.type === "warden";
      this.addXP(boss ? 140 : 22 + this.save.floor * 7);
      this.save.drops.push({
        id: `g-${this.save.floor}-${e.id}`,
        x: e.x - 9,
        y: e.y + 3,
        kind: "gold",
        amount: boss ? 200 : 12 + this.save.floor * 5,
      });
      if (e.id % 3 === 0 || boss)
        this.save.drops.push({
          id: `l-${this.save.floor}-${e.id}`,
          x: e.x + 14,
          y: e.y + 2,
          kind: "item",
          amount: 1,
          item: makeItem(
            boss ? "weapon" : e.id % 2 ? "armor" : "ring",
            boss ? "legendary" : "rare",
            this.save.level,
          ),
        });
      if (boss) {
        this.save.bossDefeated = true;
        this.quest("warden", 1);
        this.emit(
          this.save.floor === 3
            ? "Хранитель повержен. Глубины свободны!"
            : "Хранитель повержен. Открыт путь на следующий этаж.",
          "legendary",
        );
      }
      this.changed();
    }
  }
  collect(id: string) {
    const index = this.save.drops.findIndex((d) => d.id === id);
    if (index < 0) return false;
    const d = this.save.drops[index];
    if (d.kind === "item" && this.save.inventory.length >= 40) return false;
    this.save.drops.splice(index, 1);
    if (d.kind === "gold") {
      this.save.gold += d.amount;
      this.float(d.x, d.y - 15, `+${d.amount}`, "#e7bd68");
    }
    if (d.kind === "potion") this.save.potions += d.amount;
    if (d.kind === "item" && d.item) {
      this.save.inventory.push(d.item);
      this.emit(`Найдено: ${d.item.name}`, d.item.rarity);
    }
    this.changed();
    return true;
  }
  nearestProp() {
    return this.dungeon.props
      .filter(
        (p) =>
          ["chest", "merchant", "stairs", "crystal"].includes(p.type) &&
          !this.save.opened.includes(p.id),
      )
      .map((p) => ({ p, d: Math.hypot(this.save.x - p.x, this.save.y - p.y) }))
      .filter((v) => v.d < 75)
      .sort((a, b) => a.d - b.d)[0]?.p;
  }
  interact() {
    if (this.paused || this.dead) return;
    const p = this.nearestProp();
    if (!p) return this.emit("Подойдите к сундуку, кристаллу или торговцу.");
    if (p.type === "merchant") return this.emit("merchant", "open");
    if (p.type === "stairs") {
      if (!this.save.bossDefeated)
        return this.emit(
          "Путь запечатан. Сначала победите хранителя.",
          "error",
        );
      if (this.save.floor === 3) return this.emit("victory", "open");
      this.save.floor++;
      this.save.x = 14.5 * TILE;
      this.save.y = 19.5 * TILE;
      this.save.dead = [];
      this.save.bossDefeated = false;
      this.save.explored = [];
      this.save.drops = [];
      this.dungeon = new Dungeon(this.save.floor);
      this.projectiles = [];
      this.emit(`Глубина ${this.save.floor}. Враги стали сильнее.`, "floor");
      this.changed();
      return;
    }
    this.save.opened.push(p.id);
    if (p.type === "crystal") {
      this.save.mana = 100;
      this.save.hp = stats(this.save).maxHp;
      this.emit("Кристалл восстановил здоровье и ману.", "skill");
    }
    if (p.type === "chest") {
      this.quest("chests", 1);
      this.save.drops.push(
        {
          id: `gold-${p.id}`,
          x: p.x - 13,
          y: p.y + 12,
          kind: "gold",
          amount: 45 + this.save.floor * 15,
        },
        {
          id: `item-${p.id}`,
          x: p.x + 15,
          y: p.y + 14,
          kind: "item",
          amount: 1,
          item: makeItem(
            this.save.opened.filter((x) => x.includes("chest")).length % 2
              ? "armor"
              : "weapon",
            this.save.opened.filter((x) => x.includes("chest")).length % 3 === 0
              ? "epic"
              : "rare",
            this.save.level,
          ),
        },
      );
      this.burst(p.x, p.y, "#edc86c", 25);
      this.emit("Сундук открыт. Подберите сокровища!", "rare");
    }
    this.changed();
  }
  equip(id: string) {
    if (this.dead) return;
    const i = this.save.inventory.findIndex((x) => x.id === id);
    if (i < 0) return;
    const item = this.save.inventory.splice(i, 1)[0],
      old = this.save.equipment[item.slot];
    this.save.equipment[item.slot] = item;
    if (old) this.save.inventory.push(old);
    this.save.hp = Math.min(this.save.hp, stats(this.save).maxHp);
    this.emit(`Экипировано: ${item.name}`, item.rarity);
    this.changed();
  }
  sell(id: string) {
    const i = this.save.inventory.findIndex((x) => x.id === id);
    if (i < 0) return;
    const item = this.save.inventory.splice(i, 1)[0];
    this.save.gold += item.value;
    this.emit(`Продано: ${item.name} · +${item.value} золота`);
    this.changed();
  }
  buyPotion() {
    if (this.save.gold < 35) return this.emit("Нужно 35 золота.", "error");
    this.save.gold -= 35;
    this.save.potions++;
    this.changed();
  }
  upgradeWeapon() {
    const weapon = this.save.equipment.weapon;
    if (!weapon) return;
    const cost = 70 + weapon.level * 30;
    if (this.save.gold < cost)
      return this.emit(`Для улучшения нужно ${cost} золота.`, "error");
    this.save.gold -= cost;
    weapon.level++;
    weapon.attack += 3;
    weapon.value += 20;
    this.emit(`Оружие улучшено: +3 к атаке.`, "rare");
    this.changed();
  }
  quest(id: string, amount: number) {
    const q = this.save.quests.find((x) => x.id === id);
    if (q && !q.claimed) q.progress = Math.min(q.target, q.progress + amount);
  }
  claim(id: string) {
    const q = this.save.quests.find((x) => x.id === id);
    if (!q || q.claimed || q.progress < q.target) return;
    q.claimed = true;
    this.save.gold += q.gold;
    this.addXP(q.xp);
    this.emit(`Задание выполнено: ${q.title}`, "quest");
    this.changed();
  }
  addXP(amount: number) {
    this.save.xp += amount;
    while (this.save.xp >= stats(this.save).xpNext && this.save.level < 100) {
      this.save.xp -= stats(this.save).xpNext;
      this.save.level++;
      this.save.hp = stats(this.save).maxHp;
      this.save.mana = 100;
      this.emit(`Уровень ${this.save.level}! Доступно очко таланта.`, "level");
      this.burst(this.save.x, this.save.y, "#efcf7e", 35);
    }
  }
  talent(key: keyof Save["talents"]) {
    if (stats(this.save).points < 1) return;
    this.save.talents[key]++;
    this.changed();
  }
  revive() {
    if (!this.dead) return;
    this.save.gold = Math.floor(this.save.gold * 0.9);
    this.save.hp = stats(this.save).maxHp;
    this.save.mana = 100;
    this.save.x = 14.5 * TILE;
    this.save.y = 19.5 * TILE;
    this.dead = false;
    for (const e of this.dungeon.enemies) {
      e.x = e.homeX;
      e.y = e.homeY;
      e.cooldown = 1;
    }
    this.hurtTime = 3;
    this.emit("Вы снова у входа. Потеряно 10% золота.");
    this.changed();
  }
  changeClass(cls: HeroClass) {
    this.save.heroClass = cls;
    this.save.hp = stats(this.save).maxHp;
    this.save.mana = 100;
    this.emit(`Ваш путь: ${CLASSES[cls].name}`);
    this.changed();
  }
  private changed() {
    this.persist();
    this.onChange();
  }
  private burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count && this.particles.length < 220; i++) {
      const a = Math.random() * Math.PI * 2,
        speed = 12 + Math.random() * 70,
        life = 0.3 + Math.random() * 0.55;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 20,
        life,
        maxLife: life,
        color,
        size: 1 + Math.floor(Math.random() * 3),
      });
    }
  }
  private float(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, color, life: 1 });
  }
}
