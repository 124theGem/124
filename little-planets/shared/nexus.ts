/** Original Little Planets multiverse. Movement and objectives run on both peers and server. */
export type NexusWorld = "hub" | "race" | "relic";
export const NEXUS_COLORS = { cyan: 0x69efeb, amber: 0xffbd63, violet: 0xbc8cff, coral: 0xff7894, lime: 0xc4ee79, silver: 0xe8edf5 } as const;
export type NexusColor = keyof typeof NEXUS_COLORS;
export const NEXUS_OUTFITS = {
  scout: { name: "Пилигрим", cost: 0 },
  runner: { name: "Импульс", cost: 160 },
  sentinel: { name: "Страж", cost: 240 },
} as const;
export type NexusOutfit = keyof typeof NEXUS_OUTFITS;
export const NEXUS_PORTALS = [
  { id: "colony", name: "Маленькие планеты", tag: "ВАША КОЛОНИЯ", description: "Дом, корабли, роботы и открытая галактика. Ваш сохранённый мир.", x: -15, z: -7, color: 0xa7e6aa },
  { id: "race", name: "Вектор", tag: "ГОНКА НА ХОВЕРБОРДЕ", description: "Пройдите 12 ворот неоновой трассы. Ускоряйтесь и побейте свой рекорд.", x: 0, z: -16, color: 0xffbb66 },
  { id: "relic", name: "Архив неба", tag: "ПРЫЖКИ И ИССЛЕДОВАНИЕ", description: "Найдите пять осколков на парящих островах и вернитесь к центральному обелиску.", x: 15, z: -7, color: 0xb89aff },
] as const;
export type NexusPortal = (typeof NEXUS_PORTALS)[number]["id"];
export const RACE_GATES = Array.from({ length: 12 }, (_, i) => {
  const a = Math.PI / 2 + ((i + 1) / 12) * Math.PI * 2;
  return { x: Math.cos(a) * 24, z: Math.sin(a) * 17 };
});
export const RELIC_ISLANDS = [
  { x: 0, z: 12, r: 5 }, { x: -6, z: 6, r: 3.6 },
  { x: -11, z: 0, r: 3.5 }, { x: -6, z: -6, r: 3.5 },
  { x: 0, z: -11, r: 4 }, { x: 7, z: -6, r: 3.6 },
  { x: 11, z: 1, r: 3.6 }, { x: 5, z: 6, r: 3.5 },
  { x: 0, z: 0, r: 4 },
];
export const RELICS = [1, 3, 4, 6, 7].map(i => RELIC_ISLANDS[i]);
export interface NexusProfile {
  name: string; color: NexusColor; outfit: NexusOutfit; unlocked: NexusOutfit[];
  xp: number; credits: number; races: number; expeditions: number; bestRace: number | null;
}
export interface NexusInput { seq: number; dt: number; x: number; z: number; jump: boolean; sprint: boolean; }
export interface NexusActor {
  id: string; name: string; color: NexusColor; outfit: NexusOutfit; world: NexusWorld;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number;
  seq: number; grounded: boolean; checkpoint: number; collected: number; falls: number;
  startedAt: number; finishedAt: number | null; emote: string; emoteAt: number;
}
export interface NexusSnapshot {
  session: string; serverTime: number; self: NexusActor; peers: NexusActor[]; online: number;
  profile: NexusProfile; leaderboard: { name: string; bestRace: number }[];
}
export type NexusCommand =
  | { type: "enter"; world: NexusWorld }
  | { type: "restart" }
  | { type: "customize"; name: string; color: NexusColor; outfit: NexusOutfit }
  | { type: "emote"; emote: "wave" | "dance" | "cheer" };
export const nexusName = (name: string) => name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/g, "").trim().slice(0, 24) || "Пилигрим";
export function freshNexusProfile(name = "Пилигрим"): NexusProfile {
  return { name: nexusName(name), color: "cyan", outfit: "scout", unlocked: ["scout"], xp: 0, credits: 0, races: 0, expeditions: 0, bestRace: null };
}
export const nexusLevel = (xp: number) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 100));
export function spawnNexus(profile: NexusProfile, id: string, world: NexusWorld, now: number): NexusActor {
  return { id, name: profile.name, color: profile.color, outfit: profile.outfit, world,
    x: 0, z: world === "race" ? 17 : 12, y: 0, vx: 0, vy: 0, vz: 0, yaw: Math.PI,
    seq: 0, grounded: true, checkpoint: 0, collected: 0, falls: 0,
    startedAt: now + (world === "race" ? 3000 : 0), finishedAt: null, emote: "", emoteAt: 0 };
}
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export function nearestNexusPortal(at: { x: number; z: number }) {
  return NEXUS_PORTALS.find(p => distance(at, p) < 4.6);
}
export function nexusFloor(world: NexusWorld, x: number, z: number) {
  if (world === "hub") return Math.hypot(x, z) < 28 ? 0 : null;
  if (world === "race") return Math.abs(Math.hypot(x / 24, z / 17) - 1) < 0.22 ? 0 : null;
  return RELIC_ISLANDS.some(p => Math.hypot(x - p.x, z - p.z) < p.r) ? 0 : null;
}
/** No position, time, reward or checkpoint is accepted directly from a client. */
export function stepNexus(actor: NexusActor, input: NexusInput, now: number) {
  if (actor.finishedAt !== null || now < actor.startedAt) { actor.seq = input.seq; return; }
  const dt = Math.max(0, Math.min(0.2, input.dt)), n = Math.max(1, Math.hypot(input.x, input.z));
  const speed = actor.world === "race" ? (input.sprint ? 19 : 13) : (input.sprint ? 9 : 6);
  const parts = Math.max(1, Math.ceil(dt / (1 / 60)));
  for (let i = 0; i < parts; i++) {
    const h = dt / parts, blend = 1 - Math.exp(-(actor.world === "race" ? 5 : 14) * h);
    actor.vx += (input.x / n * speed - actor.vx) * blend;
    actor.vz += (input.z / n * speed - actor.vz) * blend;
    actor.x += actor.vx * h; actor.z += actor.vz * h;
    if (Math.hypot(actor.vx, actor.vz) > 0.1) actor.yaw = Math.atan2(actor.vx, actor.vz);
    if (input.jump && actor.grounded && i === 0 && actor.world !== "race") { actor.vy = 8; actor.grounded = false; }
    const lastY = actor.y;
    actor.vy -= 19 * h; actor.y += actor.vy * h;
    const floor = nexusFloor(actor.world, actor.x, actor.z);
    if (floor !== null && actor.y <= floor && lastY >= floor - 0.02 && actor.vy <= 0) {
      actor.y = floor; actor.vy = 0; actor.grounded = true;
    } else actor.grounded = false;
    if (actor.y < -10) {
      actor.falls++;
      const at = actor.world === "race" && actor.checkpoint > 0 ? RACE_GATES[actor.checkpoint - 1] : { x: 0, z: actor.world === "race" ? 17 : 12 };
      actor.x = at.x; actor.z = at.z; actor.y = 0; actor.vx = actor.vz = actor.vy = 0; actor.grounded = true;
    }
    if (actor.world === "hub" && Math.hypot(actor.x, actor.z) > 26) {
      const scale = 26 / Math.hypot(actor.x, actor.z); actor.x *= scale; actor.z *= scale;
    }
    if (actor.world === "race" && actor.y > -0.3 && distance(actor, RACE_GATES[actor.checkpoint]) < 3.1) {
      actor.checkpoint++;
      if (actor.checkpoint === RACE_GATES.length) { actor.finishedAt = now; break; }
    }
    if (actor.world === "relic" && Math.abs(actor.y) < 1.8) {
      RELICS.forEach((p, index) => { if (distance(actor, p) < 1.65) actor.collected |= 1 << index; });
      if (actor.collected === 31 && distance(actor, { x: 0, z: 0 }) < 2.1) { actor.finishedAt = now; break; }
    }
  }
  actor.seq = input.seq;
}
export function completeNexus(profile: NexusProfile, actor: NexusActor) {
  if (actor.finishedAt === null || actor.world === "hub") return;
  if (actor.world === "race") {
    const duration = Math.max(1, actor.finishedAt - actor.startedAt);
    profile.races++;
    profile.bestRace = profile.bestRace === null ? duration : Math.min(profile.bestRace, duration);
    profile.xp += 80; profile.credits += 60;
  } else { profile.expeditions++; profile.xp += 100; profile.credits += 80; }
}
export function customizeNexus(profile: NexusProfile, command: Extract<NexusCommand, { type: "customize" }>) {
  if (!profile.unlocked.includes(command.outfit)) {
    const cost = NEXUS_OUTFITS[command.outfit].cost;
    if (profile.credits < cost) throw new Error(`Для этого костюма нужно ${cost} кредитов. Участвуйте в испытаниях.`);
    profile.credits -= cost; profile.unlocked.push(command.outfit);
  }
  profile.name = nexusName(command.name); profile.color = command.color; profile.outfit = command.outfit;
}
