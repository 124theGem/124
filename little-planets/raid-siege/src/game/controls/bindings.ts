import { HumanController } from './HumanController';
import type { Vec2 } from '../core/types';
export function bindControls(
  root: HTMLElement,
  controller: HumanController,
  aimAt: (dx: number, dy: number, index: number) => Vec2 | undefined,
  onPause: () => void,
  onDebug: () => void,
) {
  const abort = new AbortController(),
    signal = abort.signal;
  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      controller.keys.add(e.code);
      if (e.repeat) return;
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (index >= 0) controller.useAbility(index);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') controller.roll();
      if (e.code === 'Escape') onPause();
      if (e.code === 'F10') {
        e.preventDefault();
        onDebug();
      }
    },
    { signal },
  );
  window.addEventListener('keyup', (e) => controller.keys.delete(e.code), { signal });
  window.addEventListener('blur', () => controller.reset(), { signal });
  const joystick = root.querySelector<HTMLElement>('.joystick')!,
    knob = root.querySelector<HTMLElement>('.joystick-knob')!;
  let stick: number | null = null,
    origin = { x: 0, y: 0 };
  joystick.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      stick = e.pointerId;
      const r = joystick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      joystick.setPointerCapture(e.pointerId);
      updateStick(e);
    },
    { signal },
  );
  const updateStick = (e: PointerEvent) => {
    if (e.pointerId !== stick) return;
    const dx = e.clientX - origin.x,
      dy = e.clientY - origin.y,
      r = joystick.clientWidth * 0.33,
      d = Math.max(r, Math.hypot(dx, dy));
    controller.move = { x: dx / d, z: -dy / d };
    knob.style.transform = `translate(${(dx / d) * r}px,${(dy / d) * r}px)`;
  };
  joystick.addEventListener('pointermove', updateStick, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    joystick.addEventListener(
      type,
      () => {
        stick = null;
        controller.move = { x: 0, z: 0 };
        knob.style.transform = '';
      },
      { signal },
    );
  // Each action owns its pointer. Movement stays independent during a right-thumb drag.
  root.querySelectorAll<HTMLElement>('[data-skill], [data-attack]').forEach((button) => {
    const index = button.hasAttribute('data-attack') ? -1 : Number(button.dataset.skill);
    let pointer: number | null = null;
    let origin = { x: 0, y: 0 };
    let aim: Vec2 | undefined;
    const update = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - origin.x,
        dy = e.clientY - origin.y;
      const length = Math.hypot(dx, dy),
        scale = Math.min(1, 42 / Math.max(1, length));
      aim = length > 10 ? aimAt(dx, dy, index) : undefined;
      controller.preview = { index, aim, drag: length > 10 ? { x: dx, y: dy } : undefined };
      button.style.setProperty('--aim-x', `${dx * scale}px`);
      button.style.setProperty('--aim-y', `${dy * scale}px`);
      button.classList.toggle('aiming', length > 10);
    };
    const clear = () => {
      pointer = null;
      aim = undefined;
      if (controller.preview?.index === index) controller.preview = undefined;
      button.classList.remove('pressed', 'aiming');
      button.style.removeProperty('--aim-x');
      button.style.removeProperty('--aim-y');
    };
    button.addEventListener(
      'pointerdown',
      (e) => {
        if (pointer !== null) return;
        e.preventDefault();
        pointer = e.pointerId;
        origin = { x: e.clientX, y: e.clientY };
        button.setPointerCapture(e.pointerId);
        button.classList.add('pressed');
        update(e);
      },
      { signal },
    );
    button.addEventListener('pointermove', update, { signal });
    button.addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerId !== pointer) return;
        update(e);
        if (index < 0) controller.fire(aim);
        else controller.useAbility(index, aim);
        clear();
      },
      { signal },
    );
    for (const type of ['pointercancel', 'lostpointercapture'])
      button.addEventListener(type, clear, { signal });
  });
  root.querySelector('[data-dodge]')!.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      controller.roll();
    },
    { signal },
  );
  return () => {
    abort.abort();
    controller.reset();
  };
}
