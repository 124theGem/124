interface App {
  initData?: string;
  isFullscreen?: boolean;
  safeAreaInset?: Record<string, number>;
  contentSafeAreaInset?: Record<string, number>;
  ready?(): void;
  expand?(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  isVersionAtLeast?(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(event: string, handler: () => void): void;
  offEvent?(event: string, handler: () => void): void;
}
export class Telegram {
  readonly app = (window as Window & { Telegram?: { WebApp?: App } }).Telegram
    ?.WebApp;
  readonly initData = this.app?.initData ?? "";
  private events = [
    "safeAreaChanged",
    "contentSafeAreaChanged",
    "viewportChanged",
    "fullscreenChanged",
  ];
  constructor() {
    if (this.initData) {
      this.app?.ready?.();
      this.app?.expand?.();
      this.app?.setHeaderColor?.("#07172b");
      this.app?.setBackgroundColor?.("#07172b");
      if (this.app?.isVersionAtLeast?.("7.7"))
        this.app.disableVerticalSwipes?.();
      if (this.app?.isVersionAtLeast?.("8.0")) this.app.requestFullscreen?.();
    }
    for (const event of this.events) this.app?.onEvent?.(event, this.sync);
    this.sync();
  }
  private sync = () => {
    for (const edge of ["top", "bottom", "left", "right"])
      document.documentElement.style.setProperty(
        `--tg-${edge}`,
        `${Math.max(0, this.app?.safeAreaInset?.[edge] ?? 0) + Math.max(0, this.app?.contentSafeAreaInset?.[edge] ?? 0)}px`,
      );
  };
  fullscreen = async () => {
    try {
      if (this.initData && this.app?.isVersionAtLeast?.("8.0"))
        this.app.requestFullscreen?.();
      else if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen();
    } catch {}
  };
  dispose() {
    for (const event of this.events) this.app?.offEvent?.(event, this.sync);
  }
}
