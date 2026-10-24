export type Vec2 = { x: number; z: number };
export type Team = 'A' | 'B' | 'PVE';
export type Mode = 'raid' | 'siege' | 'hill';
export type ControllerType = 'HUMAN_LOCAL' | 'BOT' | 'HUMAN_REMOTE';
export type Role = 'tank' | 'melee' | 'ranged' | 'healer' | 'support';
export type StatusKind =
  | 'stun'
  | 'slow'
  | 'root'
  | 'poison'
  | 'burn'
  | 'defense'
  | 'power'
  | 'haste'
  | 'stealth'
  | 'weakness'
  | 'taunt'
  | 'invulnerable';
export type EffectKind =
  | StatusKind
  | 'damage'
  | 'heal'
  | 'shield'
  | 'cleanse'
  | 'revive'
  | 'dash'
  | 'blink'
  | 'knockback'
  | 'summon'
  | 'reset';
export interface EffectSpec {
  kind: EffectKind;
  power: number;
  duration?: number;
}
export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'melee' | 'projectile' | 'area' | 'buff' | 'summon';
  target: 'enemy' | 'ally' | 'self' | 'team' | 'ground' | 'line';
  range: number;
  radius: number;
  cooldown: number;
  cost: number;
  duration: number;
  effects: EffectSpec[];
  color: string;
  animation: string;
  sound: string;
  ai: 'offense' | 'heal' | 'defense' | 'buff';
  ultimate: boolean;
  delay?: number;
}
export interface ClassDef {
  id: string;
  name: string;
  title: string;
  role: Role;
  icon: string;
  color: string;
  description: string;
  passive: string;
  model: string;
  weapon: string;
  hp: number;
  attack: number;
  armor: number;
  resist: number;
  speed: number;
  range: number;
  interval: number;
  abilities: [AbilityDef, AbilityDef, AbilityDef, AbilityDef];
}
export interface Status {
  kind: StatusKind;
  remaining: number;
  power: number;
  source: string;
  tick: number;
}
export interface Stats {
  kills: number;
  deaths: number;
  damage: number;
  healing: number;
  capture: number;
}
export type AnimationState =
  | 'idle'
  | 'run'
  | 'attack'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'ultimate'
  | 'dodge'
  | 'hit'
  | 'death'
  | 'victory';
export interface Entity {
  id: string;
  participantId: string;
  classId: string;
  name: string;
  team: Team;
  controller: ControllerType;
  connected: boolean;
  kind: 'hero' | 'monster' | 'boss' | 'summon';
  position: Vec2;
  previous: Vec2;
  home: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  shield: number;
  attack: number;
  armor: number;
  resist: number;
  speed: number;
  range: number;
  interval: number;
  cooldowns: number[];
  attackCooldown: number;
  dodgeCooldown: number;
  ultimate: number;
  statuses: Status[];
  animation: AnimationState;
  animationUntil: number;
  animationSerial: number;
  alive: boolean;
  respawnAt: number;
  lifetime: number;
  revived: boolean;
  aiState: string;
  targetId?: string;
  combo: number;
  stats: Stats;
}
export interface Command {
  actorId: string;
  move?: Vec2;
  attack?: boolean;
  ability?: number;
  dodge?: boolean;
  targetId?: string;
  aim?: Vec2;
}
export interface Obstacle {
  x: number;
  z: number;
  w: number;
  d: number;
  kind: 'wall' | 'pillar' | 'rock' | 'river';
  landmark?: boolean;
}
export interface GameMap {
  id: string;
  name: string;
  width: number;
  depth: number;
  obstacles: Obstacle[];
  rivers?: { z: number; depth: number; bridges: { x: number; width: number }[] }[];
  castles?: { position: Vec2; width: number; depth: number }[];
  landmarks?: {
    name: string;
    kind: 'gate' | 'garden' | 'fountain' | 'altar' | 'camp';
    position: Vec2;
    radius: number;
  }[];
  spawns: Record<'A' | 'B', Vec2>;
  points: Vec2[];
}
export interface ControlPoint {
  id: string;
  position: Vec2;
  radius: number;
  progress: number;
  owner: Team | null;
  capturing: Team | null;
  contested: boolean;
  locked: boolean;
}
export interface Projectile {
  id: number;
  source: string;
  team: Team;
  position: Vec2;
  direction: Vec2;
  speed: number;
  remaining: number;
  damage: number;
  targetId?: string;
  abilityId?: string;
  color: string;
  effects?: EffectSpec[];
}
export interface Zone {
  id: number;
  source: string;
  team: Team;
  position: Vec2;
  radius: number;
  remaining: number;
  delay: number;
  tick: number;
  effects: EffectSpec[];
  friendly: boolean;
  color: string;
  telegraph: boolean;
  shape?: 'circle' | 'cone';
  abilityId?: string;
  facing?: number;
  arc?: number;
}
export interface GameEvent {
  id: number;
  type: 'damage' | 'heal' | 'cast' | 'death' | 'dodge' | 'capture' | 'phase' | 'reward';
  position: Vec2;
  target?: Vec2;
  value?: number;
  color: string;
  ultimate?: boolean;
  name?: string;
  sourceId?: string;
  classId?: string;
  abilityId?: string;
  origin?: Vec2;
  radius?: number;
  duration?: number;
  delay?: number;
  facing?: number;
}
export interface MatchState {
  version: 1;
  id: string;
  seed: number;
  serial: number;
  spawnSerial: number;
  time: number;
  tick: number;
  mode: Mode;
  map: GameMap;
  entities: Entity[];
  projectiles: Projectile[];
  zones: Zone[];
  points: ControlPoint[];
  score: Record<'A' | 'B', number>;
  timeLimit: number;
  overtime: boolean;
  status: 'playing' | 'finished';
  winner: Team | 'draw' | null;
  stage: number;
  bossPhase: number;
  chest: Vec2 | null;
  events: GameEvent[];
}
export const TEAM_LIMIT = 3;
export const FIXED_DT = 1 / 30;
export const emptyStats = (): Stats => ({ kills: 0, deaths: 0, damage: 0, healing: 0, capture: 0 });
