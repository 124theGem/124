import {
  FIXED_DT,
  type Command,
  type Entity,
  type MatchState,
  type Mode,
  type Vec2,
} from '../core/types';
import { add, direction, distance } from '../core/math';
import { createMap } from '../maps/maps';
import { addHero, makeEntity } from '../teams/roster';
import { CombatSystem, has } from './CombatSystem';
import { finish, updateRules } from '../modes/rules';
import { navigable } from '../ai/navigation';
export interface MatchOptions {
  mode: Mode;
  classId: string;
  seed?: number;
  allies?: [string, string];
  equipment?: { hp: number; attack: number; armor: number };
}
export class Simulation {
  state: MatchState;
  combat: CombatSystem;
  private get monsterId() {
    return this.state.spawnSerial;
  }
  private set monsterId(value: number) {
    this.state.spawnSerial = value;
  }
  constructor(options: MatchOptions) {
    const map = createMap(options.mode);
    this.state = {
      version: 1,
      id: `match-${options.seed ?? 42}`,
      seed: options.seed ?? 42,
      serial: 0,
      spawnSerial: 0,
      time: 0,
      tick: 0,
      mode: options.mode,
      map,
      entities: [],
      projectiles: [],
      zones: [],
      points: map.points.map((p, i) => ({
        id: 'ABC'[i],
        position: { ...p },
        radius: 4.5,
        progress: 0,
        owner: null,
        capturing: null,
        contested: false,
        locked: options.mode === 'siege' && i > 0,
      })),
      score: { A: 0, B: 0 },
      timeLimit: options.mode === 'raid' ? 420 : options.mode === 'siege' ? 420 : 300,
      overtime: false,
      status: 'playing',
      winner: null,
      stage: 0,
      bossPhase: 0,
      chest: null,
      events: [],
    };
    this.combat = new CombatSystem(this.state, (e, n, d) => this.summon(e, n, d));
    const allied = options.allies ?? ['guardian', 'priest'];
    const classes = [options.classId, ...allied];
    classes.forEach((c, i) => {
      const e = makeEntity(
        `A${i}`,
        c,
        'A',
        { x: (i - 1) * 2.4, z: map.spawns.A.z + (i ? 1 : 0) },
        i ? 'BOT' : 'HUMAN_LOCAL',
        i ? undefined : 'Вы',
      );
      if (i === 0 && options.mode === 'raid' && options.equipment) {
        e.maxHp += options.equipment.hp;
        e.hp = e.maxHp;
        e.attack += options.equipment.attack;
        e.armor += options.equipment.armor;
      }
      addHero(this.state, e);
    });
    if (options.mode === 'raid') this.spawnRaidStage();
    else
      ['berserker', 'icemage', 'druid'].forEach((c, i) =>
        addHero(
          this.state,
          makeEntity(`B${i}`, c, 'B', { x: (i - 1) * 2.4, z: map.spawns.B.z }, 'BOT'),
        ),
      );
  }
  get player() {
    return this.state.entities.find((e) => e.controller === 'HUMAN_LOCAL')!;
  }
  step(commands: Command[], dt = FIXED_DT) {
    const s = this.state;
    if (s.status !== 'playing') return;
    if (!Number.isFinite(dt) || Math.abs(dt - FIXED_DT) > 1e-8)
      throw new Error('Simulation requires a fixed timestep');
    s.time += dt;
    s.tick++;
    s.events = [];
    this.combat.update(dt);
    const seen = new Set<string>();
    for (const command of commands) {
      const e = s.entities.find((e) => e.id === command.actorId);
      if (!e || !e.alive || seen.has(e.id)) continue;
      seen.add(e.id);
      if (command.move && Number.isFinite(command.move.x) && Number.isFinite(command.move.z))
        this.combat.move(e, command.move, dt);
      if (command.dodge && e.dodgeCooldown <= 0 && !has(e, 'stun') && !has(e, 'root')) {
        e.dodgeCooldown = 3;
        e.statuses.push({ kind: 'invulnerable', power: 1, remaining: 0.35, source: e.id, tick: 0 });
        this.combat.animate(e, 'dodge', 0.4);
        const v =
          command.move && Math.hypot(command.move.x, command.move.z) > 0
            ? command.move
            : { x: Math.sin(e.facing), z: Math.cos(e.facing) };
        for (let i = 0; i < 10; i++) this.combat.move(e, v, 0.02, true);
        this.combat.event({ type: 'dodge', position: e.position, color: '#8ac9ce' });
      }
      if (command.ability !== undefined)
        this.combat.cast(e, command.ability, command.targetId, command.aim);
      if (command.attack) this.combat.attack(e, command.targetId, command.aim);
    }
    this.separate();
    if (s.mode === 'raid') {
      if (s.stage < 4 && s.entities.filter((e) => e.kind === 'monster').every((e) => !e.alive)) {
        s.stage++;
        this.spawnRaidStage();
      }
      this.boss(dt);
    }
    updateRules(s, dt);
  }
  private separate() {
    const alive = this.state.entities.filter((e) => e.alive);
    for (let i = 0; i < alive.length; i++)
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i],
          b = alive[j],
          d = distance(a.position, b.position),
          r = a.kind === 'boss' || b.kind === 'boss' ? 1.6 : 0.85;
        if (d < r && d > 0.001) {
          const dir = direction(b.position, a.position),
            delta = (r - d) * 0.45;
          const pa = add(a.position, dir, delta),
            pb = add(b.position, dir, -delta);
          if (navigable(this.state.map, pa)) a.position = pa;
          if (navigable(this.state.map, pb)) b.position = pb;
        }
      }
  }
  private spawnRaidStage() {
    const s = this.state;
    if (s.stage === 4) {
      const b = makeEntity('boss', 'guardian', 'PVE', { x: 0, z: 27 }, 'BOT', 'Хранитель руин');
      b.kind = 'boss';
      b.maxHp = b.hp = 22000;
      b.interval = 1.1;
      b.attack = 115;
      b.range = 3.5;
      b.speed = 2.7;
      b.armor = 30;
      b.ultimate = 0;
      s.entities.push(b);
      return;
    }
    const z = [-20, -11, 4, 15][s.stage];
    for (let i = 0; i < 3 + (s.stage === 3 ? 1 : 0); i++) {
      const m = makeEntity(
        `monster-${this.monsterId++}`,
        i === 2 ? 'archer' : s.stage === 3 ? 'guardian' : 'berserker',
        'PVE',
        { x: (i - 1) * 3, z: z + (i % 2) * 2 },
        'BOT',
        i === 2 ? 'Скелет-лучник' : s.stage === 3 ? 'Элитный страж' : 'Скелет-воин',
      );
      m.kind = 'monster';
      m.hp = m.maxHp = s.stage === 3 ? 650 : 340 + s.stage * 70;
      m.attack = 35 + s.stage * 7;
      m.speed = 3;
      m.range = i === 2 ? 8 : 2;
      m.armor = 8;
      m.interval = 0.95;
      m.ultimate = 0;
      s.entities.push(m);
    }
  }
  private summon(source: Entity, n: number, duration: number) {
    const count = this.state.entities.filter(
      (e) => e.kind === 'summon' && e.alive && e.participantId === source.id,
    ).length;
    for (let i = 0; i < Math.min(n, 4 - count); i++) {
      const p = add(source.position, { x: Math.cos(i * 2.1), z: Math.sin(i * 2.1) }, 2);
      if (!navigable(this.state.map, p)) continue;
      const m = makeEntity(
        `summon-${this.monsterId++}`,
        'berserker',
        source.team,
        p,
        'BOT',
        'Призванный скелет',
      );
      m.kind = 'summon';
      m.participantId = source.id;
      m.hp = m.maxHp = 250;
      m.attack = 38;
      m.lifetime = duration;
      this.state.entities.push(m);
    }
  }
  private boss(_dt: number) {
    const s = this.state,
      b = s.entities.find((e) => e.kind === 'boss' && e.alive);
    if (!b) return;
    const phase = b.hp / b.maxHp > 0.65 ? 1 : b.hp / b.maxHp > 0.3 ? 2 : 3;
    if (phase !== s.bossPhase) {
      s.bossPhase = phase;
      this.combat.event({
        type: 'phase',
        position: b.position,
        color: '#e6a16b',
        name: `Фаза ${phase}`,
      });
      if (phase > 1)
        for (let i = 0; i < phase; i++) {
          const m = makeEntity(
            `add-${this.monsterId++}`,
            'berserker',
            'PVE',
            { x: b.position.x + (i - 1) * 3, z: b.position.z + 3 },
            'BOT',
            'Слуга хранителя',
          );
          m.kind = 'monster';
          m.hp = m.maxHp = 280;
          m.attack = 35;
          s.entities.push(m);
        }
    }
    if (phase === 3) {
      b.interval = 0.65;
      b.speed = 3.4;
    }
    if (s.tick % (phase === 3 ? 95 : 150) === 0) {
      const t = this.combat.target(b, 14);
      if (!t) return;
      s.zones.push({
        id: ++this.combat.serial,
        source: b.id,
        team: 'PVE',
        position: phase === 1 && s.tick % 300 !== 0 ? { ...t.position } : { ...b.position },
        radius: phase === 1 ? 3.5 : phase === 2 ? 5 : 6.5,
        remaining: 0.1,
        delay: 1.3,
        tick: 0,
        effects: [
          { kind: 'damage', power: phase === 3 ? 320 : 210 },
          { kind: 'slow', power: 0.4, duration: 2 },
        ],
        friendly: false,
        color: '#ec7856',
        telegraph: true,
        shape: phase === 1 && s.tick % 300 === 0 ? 'cone' : 'circle',
        facing: Math.atan2(t.position.x - b.position.x, t.position.z - b.position.z),
        arc: Math.PI / 2,
      });
      if (phase === 3)
        s.zones.push({
          id: ++this.combat.serial,
          source: b.id,
          team: 'PVE',
          position: { ...t.position },
          radius: 3,
          remaining: 0.1,
          delay: 1.8,
          tick: 0,
          effects: [{ kind: 'damage', power: 240 }],
          friendly: false,
          color: '#ec7856',
          telegraph: true,
        });
    }
  }
  snapshot(): string {
    return JSON.stringify(this.state);
  }
  static restore(snapshot: string) {
    const state = JSON.parse(snapshot) as MatchState;
    if (state.version !== 1) throw new Error('Unsupported snapshot');
    const sim = new Simulation({
      mode: state.mode,
      classId: state.entities.find((e) => e.controller === 'HUMAN_LOCAL')!.classId,
      seed: state.seed,
    });
    sim.state = state;
    sim.combat.state = state;
    return sim;
  }
}
