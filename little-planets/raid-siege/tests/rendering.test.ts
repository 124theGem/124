import { describe, it, expect } from 'vitest';
import { FrameEvents, renderPixelRatio } from '../src/game/rendering/RenderQuality';
import { Simulation } from '../src/game/simulation/Simulation';
import type { GameEvent } from '../src/game/core/types';

describe('clear rendering on high-DPR phones', () => {
  it('renders at CSS resolution or better on all profiles instead of dividing by device DPR', () => {
    expect(renderPixelRatio('medium', 3, 844, 390)).toBe(1.5);
    expect(renderPixelRatio('high', 3, 844, 390)).toBe(2);
    for (const q of ['low', 'medium', 'high'] as const)
      for (const dpr of [1, 2, 3, 4])
        expect(renderPixelRatio(q, dpr, 844, 390)).toBeGreaterThanOrEqual(1);
  });
  it('caps excessive retina resolution without going below CSS pixels', () => {
    const ratio = renderPixelRatio('high', 4, 1920, 1080);
    expect(ratio).toBeGreaterThanOrEqual(1);
    expect(1920 * 1080 * ratio * ratio).toBeLessThanOrEqual(3_000_001);
  });
});
describe('skill feedback across simulation and rendered frames', () => {
  it('retains an early-tick cast when later simulation ticks have no events', () => {
    const frames = new FrameEvents<GameEvent>();
    const cast: GameEvent = {
      id: 1,
      type: 'cast',
      position: { x: 0, z: 0 },
      color: '#ffcc33',
      abilityId: 'archer-3',
    };
    frames.push([cast]);
    frames.push([]);
    frames.push([{ id: 2, type: 'damage', position: { x: 1, z: 2 }, color: '#fff', value: 100 }]);
    frames.push([cast]);
    expect(frames.drain().map((e) => e.id)).toEqual([1, 2]);
    expect(frames.drain()).toEqual([]);
    frames.push([cast]);
    frames.clear();
    expect(frames.drain()).toEqual([]);
  });
  it('held basic attacks cannot replace a skill pose in the same simulation tick', () => {
    const sim = new Simulation({ mode: 'hill', classId: 'guardian' });
    sim.state.map.obstacles = [];
    const hero = sim.player,
      enemy = sim.state.entities.find((e) => e.id === 'B0')!;
    hero.position = { x: 0, z: 0 };
    enemy.position = { x: 0, z: 2 };
    sim.step([{ actorId: hero.id, ability: 0, attack: true, targetId: enemy.id }]);
    expect(hero.animation).toBe('skill1');
    const serial = hero.animationSerial;
    sim.combat.animate(hero, 'hit', 0.15);
    expect(hero.animationSerial).toBe(serial);
    expect(hero.animation).toBe('skill1');
    sim.combat.animate(hero, 'dodge', 0.4);
    expect(hero.animation).toBe('dodge');
  });
});
