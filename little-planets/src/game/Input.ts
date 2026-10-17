export class Input {
  x = 0;
  z = 0;
  private keys = new Set<string>();
  private abort = new AbortController();
  private joystickPointer: number | null = null;
  constructor() {
    const signal = this.abort.signal;
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (
          [
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
          ].includes(e.code)
        ) {
          e.preventDefault();
          this.keys.add(e.code);
        }
      },
      { signal },
    );
    window.addEventListener("keyup", (e) => this.keys.delete(e.code), {
      signal,
    });
    window.addEventListener("blur", () => this.clear(), { signal });
    const stick = document.querySelector<HTMLElement>("#joystick")!,
      knob = stick.querySelector<HTMLElement>("span")!;
    const drag = (event: PointerEvent) => {
      const bounds = stick.getBoundingClientRect(),
        dx = event.clientX - bounds.x - bounds.width / 2,
        dz = event.clientY - bounds.y - bounds.height / 2,
        radius = bounds.width * 0.32,
        length = Math.hypot(dx, dz),
        scale = length > radius ? radius / length : 1;
      this.x = (dx * scale) / radius;
      this.z = (dz * scale) / radius;
      knob.style.transform = `translate(${dx * scale}px,${dz * scale}px)`;
    };
    stick.addEventListener(
      "pointerdown",
      (e) => {
        if (this.joystickPointer !== null) return;
        this.joystickPointer = e.pointerId;
        stick.setPointerCapture(e.pointerId);
        drag(e);
      },
      { signal },
    );
    stick.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerId === this.joystickPointer) drag(e);
      },
      { signal },
    );
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      stick.addEventListener(
        event,
        () => {
          this.joystickPointer = null;
          this.x = this.z = 0;
          knob.style.transform = "";
        },
        { signal },
      );
  }
  read() {
    const x =
        this.x +
        Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
        Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft")),
      z =
        this.z +
        Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) -
        Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")),
      length = Math.max(1, Math.hypot(x, z));
    return { x: x / length, z: z / length };
  }
  clear() {
    this.keys.clear();
    this.x = this.z = 0;
  }
  dispose() {
    this.abort.abort();
  }
}
