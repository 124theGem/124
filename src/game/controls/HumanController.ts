import type { Command, MatchState, Vec2 } from '../core/types';
import type { Controller } from '../networking/interfaces/controllers';
export class HumanController implements Controller {
  readonly actorId = 'A0';
  move: Vec2 = { x: 0, z: 0 };
  attack = false;
  private ability: number | undefined;
  private dodge = false;
  private shot = false;
  preview: { index: number; aim?: Vec2; drag?: { x: number; y: number } } | undefined;
  aim: Vec2 | undefined;
  keys = new Set<string>();
  reset() {
    this.move = { x: 0, z: 0 };
    this.attack = false;
    this.ability = undefined;
    this.dodge = false;
    this.shot = false;
    this.preview = undefined;
    this.keys.clear();
    this.aim = undefined;
  }
  useAbility(index: number, aim?: Vec2) {
    this.ability = index;
    this.aim = aim;
  }
  fire(aim?: Vec2) {
    this.shot = true;
    this.aim = aim;
  }
  roll() {
    this.dodge = true;
  }
  sample(_state: Readonly<MatchState>): Command {
    const keyX =
      Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
      Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const keyZ =
      Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
      Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    // Camera is aligned to world axes: screen right is +X and screen up is +Z.
    const command: Command = {
      actorId: this.actorId,
      move: keyX || keyZ ? { x: keyX, z: keyZ } : this.move,
      attack: this.shot || this.attack || this.keys.has('Space'),
      ability: this.ability,
      dodge: this.dodge,
      aim: this.aim,
    };
    this.ability = undefined;
    this.dodge = false;
    this.shot = false;
    this.aim = undefined;
    return command;
  }
}
