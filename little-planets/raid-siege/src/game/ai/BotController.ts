import type { Command, Entity, MatchState, Vec2 } from '../core/types';
import type { Controller } from '../networking/interfaces/controllers';
import { getClass } from '../classes/catalog';
import { distance, direction } from '../core/math';
import { navigate } from './navigation';
export type Difficulty = 'easy' | 'normal' | 'hard';
export class BotController implements Controller {
  private nextThink = 0;
  private command: Command;
  private waypoint: Vec2 | null = null;
  private nextPath = 0;
  constructor(
    public readonly actorId: string,
    private difficulty: Difficulty = 'normal',
  ) {
    this.command = { actorId };
  }
  reset() {
    this.nextThink = 0;
    this.nextPath = 0;
    this.waypoint = null;
    this.command = { actorId: this.actorId };
  }
  sample(s: Readonly<MatchState>): Command {
    const me = s.entities.find((e) => e.id === this.actorId);
    if (me?.seeker) return { actorId: this.actorId };
    if (!me || !me.alive) {
      if (me) me.aiState = 'Dead';
      return { actorId: this.actorId };
    }
    if (s.time < this.nextThink) return { ...this.command, ability: undefined, dodge: false };
    this.nextThink = s.time + { easy: 0.65, normal: 0.32, hard: 0.2 }[this.difficulty];
    const c = getClass(me.classId),
      cmd: Command = { actorId: me.id, move: { x: 0, z: 0 } };
    const moveTo = (p: Vec2) => {
      if (!this.waypoint || s.time >= this.nextPath || distance(me.position, this.waypoint) < 1) {
        this.waypoint = p;
        this.nextPath = s.time + 0.6;
        cmd.move = navigate(s.map, me.position, p);
      } else cmd.move = this.command.move;
    };
    const allies = s.entities.filter((e) => e.team === me.team && e.kind === 'hero');
    const enemies = s.entities.filter(
      (e) =>
        e.alive &&
        e.team !== me.team &&
        !(e.team === 'PVE' && me.team === 'PVE') &&
        !e.statuses.some((t) => t.kind === 'stealth'),
    );
    const visible = enemies.filter(
      (e) => distance(e.position, me.position) < (me.kind === 'hero' ? 19 : 12),
    );
    const taunt = me.statuses.find((t) => t.kind === 'taunt');
    let enemy = taunt ? enemies.find((e) => e.id === taunt.source) : undefined;
    if (!enemy) enemy = visible.sort((a, b) => this.priority(me, a) - this.priority(me, b))[0];
    const danger = s.zones.find(
      (z) =>
        z.telegraph &&
        z.team !== me.team &&
        z.delay > 0 &&
        distance(z.position, me.position) < z.radius + 1,
    );
    if (danger) {
      me.aiState = 'AvoidDanger';
      cmd.move = direction(danger.position, me.position);
      if (!cmd.move.x && !cmd.move.z) cmd.move.x = 1;
      cmd.dodge = me.dodgeCooldown <= 0;
      this.command = cmd;
      return cmd;
    }
    const wounded = allies
      .filter((e) => e.alive)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const skills =
      me.kind === 'hero'
        ? c.abilities
            .map((a, i) => ({ a, i }))
            .filter(
              ({ a, i }) =>
                me.cooldowns[i] <= 0 &&
                me.resource >= a.cost &&
                (!a.ultimate || me.ultimate >= 100),
            )
        : [];
    for (const { a, i } of skills) {
      let target: Entity | undefined;
      if (a.ai === 'heal' && wounded && wounded.hp / wounded.maxHp < (a.ultimate ? 0.55 : 0.8))
        target = wounded;
      else if (
        a.ai === 'defense' &&
        enemy &&
        (me.hp / me.maxHp < 0.65 || (wounded && wounded.hp / wounded.maxHp < 0.6))
      )
        target = a.target === 'ally' ? wounded : me;
      else if (a.ai === 'buff' && enemy) target = me;
      else if (a.ai === 'offense' && enemy) target = enemy;
      if (!target) continue;
      const limit =
        a.target === 'ground' && a.range === 0
          ? a.radius
          : a.target === 'team'
            ? a.radius
            : a.range;
      if (target.id !== me.id && distance(me.position, target.position) > limit) {
        if (a.ai === 'heal') {
          me.aiState = 'HealAlly';
          moveTo(target.position);
        }
        continue;
      }
      cmd.ability = i;
      cmd.targetId = target.id;
      cmd.aim = { ...target.position };
      me.aiState = a.ai === 'heal' ? 'HealAlly' : 'UseAbility';
      break;
    }
    const human = allies.find((e) => e.controller === 'HUMAN_LOCAL');
    const objective =
      s.mode === 'raid'
        ? (human?.position ?? s.map.spawns.A)
        : (s.points.find((p) => !p.locked && (s.mode === 'hill' || p.owner !== 'A'))?.position ??
          s.points[s.points.length - 1].position);
    if (me.kind !== 'hero' && me.kind !== 'summon') {
      if (distance(me.home, me.position) > 18 || !enemy) {
        me.aiState = 'Patrol';
        if (distance(me.home, me.position) > 1) moveTo(me.home);
      } else this.engage(me, enemy, cmd, moveTo);
    } else if (enemy && (s.mode === 'raid' || distance(enemy.position, objective) < 12)) {
      if (me.hp / me.maxHp < 0.22 && c.role !== 'tank') {
        me.aiState = 'Retreat';
        cmd.move = direction(enemy.position, me.position);
      } else if (
        s.mode !== 'raid' &&
        distance(me.position, objective) > 6 &&
        distance(enemy.position, me.position) > 5
      ) {
        me.aiState = 'MoveToObjective';
        moveTo(objective);
      } else this.engage(me, enemy, cmd, moveTo);
    } else if (objective && distance(me.position, objective) > (s.mode === 'raid' ? 3.5 : 1.5)) {
      me.aiState = s.mode === 'raid' ? 'Follow' : 'MoveToObjective';
      moveTo({ x: objective.x + (me.id.endsWith('2') ? 1.5 : -1.5), z: objective.z });
    } else
      me.aiState =
        s.mode === 'raid' ? 'Idle' : s.points[0].owner === me.team ? 'DefendPoint' : 'CapturePoint';
    this.command = cmd;
    return cmd;
  }
  private priority(me: Entity, enemy: Entity) {
    let p = distance(me.position, enemy.position);
    if (getClass(me.classId).role === 'tank' && enemy.kind === 'boss') p -= 8;
    if (me.classId === 'assassin') p += (enemy.hp / enemy.maxHp) * 5;
    return p;
  }
  private engage(me: Entity, enemy: Entity, cmd: Command, moveTo: (p: Vec2) => void) {
    me.targetId = enemy.id;
    cmd.targetId ??= enemy.id;
    const d = distance(me.position, enemy.position);
    const role = getClass(me.classId).role;
    if (d > me.range * 0.88) {
      me.aiState = 'SeekEnemy';
      moveTo(enemy.position);
    } else if (me.range > 5 && d < 3.5) {
      me.aiState = 'Retreat';
      cmd.move = direction(enemy.position, me.position);
    } else {
      me.aiState = 'Attack';
      cmd.attack = true;
      if (me.classId === 'assassin' && d > 1.7)
        moveTo({
          x: enemy.position.x - Math.sin(enemy.facing) * 1.7,
          z: enemy.position.z - Math.cos(enemy.facing) * 1.7,
        });
      if (role === 'healer' && d < 4) cmd.move = direction(enemy.position, me.position);
    }
  }
}
