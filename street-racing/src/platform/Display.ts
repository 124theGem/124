interface Insets { top?: number; bottom?: number; left?: number; right?: number }
interface TelegramApp {
  initData?: string;
  platform?: string;
  isFullscreen?: boolean;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast?(version: string): boolean;
  ready?(): void;
  expand?(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent?(event: string, handler: () => void): void;
  offEvent?(event: string, handler: () => void): void;
}

/** Feature-detects Telegram 8+ fullscreen, with expanded viewport/browser fallback. */
export class Display {
  private app = (window as Window & { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
  private abort = new AbortController();
  private events = ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged', 'fullscreenChanged', 'fullscreenFailed'];
  private canFullscreen = false;
  readonly telegram = Boolean(this.app && (this.app.initData || (this.app.platform && this.app.platform !== 'unknown')));
  constructor() {
    const app = this.app;
    if (this.telegram && app) {
      try {
        app.ready?.(); app.expand?.();
        if (app.isVersionAtLeast?.('7.7')) app.disableVerticalSwipes?.();
        app.setHeaderColor?.('#090d1c'); app.setBackgroundColor?.('#090d1c');
        if (app.isVersionAtLeast?.('7.10')) app.setBottomBarColor?.('#090d1c');
        this.canFullscreen = Boolean(app.requestFullscreen && app.isVersionAtLeast?.('8.0'));
        if (this.canFullscreen && !app.isFullscreen) app.requestFullscreen?.();
      } catch { /* Older clients keep the expanded viewport and a manual fullscreen button. */ }
      for (const event of this.events) app.onEvent?.(event, this.sync);
    }
    document.addEventListener('fullscreenchange', this.sync, { signal: this.abort.signal });
    window.addEventListener('resize', this.sync, { signal: this.abort.signal });
    window.visualViewport?.addEventListener('resize', this.sync, { signal: this.abort.signal });
    this.sync();
  }
  private sync = () => {
    const safe = this.telegram ? this.app?.safeAreaInset : undefined;
    const content = this.telegram ? this.app?.contentSafeAreaInset : undefined;
    for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
      const value = Math.max(0, safe?.[edge] ?? 0) + Math.max(0, content?.[edge] ?? 0);
      document.documentElement.style.setProperty(`--tg-safe-${edge}`, `${value}px`);
    }
    document.documentElement.dataset.fullscreen = String(Boolean(this.app?.isFullscreen || document.fullscreenElement));
    const button = document.querySelector<HTMLElement>('#fullscreen');
    button?.setAttribute('aria-pressed', document.documentElement.dataset.fullscreen);
  };
  /** Browser APIs require a user gesture; call directly from the HUD click handler. */
  request = async () => {
    try {
      if (this.telegram && this.app) {
        this.app.expand?.();
        if (this.canFullscreen && !this.app.isFullscreen) this.app.requestFullscreen?.();
      } else if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* Fullscreen denial does not stop driving. */ }
    this.sync();
  };
  dispose() {
    this.abort.abort();
    if (this.telegram) for (const event of this.events) this.app?.offEvent?.(event, this.sync);
  }
}
