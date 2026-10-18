import assert from "node:assert/strict";
/** Use actual cockpit controls; never modify the read-only game debug state. */
export async function completeFlight(page, target) {
  await page.locator("#space-hud:not(.hidden)").waitFor({ timeout: 90000 });
  const state = await page.evaluate(() => window.__planets.snapshot());
  assert.notEqual(state.state.planet, target);
  assert.equal(state.state.flight.target, target);
  assert(await page.locator("#space-land").isDisabled());
  if (!state.space.flight.autopilot) await page.locator("#space-auto").click();
  await page.waitForFunction(
    () => !document.querySelector("#space-land").disabled,
    {},
    { timeout: 180000 },
  );
  const arrival = await page.evaluate(() => window.__planets.snapshot());
  assert(arrival.space.flight.distance > 50);
  assert(arrival.space.landing.distance < 9 && arrival.space.landing.speed < 7);
  assert(arrival.space.detailed.includes(target));
  await page.locator("#space-land").click();
  await page.waitForFunction(() => window.__planets.snapshot().busy);
  assert.equal(
    await page.evaluate(() => window.__planets.snapshot().state.planet),
    state.state.planet,
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#space-auto").disabled &&
      document.querySelector("#space-course").disabled,
    {},
    { timeout: 2000 },
  );
  assert(await page.locator("#space-auto").isDisabled());
  assert(await page.locator("#space-course").isDisabled());
  await page.waitForFunction(
    (p) =>
      window.__planets.snapshot().state.planet === p &&
      !window.__planets.snapshot().flying &&
      !window.__planets.snapshot().busy,
    target,
    { timeout: 60000 },
  );
  return arrival;
}
