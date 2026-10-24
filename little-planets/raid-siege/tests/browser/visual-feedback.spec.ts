import { test, expect } from '@playwright/test';

test('retina clarity, moving skill bones, replayed casts, and VFX surviving skipped ticks', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.battle-hud')).toBeVisible();
  const result = await page.evaluate(() => {
    const { renderer: r, simulation: sim } = window.__raid;
    r.engine.stopRenderLoop();
    r.scene.useConstantAnimationDeltaTime = true;
    r.scene.animationTimeScale = 1;
    const hero = sim.player,
      view = r.actors.get(hero.id),
      now = sim.state.time;
    const nodes = view.groups
      .find((g: any) => g.name.endsWith(':2H_Ranged_Shoot'))
      .targetedAnimations.filter(
        (t: any) =>
          t.animation.targetProperty === 'rotationQuaternion' && /arm|hand/.test(t.target.name),
      )
      .map((t: any) => t.target);
    const pose = () => nodes.flatMap((n: any) => n.rotationQuaternion.asArray());
    const delta = (a: number[], b: number[]) =>
      a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
    const sample = (animation: string, serial: number) => {
      hero.animation = animation;
      hero.animationSerial = serial;
      hero.animationUntil = now + 20;
      for (let i = 0; i < 24; i++) {
        view.update(hero, 1 / 60, now + i / 60, 1);
        r.scene.animate();
      }
      return {
        pose: pose(),
        frame: view.active.animatables[0]?.masterFrame ?? 0,
        playing: view.active.isPlaying,
      };
    };
    const idle = sample('idle', 100),
      first = sample('skill1', 101),
      repeated = sample('skill2', 102),
      third = sample('skill3', 103),
      ultimate = sample('ultimate', 104);
    for (let i = 0; i < 100; i++) r.scene.animate();
    const replay = sample('ultimate', 105);
    hero.cooldowns = [0, 0, 0, 0];
    hero.resource = 100;
    const target = sim.state.entities.find((e: any) => e.team === 'PVE');
    const cast = sim.combat.cast(hero, 2, target.id, target.position);
    r.enqueueEvents(sim.state.events);
    for (let i = 0; i < 3; i++) sim.step([]);
    r.render(sim.state, 1 / 30, 1);
    return {
      metrics: r.metrics,
      guardianShields: r.actors
        .get('A1')
        .meshList.filter((m: any) => m.isEnabled() && /shield/i.test(m.name)).length,
      moving: [first, repeated, third, ultimate].map((p) => delta(idle.pose, p.pose)),
      repeatDifference: delta(first.pose, repeated.pose),
      replayed: replay.playing,
      cast,
      arrows: r.scene.meshes.filter((m: any) => m.name === 'skill-arrow').length,
    };
  });
  expect(result.guardianShields).toBe(1);
  expect(result.metrics.renderWidth).toBeGreaterThanOrEqual(844);
  expect(result.metrics.pixelRatio).toBe(1.5);
  for (const movement of result.moving) expect(movement).toBeGreaterThan(0.03);
  expect(result.repeatDifference).toBeLessThan(0.1);
  expect(result.replayed).toBe(true);
  expect(result.cast).toBe(true);
  expect(result.arrows).toBeGreaterThanOrEqual(7);
  expect(result.metrics.activeVfx).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await context.close();
});
