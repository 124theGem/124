import { HumanController } from './HumanController';
import type { Vec2 } from '../core/types';
export function bindControls(
  root: HTMLElement,
  controller: HumanController,
  aimAt: (x: number, y: number) => Vec2 | undefined,
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
  root.querySelectorAll<HTMLElement>('[data-skill]').forEach((button) => {
    let point: { x: number; y: number } | null = null;
    button.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        point = { x: e.clientX, y: e.clientY };
        button.classList.add('pressed');
      },
      { signal },
    );
    button.addEventListener(
      'pointerup',
      (e) => {
        if (!point) return;
        const dx = e.clientX - point.x,
          dy = e.clientY - point.y;
        const rect = button.getBoundingClientRect();
        const centerX = window.innerWidth / 2,
          centerY = window.innerHeight / 2;
        const aim = Math.hypot(dx, dy) > 20 ? aimAt(centerX + dx * 3, centerY + dy * 3) : undefined;
        void rect;
        controller.useAbility(Number(button.dataset.skill), aim);
        point = null;
        button.classList.remove('pressed');
      },
      { signal },
    );
    button.addEventListener(
      'pointercancel',
      () => {
        point = null;
        button.classList.remove('pressed');
      },
      { signal },
    );
  });
  const attack = root.querySelector<HTMLElement>('[data-attack]')!;
  attack.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      attack.setPointerCapture(e.pointerId);
      controller.attack = true;
      attack.classList.add('pressed');
    },
    { signal },
  );
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    attack.addEventListener(
      type,
      () => {
        controller.attack = false;
        attack.classList.remove('pressed');
      },
      { signal },
    );
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
