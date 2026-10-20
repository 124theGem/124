import type { Page } from "@playwright/test";
import { applyAction, type Save } from "../shared/model";
import type { DeviceKind } from "../shared/automation";
import { offsetPoint } from "../shared/voxel";
export const gameState = (page: Page): Promise<Save> =>
  page.evaluate(() => (window as any).__planets.snapshot().state);
export async function openSystems(page: Page, id: string) {
  if (await page.locator("#" + id).isHidden())
    await page.locator("#menu-toggle").click();
  await page.locator("#" + id).click();
}
export async function placeInventoryItem(page: Page, item: string) {
  await page.locator("#place-item").click();
  const save = await gameState(page);
  const directions = [
    [2.6, 0],
    [-2.6, 0],
    [0, 2.6],
    [0, -2.6],
    [4, 2],
    [-4, 2],
    [4, -2],
    [-4, -2],
    [5, 0],
    [-5, 0],
    [0, 5],
    [0, -5],
    [6.4, 0],
    [-6.4, 0],
    [0, 6.4],
    [0, -6.4],
    [4.5, 4.5],
    [-4.5, 4.5],
    [4.5, -4.5],
    [-4.5, -4.5],
  ];
  for (const [x, z] of directions) {
    const at = offsetPoint(save.position, x, z, save.planet);
    try {
      applyAction(
        save,
        item.startsWith("device:")
          ? { type: "placeDevice", kind: item.slice(7) as DeviceKind, ...at }
          : { type: "placeShip", id: item.slice(5), ...at },
      );
    } catch {
      continue;
    }
    const point = await page.evaluate(
      (at) => (window as any).__planets.project(at.x, at.z, 0.03),
      at,
    );
    const exposed = await page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.matches("canvas.world"),
      point,
    );
    if (!exposed) continue;
    await page.mouse.click(point.x, point.y);
    const hit = await page.evaluate(() => (window as any).__planets.snapshot());
    if (hit.selected?.type !== "ground") continue;
    const actual = { x: hit.selected.x, z: hit.selected.z };
    try {
      applyAction(
        { ...hit.state, position: hit.position },
        item.startsWith("device:")
          ? {
              type: "placeDevice",
              kind: item.slice(7) as DeviceKind,
              ...actual,
            }
          : { type: "placeShip", id: item.slice(5), ...actual },
      );
    } catch {
      continue;
    }
    await page.getByRole("button", { name: "Установить", exact: true }).click();
    await page.waitForFunction(
      () => !(window as any).__planets.snapshot().busy,
    );
    if ((await gameState(page)).inventory[item] !== 0) continue;
    return item.startsWith("ship:")
      ? (await gameState(page)).worlds[save.planet].launchPad!
      : at;
  }
  throw new Error(`No exposed valid placement near player for ${item}`);
}
export async function createAndPlaceDevice(page: Page, kind: DeviceKind) {
  const item = `device:${kind}`;
  await page.locator(`[data-device-kind="${kind}"]`).click();
  const before = (await gameState(page)).inventory[item] ?? 0;
  await page.locator("#create-device").click();
  await page.waitForFunction(
    ({ item, n }) =>
      (window as any).__planets.snapshot().state.inventory[item] === n,
    { item, n: before + 1 },
  );
  await page.locator("#open-device-inventory").click();
  await placeInventoryItem(page, item);
  await openSystems(page, "automation");
  return (await gameState(page)).automation.devices
    .filter((d) => d.kind === kind)
    .at(-1)!;
}
