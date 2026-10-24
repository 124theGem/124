import { test, expect } from '@playwright/test';

test('drag attack and ultimate show a live guide, preserve movement, and fire on release', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('.party-member.local').tap();
  await page.locator('[data-class="crossbow"]').tap();
  await page.locator('[data-select-class="crossbow"]').tap();
  await page.locator('[data-action="start"]').tap();
  await expect(page.locator('.battle-hud')).toBeVisible();
  await page.evaluate(() => {
    const { simulation: sim, renderer: r } = window.__raid;
    r.engine.stopRenderLoop();
    sim.state.map.obstacles = [];
    sim.player.position = { x: 0, z: 0 };
    sim.player.previous = { x: 0, z: 0 };
    sim.player.ultimate = 100;
    sim.state.entities
      .filter((e: any) => e.team === 'PVE')
      .forEach((e: any) => {
        e.position = { x: 0, z: 5 };
        e.hp = e.maxHp = 5000;
      });
    r.follow.set(0, 1, 2.8);
    r.camera.setTarget(r.follow);
    r.render(sim.state, 1 / 30, 1);
  });
  const rect = await page.locator('[data-attack]').boundingBox(),
    stick = await page.locator('.joystick').boundingBox();
  const ax = rect!.x + rect!.width / 2,
    ay = rect!.y + rect!.height / 2,
    sx = stick!.x + stick!.width / 2,
    sy = stick!.y + stick!.height / 2;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: sx, y: sy },
      { id: 2, x: ax, y: ay },
    ],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { id: 1, x: sx, y: sy - 30 },
      { id: 2, x: ax - 55, y: ay },
    ],
  });
  const held = await page.evaluate(() => {
    const { input, renderer: r, simulation: sim } = window.__raid;
    r.setAim(input.preview);
    r.render(sim.state, 1 / 30, 1);
    const command = input.sample(sim.state);
    sim.step([command]);
    return {
      attack: command.attack,
      moved: sim.player.position.z,
      guide: r.scene.getMeshByName('aim-trajectory').isEnabled(),
      preview: input.preview,
    };
  });
  expect(held.attack).toBe(false);
  expect(held.moved).toBeGreaterThan(0);
  expect(held.guide).toBe(true);
  expect(held.preview.aim.x).toBeLessThan(0);
  await page.screenshot({ path: 'docs/screenshots/directional-aim.png' });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const fired = await page.evaluate(() => {
    const { input, simulation: sim } = window.__raid;
    const cmd = input.sample(sim.state);
    sim.step([cmd]);
    return {
      attack: cmd.attack,
      dir: sim.state.projectiles[0]?.direction,
      again: input.sample(sim.state).attack,
      preview: input.preview,
    };
  });
  expect(fired.attack).toBe(true);
  expect(fired.dir!.x).toBeLessThan(-0.9);
  expect(fired.again).toBe(false);
  expect(fired.preview).toBeUndefined();
  const ult = await page.locator('[data-skill="3"]').boundingBox(),
    ux = ult!.x + ult!.width / 2,
    uy = ult!.y + ult!.height / 2;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 3, x: ux, y: uy }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ id: 3, x: ux - 55, y: uy - 10 }],
  });
  const charging = await page.evaluate(() => {
    const { renderer: r, input, simulation: sim } = window.__raid;
    r.setAim(input.preview);
    r.render(sim.state, 1 / 30, 1);
    return {
      index: input.preview.index,
      charge: sim.player.ultimate,
      yellow: r.scene.getMaterialByName('aim-white-yellow').emissiveColor.asArray(),
    };
  });
  expect(charging.index).toBe(3);
  expect(charging.charge).toBe(100);
  expect(charging.yellow[0]).toBeGreaterThan(charging.yellow[2]);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const cast = await page.evaluate(() => {
    const { input, simulation: sim } = window.__raid;
    const cmd = input.sample(sim.state);
    sim.step([cmd]);
    return { ability: cmd.ability, aim: cmd.aim, charge: sim.player.ultimate };
  });
  expect(cast.ability).toBe(3);
  expect(cast.aim!.x).toBeLessThan(0);
  expect(cast.charge).toBe(0);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 4, x: ax, y: ay }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ id: 4, x: ax - 40, y: ay - 20 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelled = await page.evaluate(() => ({
    attack: window.__raid.input.sample(window.__raid.state).attack,
    preview: window.__raid.input.preview,
  }));
  expect(cancelled.attack).toBe(false);
  expect(cancelled.preview).toBeUndefined();
  expect(errors).toEqual([]);
  await context.close();
});

test('all 60 skills have visible bodies; boss rig is preloaded and combat resources stay bounded', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.battle-hud')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { renderer: r, simulation: sim } = window.__raid;
    r.engine.stopRenderLoop();
    r.setQuality('low');
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { CLASSES } = await load('/src/game/classes/catalog.ts');
    const failures: string[] = [];
    let peakMeshes = 0;
    for (const c of CLASSES)
      for (const a of c.abilities) {
        r.vfx.clear();
        sim.state.projectiles = [];
        sim.state.zones = [];
        sim.state.events = [];
        const hero = sim.player;
        hero.classId = c.id;
        hero.cooldowns = [0, 0, 0, 0];
        hero.resource = 100;
        hero.ultimate = 100;
        hero.position = { x: 0, z: 0 };
        hero.previous = { x: 0, z: 0 };
        sim.state.map.obstacles = [];
        const enemy = sim.state.entities.find((e: any) => e.team === 'PVE');
        enemy.alive = true;
        enemy.hp = enemy.maxHp = 5000;
        enemy.position = { x: 0, z: 3 };
        const ally = sim.state.entities.find((e: any) => e.id === 'A1');
        ally.position = { x: 1, z: 1 };
        ally.hp = 100;
        const i = c.abilities.indexOf(a),
          target = a.target === 'ally' ? ally : enemy;
        sim.combat.cast(hero, i, target.id, target.position);
        r.enqueueEvents(sim.state.events);
        r.render(sim.state, 1 / 30, 1);
        if (a.type === 'projectile') {
          if (!r.projectiles.size) failures.push(a.id);
        } else if (!r.vfx.activeCount) failures.push(a.id);
        peakMeshes = Math.max(peakMeshes, r.scene.meshes.length);
      }
    r.vfx.clear();
    sim.player.classId = 'guardian';
    const prepared = r.dormantBoss;
    for (let i = 0; i < 4; i++) {
      sim.state.entities
        .filter((e: any) => e.kind === 'monster')
        .forEach((e: any) => {
          e.alive = false;
          e.hp = 0;
          sim.combat.animate(e, 'death', 10000);
        });
      sim.step([]);
    }
    r.render(sim.state, 1 / 30, 1);
    const reused = r.actors.get('boss') === prepared;
    const boss = sim.state.entities.find((e: any) => e.kind === 'boss');
    boss.position = { x: 0, z: 3 };
    sim.player.position = { x: 0, z: 0 };
    sim.player.statuses = [
      { kind: 'invulnerable', remaining: 100, power: 1, source: 'A0', tick: 0 },
    ];
    const particles = r.scene.particleSystems.length;
    const phases: number[] = [];
    for (const hp of [1, 0.6, 0.2]) {
      boss.hp = boss.maxHp * hp;
      sim.step([]);
      phases.push(sim.state.bossPhase);
      for (let t = 0; t < 120; t++) {
        sim.step([{ actorId: sim.player.id, attack: true, aim: { x: 0, z: 6 } }]);
        r.enqueueEvents(sim.state.events);
        if (t % 30 === 0) r.render(sim.state, 1 / 30, 1);
      }
    }
    // Drain VFX and fade non-respawning bodies, keeping actor count independent of cleared waves.
    sim.state.zones = [];
    sim.state.projectiles = [];
    sim.state.events = [];
    r.vfx.clear();
    sim.state.time += 6;
    r.render(sim.state, 0.1, 1);
    return {
      failures,
      peakMeshes,
      reused,
      phases,
      particles,
      afterParticles: r.scene.particleSystems.length,
      retired: r.retired.size,
      actors: r.actors.size,
      active: r.vfx.activeCount,
    };
  });
  expect(result.failures).toEqual([]);
  expect(result.reused).toBe(true);
  expect(result.phases).toEqual([1, 2, 3]);
  expect(result.particles).toBe(4);
  expect(result.afterParticles).toBe(4);
  expect(result.retired).toBeGreaterThanOrEqual(13);
  expect(result.actors).toBeLessThanOrEqual(12);
  expect(result.active).toBeLessThan(48);
  expect(errors).toEqual([]);
});
