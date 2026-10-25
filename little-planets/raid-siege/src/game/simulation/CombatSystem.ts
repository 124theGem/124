import { abilityChargeCost } from '../core/types';
import type {
  AbilityDef,
  AnimationState,
  EffectSpec,
  Entity,
  GameEvent,
  MatchState,
  PendingCast,
  Projectile,
  Zone,
  Vec2,
} from '../core/types';
import { add, clamp, direction, distance, lineClear, normalize } from '../core/math';
import { MINER_REPULSE_DAMAGE, SEEKER_HEALTH, SEEKER_DAMAGE } from '../classes/balance';
import { getClass } from '../classes/catalog';
import { navigable, navigate } from '../ai/navigation';
import { COMBAT_SPEED, combatDuration } from '../core/tempo';
import { basicAttackSpec, inCone } from '../controls/aim';
import { arenaAllowsMove, barrierBlocks } from './defenses';
import { makeEntity } from '../teams/roster';
export const has = (e: Entity, kind: string) =>
  e.statuses.some((t) => t.kind === kind && t.remaining > 0);
export const strength = (e: Entity, kind: string) =>
  Math.max(0, ...e.statuses.filter((t) => t.kind === kind).map((t) => t.power));
export class CombatSystem {
  get serial() {
    return this.state.serial;
  }
  set serial(value: number) {
    this.state.serial = value;
  }
  constructor(
    public state: MatchState,
    private summon: (source: Entity, amount: number, duration: number) => void,
  ) {}
  event(event: Omit<GameEvent, 'id'>) {
    this.state.events.push({ ...event, position: { ...event.position }, id: ++this.serial });
  }
  animate(e: Entity, animation: AnimationState, duration = 0.55) {
    const casting = e.animation.startsWith('skill') || e.animation === 'ultimate';
    if (
      casting &&
      e.animationUntil > this.state.time &&
      (animation === 'attack' || animation === 'hit')
    )
      return;
    e.animation = animation;
    e.animationUntil = this.state.time + duration;
    e.animationSerial++;
  }
  move(e: Entity, vector: Vec2, dt: number, dash = false) {
    const d = Math.hypot(vector.x, vector.z);
    if (!d || !e.alive || e.leap || has(e, 'stun') || has(e, 'root')) return;
    const v = d > 1 ? normalize(vector) : vector;
    const speed = dash
      ? 22 * COMBAT_SPEED
      : e.speed * (1 + strength(e, 'haste')) * (1 - strength(e, 'slow'));
    const next = add(e.position, v, speed * dt);
    // Axis sliding plus substeps in dodges avoids walking or dashing through walls.
    const px = { x: next.x, z: e.position.z };
    if (navigable(this.state.map, px) && arenaAllowsMove(this.state, e.position, px))
      e.position.x = px.x;
    const pz = { x: e.position.x, z: next.z };
    if (navigable(this.state.map, pz) && arenaAllowsMove(this.state, e.position, pz))
      e.position.z = pz.z;
    e.facing = Math.atan2(v.x, v.z);
    if (e.animationUntil <= this.state.time) e.animation = 'run';
  }
  target(e: Entity, range: number, targetId?: string, friendly = false): Entity | undefined {
    const valid = (t: Entity) =>
      t.alive &&
      (friendly ? t.team === e.team : t.team !== e.team && !has(t, 'stealth')) &&
      distance(e.position, t.position) <= range &&
      lineClear(e.position, t.position, this.state.map.obstacles);
    const explicit = this.state.entities.find((t) => t.id === targetId && valid(t));
    if (explicit) return explicit;
    return this.state.entities
      .filter(valid)
      .sort((a, b) =>
        friendly
          ? a.hp / a.maxHp - b.hp / b.maxHp
          : distance(a.position, e.position) - distance(b.position, e.position),
      )[0];
  }
  damage(
    source: Entity,
    target: Entity,
    amount: number,
    magical = false,
    origin?: Vec2,
    persistent = false,
  ) {
    if (
      (!source.alive && !persistent) ||
      !target.alive ||
      source.team === target.team ||
      has(target, 'invulnerable') ||
      barrierBlocks(this.state, source.team, origin ?? source.position, target.position)
    )
      return;
    let multiplier = (1 + strength(source, 'power')) * (1 - strength(source, 'weakness'));
    if (source.classId === 'berserker') multiplier *= 1 + (1 - source.hp / source.maxHp) * 0.6;
    if (source.classId === 'assassin') {
      const to = direction(target.position, source.position);
      if (to.x * Math.sin(target.facing) + to.z * Math.cos(target.facing) < -0.3)
        multiplier *= 1.35;
    }
    const taunt = source.statuses.find((t) => t.kind === 'taunt');
    if (taunt && target.id !== taunt.source) multiplier *= 1 - taunt.power;
    let armor = magical ? target.resist : target.armor;
    if (source.classId === 'crossbow') armor *= 0.5;
    let reduction = strength(target, 'defense');
    if (
      this.state.entities.some(
        (e) =>
          e.alive &&
          e.team === target.team &&
          e.classId === 'paladin' &&
          distance(e.position, target.position) < 7,
      )
    )
      reduction = Math.max(reduction, 0.1);
    let hit = ((amount * multiplier * 100) / (100 + armor)) * (1 - reduction);
    const absorbed = Math.min(target.shield, hit);
    target.shield -= absorbed;
    hit -= absorbed;
    const actual = Math.min(target.hp, hit);
    target.hp -= actual;
    source.stats.damage += actual;
    source.ultimate = clamp(
      source.ultimate +
        (actual / Math.max(1, source.attack)) * (source.classId === 'demolitionist' ? 100 / 6 : 20),
      0,
      100,
    );
    target.ultimate = clamp(target.ultimate + (actual / target.maxHp) * 12, 0, 100);
    source.statuses = source.statuses.filter((t) => t.kind !== 'stealth');
    if (actual > 0) {
      this.event({
        type: 'damage',
        position: target.position,
        value: Math.round(actual),
        color: target.team === 'A' ? '#fa9d92' : '#f4e5bc',
        sourceId: source.id,
        classId: source.classId,
      });
      if (target.animationUntil < this.state.time) this.animate(target, 'hit', 0.16);
    }
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.leap = undefined;
      target.shield = 0;
      target.stats.deaths++;
      target.aiState = 'Dead';
      this.animate(target, 'death', 10000);
      target.respawnAt = Math.ceil((this.state.time + 8) / 10) * 10;
      source.stats.kills++;
      this.event({ type: 'death', position: target.position, color: '#c7af7c' });
      for (const n of this.state.entities.filter(
        (n) =>
          n.classId === 'necromancer' &&
          n.team !== target.team &&
          distance(n.position, target.position) < 12,
      ))
        n.resource = Math.min(100, n.resource + 20);
    }
  }
  heal(source: Entity, target: Entity, amount: number) {
    if (!target.alive || target.team !== source.team) return;
    const value = Math.min(
      target.maxHp - target.hp,
      amount * (source.classId === 'priest' ? 1.25 : 1),
    );
    if (value <= 0) return;
    target.hp += value;
    source.stats.healing += value;
    source.ultimate = Math.min(100, source.ultimate + (value / source.maxHp) * 40);
    this.event({
      type: 'heal',
      position: target.position,
      value: Math.round(value),
      color: '#89e8b9',
      sourceId: source.id,
      classId: source.classId,
    });
  }
  effects(
    source: Entity,
    target: Entity,
    effects: EffectSpec[],
    origin?: Vec2,
    persistent = false,
  ) {
    if (
      source.team !== target.team &&
      barrierBlocks(this.state, source.team, origin ?? source.position, target.position)
    )
      return;
    for (const f of effects) {
      if (f.kind === 'damage')
        this.damage(
          source,
          target,
          f.power,
          getClass(source.classId).model === 'Mage',
          origin,
          persistent,
        );
      else if (f.kind === 'heal')
        this.heal(source, target.team === source.team ? target : source, f.power);
      else if (f.kind === 'shield') {
        if (source.team === target.team && target.alive)
          target.shield = Math.min(target.maxHp * 0.65, target.shield + f.power);
      } else if (f.kind === 'cleanse')
        target.statuses = target.statuses.filter((t) =>
          ['defense', 'power', 'haste', 'invulnerable'].includes(t.kind),
        );
      else if (f.kind === 'revive') {
        if (
          !target.alive &&
          target.kind === 'hero' &&
          !target.revived &&
          source.team === target.team
        ) {
          target.alive = true;
          target.hp = target.maxHp * f.power;
          target.revived = true;
          target.statuses = [];
          this.animate(target, 'idle', 0);
        }
      } else if (f.kind === 'dash' || f.kind === 'blink') {
        const dir = direction(source.position, target.position);
        const end =
          f.kind === 'blink'
            ? add(
                target.position,
                { x: -Math.sin(target.facing), z: -Math.cos(target.facing) },
                1.5,
              )
            : add(
                source.position,
                dir,
                Math.min(f.power, Math.max(0, distance(source.position, target.position) - 1.5)),
              );
        if (
          navigable(this.state.map, end) &&
          arenaAllowsMove(this.state, source.position, end) &&
          lineClear(source.position, end, this.state.map.obstacles)
        )
          source.position = end;
      } else if (f.kind === 'knockback') {
        const end = add(
          target.position,
          direction(origin ?? source.position, target.position),
          f.power,
        );
        if (
          navigable(this.state.map, end) &&
          arenaAllowsMove(this.state, target.position, end) &&
          lineClear(target.position, end, this.state.map.obstacles)
        )
          target.position = end;
      } else if (f.kind === 'summon') this.summon(source, f.power, f.duration ?? 15);
      else if (f.kind === 'barrier') continue;
      else if (f.kind === 'reset') {
        source.cooldowns[0] = 0;
        source.cooldowns[1] = 0;
        source.attackCooldown = 0;
      } else {
        if (
          ['haste', 'power', 'defense', 'stealth', 'invulnerable'].includes(f.kind) &&
          target.team !== source.team
        ) {
          this.effects(source, source, [f]);
          continue;
        }
        if (!target.alive) continue;
        const old = target.statuses.find((t) => t.kind === f.kind && t.source === source.id);
        if (old) {
          old.remaining = f.duration ?? 3;
          old.power = f.power;
        } else
          target.statuses.push({
            kind: f.kind,
            power: f.power,
            remaining: f.duration ?? 3,
            source: source.id,
            tick: 0,
          });
      }
    }
  }
  private aimedTarget(e: Entity, range: number, aim: Vec2, friendly = false) {
    const dir = direction(e.position, aim);
    return this.state.entities
      .filter((t) => {
        if (!t.alive || (friendly ? t.team !== e.team : t.team === e.team || has(t, 'stealth')))
          return false;
        const dx = t.position.x - e.position.x,
          dz = t.position.z - e.position.z;
        const along = dx * dir.x + dz * dir.z;
        return (
          along >= 0 &&
          along <= range &&
          Math.abs(dx * dir.z - dz * dir.x) <= (t.kind === 'boss' ? 1.4 : 0.85) &&
          lineClear(e.position, t.position, this.state.map.obstacles)
        );
      })
      .sort((a, b) => distance(e.position, a.position) - distance(e.position, b.position))[0];
  }
  attack(e: Entity, targetId?: string, aim?: Vec2) {
    if (
      e.attackCooldown > 0 ||
      e.leap ||
      this.state.casts?.some((c) => c.source === e.id) ||
      has(e, 'stun')
    )
      return;
    const manual =
      aim && Number.isFinite(aim.x) && Number.isFinite(aim.z) && distance(e.position, aim) > 0.01;
    const t = manual ? this.aimedTarget(e, e.range, aim) : this.target(e, e.range, targetId);
    if (!t && !manual) return;
    const dir = direction(e.position, manual ? aim : t!.position);
    e.facing = Math.atan2(dir.x, dir.z);
    this.animate(e, 'attack', Math.min(combatDuration(0.8), e.interval));
    e.attackCooldown =
      (e.interval / (1 + strength(e, 'haste'))) *
      (e.classId === 'duelist' && e.combo % 3 === 2 ? 0.75 : 1);
    e.combo++;
    if (e.classId === 'demolitionist') {
      const center = manual
        ? add(e.position, dir, Math.min(e.range, distance(e.position, aim)))
        : { ...t!.position };
      this.launchArea(
        e,
        {
          ...getClass(e.classId).abilities[0],
          id: 'demolitionist-basic',
          effects: [{ kind: 'damage', power: e.attack }],
          radius: 2.8,
          mineCount: 3,
          delay: 0,
        },
        center,
      );
    } else if (e.range > 5)
      this.state.projectiles.push({
        id: ++this.serial,
        source: e.id,
        team: e.team,
        position: { ...e.position },
        direction: dir,
        speed: 18 * COMBAT_SPEED,
        remaining: e.range / (18 * COMBAT_SPEED),
        warmup: combatDuration(0.12),
        damage: e.attack,
        targetId: manual ? undefined : t?.id,
        color: getClass(e.classId).color,
      });
    else if (basicAttackSpec(e).shape === 'cone') {
      const spec = basicAttackSpec(e);
      for (const enemy of this.state.entities.filter(
        (target) =>
          target.alive &&
          target.team !== e.team &&
          !has(target, 'stealth') &&
          inCone(e.position, dir, target.position, spec.range, spec.arc) &&
          lineClear(e.position, target.position, this.state.map.obstacles),
      ))
        this.damage(e, enemy, e.attack);
    } else if (t) this.damage(e, t, e.attack);
    this.event({
      type: 'cast',
      position: e.position,
      target: t ? { ...t.position } : add(e.position, dir, e.range),
      color: getClass(e.classId).color,
      sourceId: e.id,
      classId: e.classId,
      origin: { ...e.position },
      facing: e.facing,
    });
  }
  cast(e: Entity, index: number, targetId?: string, aim?: Vec2): boolean {
    const a = getClass(e.classId).abilities[index];
    if (
      !a ||
      !e.alive ||
      e.leap ||
      this.state.casts?.some((c) => c.source === e.id) ||
      e.cooldowns[index] > 0 ||
      e.resource < a.cost ||
      has(e, 'stun') ||
      e.ultimate < abilityChargeCost(a)
    )
      return false;
    const manual =
      aim &&
      !targetId &&
      Number.isFinite(aim.x) &&
      Number.isFinite(aim.z) &&
      distance(e.position, aim) > 0.01;
    let target: Entity | undefined;
    let center = { ...e.position };
    if (a.target === 'enemy' || a.target === 'ally') {
      target = manual
        ? this.aimedTarget(e, a.range, aim, a.target === 'ally')
        : this.target(e, a.range, targetId, a.target === 'ally');
      if (!target && !manual) return false;
      center = manual
        ? add(e.position, direction(e.position, aim), Math.min(a.range, distance(e.position, aim)))
        : { ...target!.position };
    }
    if (a.target === 'ground' || a.target === 'line') {
      target = this.target(e, Math.max(a.range, a.radius), targetId);
      if (a.range > 0) {
        center =
          aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)
            ? { ...aim }
            : target
              ? { ...target.position }
              : add(e.position, { x: Math.sin(e.facing), z: Math.cos(e.facing) }, a.range * 0.6);
        if (distance(e.position, center) > a.range)
          center = add(e.position, direction(e.position, center), a.range);
      }
      if (
        a.delivery === 'jump' &&
        (!navigable(this.state.map, center) || !arenaAllowsMove(this.state, e.position, center))
      )
        return false;
      if (
        a.delivery !== 'jump' &&
        a.delivery !== 'mines' &&
        !lineClear(e.position, center, this.state.map.obstacles)
      )
        return false;
    }
    e.resource -= a.cost;
    e.cooldowns[index] = a.cooldown;
    if (a.ultimate) e.ultimate = Math.max(0, e.ultimate - abilityChargeCost(a));
    this.animate(
      e,
      a.ultimate ? 'ultimate' : (['skill1', 'skill2'] as const)[index],
      combatDuration(a.ultimate ? 1.6 : 1.05),
    );
    if (distance(e.position, center) > 0.2) {
      const dir = direction(e.position, center);
      e.facing = Math.atan2(dir.x, dir.z);
    }
    this.event({
      type: 'cast',
      position: center,
      target: { ...e.position },
      color: a.color,
      ultimate: a.ultimate,
      name: a.name,
      sourceId: e.id,
      classId: e.classId,
      abilityId: a.id,
      castStage: 'windup',
      origin: { ...e.position },
      radius: a.radius,
      duration: a.duration,
      delay: a.delay,
      facing: e.facing,
    });
    (this.state.casts ??= []).push({
      id: ++this.serial,
      source: e.id,
      abilityId: a.id,
      targetId: target?.id,
      position: { ...center },
      aim: manual && aim ? { ...aim } : undefined,
      manual: !!manual,
      remaining: combatDuration(a.ultimate ? 0.42 : 0.28),
    });
    return true;
  }
  private impactEvent(e: Entity, a: AbilityDef, center: Vec2, origin: Vec2) {
    this.event({
      type: 'cast',
      castStage: 'impact',
      position: center,
      origin: { ...origin },
      target: { ...origin },
      sourceId: e.id,
      classId: e.classId,
      abilityId: a.id,
      name: a.name,
      color: a.color,
      ultimate: a.ultimate,
      radius: a.radius,
      duration: a.duration,
      delay: 0,
      facing: e.facing,
    });
  }
  private launchArea(e: Entity, a: AbilityDef, center: Vec2) {
    const duration = Math.max(
      combatDuration(0.25),
      distance(e.position, center) / (16 * COMBAT_SPEED),
      combatDuration(a.delay ?? 0),
    );
    this.state.projectiles.push({
      id: ++this.serial,
      source: e.id,
      team: e.team,
      position: { ...e.position },
      direction: direction(e.position, center),
      speed: 16 * COMBAT_SPEED,
      remaining: duration + 0.05,
      damage: 0,
      color: a.color,
      abilityId: a.id,
      effects: a.effects,
      warmup: a.id === 'demolitionist-basic' ? combatDuration(0.12) : 0,
      area: {
        origin: { ...e.position },
        destination: { ...center },
        elapsed: 0,
        flightTime: duration,
        radius: a.radius || 3,
        duration: a.duration,
        friendly: a.target === 'team',
        mines: a.delivery === 'mines' ? a.mineCount : undefined,
        lob: a.delivery === 'mines',
      },
    });
  }
  private resolveCast(cast: PendingCast) {
    const e = this.state.entities.find((e) => e.id === cast.source);
    if (!e?.alive || has(e, 'stun')) return;
    const a = getClass(e.classId).abilities.find((a) => a.id === cast.abilityId);
    if (!a) return;
    const target = this.state.entities.find((t) => t.id === cast.targetId && t.alive);
    if ((a.target === 'enemy' || a.target === 'ally') && !target && !cast.manual) return;
    const aim = cast.aim,
      manual = cast.manual;
    const center =
      a.target === 'self' || a.target === 'team'
        ? { ...e.position }
        : target && !manual && (a.target === 'enemy' || a.target === 'ally')
          ? { ...target.position }
          : { ...cast.position };
    if (distance(e.position, center) > 0.1)
      e.facing = Math.atan2(center.x - e.position.x, center.z - e.position.z);
    if (a.delivery === 'jump') {
      if (!navigable(this.state.map, center) || !arenaAllowsMove(this.state, e.position, center))
        return;
      e.leap = {
        origin: { ...e.position },
        destination: { ...center },
        elapsed: 0,
        duration: combatDuration(0.55 + distance(e.position, center) / 25),
        abilityId: a.id,
      };
      this.animate(e, 'ultimate', e.leap.duration);
      return;
    }
    if (a.delivery === 'wall') {
      const dir =
        distance(e.position, center) > 0.01
          ? direction(e.position, center)
          : { x: Math.sin(e.facing), z: Math.cos(e.facing) };
      const wallCenter = add(e.position, dir, 2.3),
        facing = Math.atan2(dir.x, dir.z);
      this.state.zones.push({
        id: ++this.serial,
        source: e.id,
        team: e.team,
        position: wallCenter,
        radius: 0,
        remaining: 5,
        delay: 0,
        tick: 0,
        effects: [],
        friendly: true,
        color: a.color,
        telegraph: false,
        abilityId: a.id,
        barrier: { facing, width: 9 },
      });
      this.impactEvent(e, a, wallCenter, e.position);
      return;
    }
    if (a.delivery === 'repulse') {
      this.effects(e, e, [{ kind: 'invulnerable', power: 1, duration: 1 }]);
      this.state.zones.push({
        id: ++this.serial,
        source: e.id,
        team: e.team,
        position: { ...e.position },
        radius: 4.5,
        remaining: 0.1,
        delay: 1,
        tick: 0,
        effects: [
          { kind: 'damage', power: MINER_REPULSE_DAMAGE },
          { kind: 'knockback', power: 4 },
        ],
        friendly: false,
        color: a.color,
        telegraph: true,
        abilityId: a.id,
        followSource: true,
      });
      this.impactEvent(e, a, center, e.position);
      return;
    }
    if (a.delivery === 'seeker') {
      this.spawnSeeker(e);
      this.impactEvent(e, a, center, e.position);
      return;
    }
    if (a.target === 'ground' && a.range >= 6) {
      this.launchArea(e, a, center);
      return;
    }
    if (a.type === 'projectile' && (target || manual)) {
      this.state.projectiles.push({
        id: ++this.serial,
        source: e.id,
        team: e.team,
        position: { ...e.position },
        direction: direction(e.position, manual && aim ? aim : target!.position),
        speed: 19 * COMBAT_SPEED,
        remaining: a.range / (19 * COMBAT_SPEED),
        damage: 0,
        targetId: manual ? undefined : target?.id,
        color: a.color,
        effects: a.effects,
        abilityId: a.id,
      });
      return;
    }
    if (a.shape === 'cone') {
      const dir = { x: Math.sin(e.facing), z: Math.cos(e.facing) };
      this.impactEvent(e, a, add(e.position, dir, a.range), e.position);
      for (const enemy of this.state.entities.filter(
        (target) =>
          target.alive &&
          target.team !== e.team &&
          inCone(e.position, dir, target.position, a.range, a.arc ?? Math.PI / 2) &&
          lineClear(e.position, target.position, this.state.map.obstacles),
      ))
        this.effects(e, enemy, a.effects);
      return;
    }
    this.impactEvent(e, a, center, e.position);
    if ((a.delay ?? 0) > 0 || a.duration > 0) {
      const totem = a.id === 'shaman-2' ? 1.25 : 1;
      this.state.zones.push({
        id: ++this.serial,
        source: e.id,
        team: e.team,
        position: center,
        radius: (a.radius || 4) * totem,
        remaining: (a.duration || 0.1) * totem,
        delay: a.delay ?? 0,
        tick: 0,
        effects: a.effects,
        friendly: a.target === 'team',
        color: a.color,
        telegraph: !!a.delay,
        abilityId: a.id,
      });
    } else if (a.target === 'self') this.effects(e, e, a.effects);
    else if (a.target === 'team') {
      let revived = false;
      for (const ally of this.state.entities.filter(
        (t) =>
          t.team === e.team &&
          t.kind === 'hero' &&
          distance(e.position, t.position) <= (a.radius || 12),
      )) {
        const wasAlive = ally.alive;
        this.effects(
          e,
          ally,
          a.effects.filter((f) => f.kind !== 'revive' || !revived),
        );
        if (!wasAlive && ally.alive) revived = true;
      }
    } else if (a.target === 'line') {
      const dir = direction(e.position, center);
      for (const t of this.state.entities.filter((t) => t.alive && t.team !== e.team)) {
        const dx = t.position.x - e.position.x,
          dz = t.position.z - e.position.z;
        const dot = dx * dir.x + dz * dir.z;
        if (
          dot > 0 &&
          dot <= a.range &&
          Math.abs(dx * dir.z - dz * dir.x) < a.radius &&
          lineClear(e.position, t.position, this.state.map.obstacles)
        )
          this.effects(e, t, a.effects);
      }
    } else if (a.target === 'ground') {
      for (const t of this.state.entities.filter(
        (t) =>
          t.alive &&
          t.team !== e.team &&
          distance(t.position, center) <= a.radius &&
          lineClear(center, t.position, this.state.map.obstacles),
      ))
        this.effects(e, t, a.effects, center);
    } else if (target) this.effects(e, target, a.effects);
  }
  private areaImpact(source: Entity, p: Projectile) {
    const area = p.area!;
    if (area.mines) {
      this.scatterMines(source, area.destination, area.mines, p.effects ?? [], area.radius);
      return;
    }
    if (area.duration > 0) {
      this.state.zones.push({
        id: ++this.serial,
        source: source.id,
        team: source.team,
        position: { ...area.destination },
        radius: area.radius,
        remaining: area.duration,
        delay: 0,
        tick: 0,
        effects: p.effects ?? [],
        friendly: area.friendly,
        color: p.color,
        telegraph: false,
        abilityId: p.abilityId,
      });
    } else
      for (const target of this.state.entities.filter(
        (t) =>
          t.alive &&
          (area.friendly ? t.team === source.team : t.team !== source.team) &&
          distance(t.position, area.destination) <= area.radius &&
          lineClear(area.destination, t.position, this.state.map.obstacles),
      ))
        this.effects(source, target, p.effects ?? [], area.destination, true);
    const a = getClass(source.classId).abilities.find((a) => a.id === p.abilityId);
    if (a) this.impactEvent(source, a, area.destination, area.origin);
  }
  private scatterMines(
    source: Entity,
    center: Vec2,
    count: number,
    effects: EffectSpec[],
    radius: number,
  ) {
    const existing = this.state.zones.filter((z) => z.source === source.id && z.trap);
    for (const z of existing.slice(0, Math.max(0, existing.length + count - 24))) z.remaining = 0;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399,
        r = count === 3 ? 1.15 : Math.sqrt((i + 0.5) / count) * Math.max(1.5, radius - 0.8),
        position = { x: center.x + Math.sin(angle) * r, z: center.z + Math.cos(angle) * r };
      if (!navigable(this.state.map, position, 0.2)) continue;
      this.state.zones.push({
        id: ++this.serial,
        source: source.id,
        team: source.team,
        position,
        radius: 1.9,
        remaining: 5,
        delay: 0.5,
        tick: 0,
        effects,
        friendly: false,
        color: getClass(source.classId).color,
        telegraph: false,
        abilityId: 'demolitionist-mine',
        trap: { triggerRadius: 1.3 },
      });
    }
  }
  private spawnSeeker(owner: Entity) {
    const active = this.state.entities.filter(
      (e) => e.alive && e.kind === 'summon' && e.participantId === owner.id,
    );
    if (active.length >= 4) return;
    const head = makeEntity(
      `seeker-${this.state.spawnSerial++}`,
      'demolitionist',
      owner.team,
      { ...owner.position },
      'BOT',
      'Самоходный заряд',
    );
    head.kind = 'summon';
    head.participantId = owner.id;
    head.hp = head.maxHp = SEEKER_HEALTH;
    head.attack = 0;
    head.speed = 6.5 * COMBAT_SPEED;
    head.range = 1.8;
    head.lifetime = 8;
    head.seeker = {
      owner: owner.id,
      damage: SEEKER_DAMAGE,
      radius: 4,
      nextPath: 0,
      move: { x: 0, z: 0 },
    };
    this.state.entities.push(head);
  }
  private explodeSeeker(e: Entity) {
    if (!e.seeker || !e.alive) return;
    const total = e.stats.damage;
    for (const target of this.state.entities.filter(
      (t) =>
        t.alive &&
        t.team !== e.team &&
        distance(e.position, t.position) <= e.seeker!.radius &&
        lineClear(e.position, t.position, this.state.map.obstacles),
    ))
      this.damage(e, target, e.seeker.damage, false, e.position);
    const owner = this.state.entities.find((t) => t.id === e.seeker!.owner);
    if (owner) owner.stats.damage += e.stats.damage - total;
    this.event({
      type: 'cast',
      castStage: 'impact',
      position: e.position,
      sourceId: e.id,
      classId: 'demolitionist',
      abilityId: 'demolitionist-mine',
      radius: 4,
      color: '#ffb45b',
    });
    e.alive = false;
    e.hp = 0;
    this.animate(e, 'death', 10000);
  }
  update(dt: number) {
    const s = this.state;
    for (const e of s.entities) {
      if (!e.alive) continue;
      e.previous = { ...e.position };
      e.cooldowns = e.cooldowns.map((c) => Math.max(0, c - dt));
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.dodgeCooldown = Math.max(0, e.dodgeCooldown - dt);
      const bard = s.entities.some(
        (a) =>
          a.alive &&
          a.team === e.team &&
          a.classId === 'bard' &&
          distance(e.position, a.position) < 9,
      );
      e.resource = Math.min(100, e.resource + dt * (bard ? 13 : 10));
      e.ultimate = Math.min(100, e.ultimate + dt * 1.25);
      if (e.classId === 'druid') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.006 * dt);
      if (e.lifetime > 0) {
        e.lifetime -= dt;
        if (e.lifetime <= 0) {
          if (e.seeker) {
            this.explodeSeeker(e);
            continue;
          }
          e.alive = false;
          e.hp = 0;
          this.animate(e, 'death', 10000);
        }
      }
      for (const t of [...e.statuses]) {
        t.remaining -= dt;
        t.tick += dt;
        if ((t.kind === 'burn' || t.kind === 'poison') && t.tick >= 1) {
          t.tick -= 1;
          const source = s.entities.find((a) => a.id === t.source);
          if (source)
            this.damage(
              source,
              e,
              t.power * (t.kind === 'burn' && source.classId === 'firemage' ? 1.3 : 1),
              true,
            );
        }
      }
      e.statuses = e.statuses.filter((t) => t.remaining > 0);
      if (e.animationUntil <= s.time) e.animation = 'idle';
    }
    const queued = (s.casts ?? []).filter((c) => {
      const owner = s.entities.find((e) => e.id === c.source);
      return owner?.alive && !has(owner, 'stun');
    });
    const ready = queued.filter((c) => (c.remaining -= dt) <= 0);
    s.casts = queued.filter((c) => c.remaining > 0);
    for (const cast of ready) this.resolveCast(cast);
    for (const e of s.entities) {
      if (!e.alive) {
        e.leap = undefined;
        continue;
      }
      if (e.leap) {
        const leap = e.leap;
        leap.elapsed = Math.min(leap.duration, leap.elapsed + dt);
        const t = leap.elapsed / leap.duration;
        e.position = {
          x: leap.origin.x + (leap.destination.x - leap.origin.x) * t,
          z: leap.origin.z + (leap.destination.z - leap.origin.z) * t,
        };
        if (t >= 1) {
          e.leap = undefined;
          const a = getClass(e.classId).abilities.find((a) => a.id === leap.abilityId)!;
          for (const enemy of s.entities.filter(
            (t) => t.alive && t.team !== e.team && distance(t.position, e.position) <= a.radius,
          ))
            this.effects(e, enemy, a.effects, e.position);
          this.impactEvent(e, a, e.position, leap.origin);
          s.zones.push({
            id: ++this.serial,
            source: e.id,
            team: e.team,
            position: { ...e.position },
            radius: a.radius,
            remaining: a.arenaDuration ?? 5,
            delay: 0,
            tick: 0,
            effects: [],
            friendly: false,
            color: a.color,
            telegraph: false,
            arena: true,
            abilityId: a.id,
          });
        }
      }
      if (e.seeker) {
        const enemy = s.entities
          .filter((t) => t.alive && t.team !== e.team)
          .sort((a, b) => distance(a.position, e.position) - distance(b.position, e.position))[0];
        if (enemy && distance(enemy.position, e.position) <= 1.8) {
          this.explodeSeeker(e);
          continue;
        }
        if (enemy && s.time >= e.seeker.nextPath) {
          e.seeker.move = navigate(s.map, e.position, enemy.position);
          e.seeker.nextPath = s.time + 0.4;
        }
        if (enemy) this.move(e, e.seeker.move, dt);
      }
    }
    for (const p of [...s.projectiles]) {
      const source = s.entities.find((e) => e.id === p.source);
      if ((p.warmup ?? 0) > 0) {
        if (!source?.alive) {
          p.remaining = 0;
          continue;
        }
        p.warmup = Math.max(0, p.warmup! - dt);
        if (source) {
          p.position = { ...source.position };
          if (p.area) p.area.origin = { ...source.position };
        }
        continue;
      }
      if (p.area) {
        const before = { ...p.position },
          area = p.area;
        area.elapsed = Math.min(area.flightTime, area.elapsed + dt);
        const t = area.elapsed / area.flightTime;
        p.position = {
          x: area.origin.x + (area.destination.x - area.origin.x) * t,
          z: area.origin.z + (area.destination.z - area.origin.z) * t,
        };
        if (
          (!area.lob && !lineClear(before, p.position, s.map.obstacles)) ||
          barrierBlocks(s, p.team, before, p.position)
        ) {
          p.remaining = 0;
          continue;
        }
        if (t >= 1) {
          if (source) this.areaImpact(source, p);
          p.remaining = 0;
        }
        continue;
      }
      const travel = Math.min(dt, p.remaining);
      p.remaining -= dt;
      const before = { ...p.position };
      const t = s.entities.find((e) => e.id === p.targetId && e.alive);
      if (t) p.direction = direction(p.position, t.position);
      p.position = add(p.position, p.direction, p.speed * travel);
      const clear =
        lineClear(before, p.position, s.map.obstacles) &&
        !barrierBlocks(s, p.team, before, p.position);
      if (!clear) p.remaining = 0;
      if (clear) {
        const hit = s.entities.find((e) => {
          if (!e.alive || e.team === p.team) return false;
          const dx = p.position.x - before.x,
            dz = p.position.z - before.z;
          const length2 = dx * dx + dz * dz;
          const t = length2
            ? clamp(
                ((e.position.x - before.x) * dx + (e.position.z - before.z) * dz) / length2,
                0,
                1,
              )
            : 0;
          return (
            distance(e.position, { x: before.x + dx * t, z: before.z + dz * t }) <
            (e.kind === 'boss' ? 1.4 : 0.75)
          );
        });
        if (hit && source) {
          if (p.effects) this.effects(source, hit, p.effects, p.position, true);
          else {
            this.damage(source, hit, p.damage, false, p.position, true);
            if (source.classId === 'icemage')
              this.effects(source, hit, [{ kind: 'slow', power: 0.15, duration: 1.5 }]);
          }
          p.remaining = 0;
        }
      }
    }
    s.projectiles = s.projectiles.filter((p) => p.remaining > 0);
    for (const z of s.zones) {
      if (z.followSource) {
        const owner = s.entities.find((e) => e.id === z.source);
        if (owner) z.position = { ...owner.position };
      }
      if (z.delay > 0) {
        z.delay -= dt;
        continue;
      }
      z.remaining -= dt;
      if (z.arena || z.barrier) continue;
      if (z.trap) {
        if (
          z.remaining <= 0 ||
          s.entities.some(
            (e) =>
              e.alive &&
              e.team !== z.team &&
              distance(e.position, z.position) <= z.trap!.triggerRadius,
          )
        ) {
          const source = s.entities.find((e) => e.id === z.source);
          if (source)
            for (const target of s.entities.filter(
              (e) =>
                e.alive &&
                e.team !== z.team &&
                distance(e.position, z.position) <= z.radius &&
                lineClear(z.position, e.position, s.map.obstacles),
            ))
              this.effects(source, target, z.effects, z.position, true);
          this.event({
            type: 'cast',
            castStage: 'impact',
            position: z.position,
            sourceId: z.source,
            classId: 'demolitionist',
            abilityId: 'demolitionist-mine',
            radius: z.radius,
            color: z.color,
          });
          z.remaining = 0;
        }
        continue;
      }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 1;
        const source = s.entities.find((e) => e.id === z.source);
        if (!source) continue;
        for (const e of s.entities.filter(
          (e) =>
            e.alive &&
            (z.friendly ? e.team === z.team : e.team !== z.team) &&
            distance(e.position, z.position) <= z.radius &&
            lineClear(z.position, e.position, s.map.obstacles),
        )) {
          if (z.shape === 'cone') {
            const dir = direction(z.position, e.position);
            if (
              dir.x * Math.sin(z.facing ?? 0) + dir.z * Math.cos(z.facing ?? 0) <
              Math.cos((z.arc ?? Math.PI / 2) / 2)
            )
              continue;
          }
          this.effects(source, e, z.effects, z.position, true);
        }
        if (z.abilityId === 'demolitionist-2')
          this.event({
            type: 'cast',
            castStage: 'impact',
            position: z.position,
            sourceId: source.id,
            classId: source.classId,
            abilityId: 'demolitionist-mine',
            radius: z.radius,
            color: z.color,
          });
        // Persistent zones already have an effect; replay only the actual boss impact.
        if (z.telegraph && !z.abilityId)
          this.event({
            type: 'cast',
            position: z.position,
            color: z.color,
            sourceId: source.id,
            classId: source.classId,
            abilityId: 'boss-slam',
            radius: z.radius,
            facing: z.facing,
          });
      }
    }
    s.zones = s.zones.filter((z) => z.remaining > 0);
  }
}
