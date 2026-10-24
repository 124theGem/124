import type { Quality } from './WorldRenderer';

/** Ratios are render pixels per CSS pixel, not physical DPR divided by a quality level. */
export function renderPixelRatio(
  quality: Quality,
  devicePixelRatio: number,
  width: number,
  height: number,
) {
  const cap = { low: 1, medium: 1.5, high: 2 }[quality];
  const budget = { low: 1_000_000, medium: 1_800_000, high: 3_000_000 }[quality];
  const requested = Math.min(Math.max(1, devicePixelRatio), cap);
  return Math.max(1, Math.min(requested, Math.sqrt(budget / Math.max(1, width * height))));
}

/** VFX events must survive every simulation tick until a rendered frame consumes them. */
export class FrameEvents<T extends { id: number }> {
  private items = new Map<number, T>();
  push(events: readonly T[]) {
    for (const event of events) this.items.set(event.id, event);
  }
  drain() {
    const events = [...this.items.values()];
    this.items.clear();
    return events;
  }
  clear() {
    this.items.clear();
  }
}
