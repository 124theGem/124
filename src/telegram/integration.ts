import {
  init,
  isTMA,
  miniApp,
  viewport,
  swipeBehavior,
  themeParams,
  on,
  postEvent,
  supports,
  retrieveLaunchParams,
} from '@tma.js/sdk';
export interface TelegramIntegration {
  inside: boolean;
  fullscreen: () => Promise<void>;
  dispose: () => void;
}
export async function connectTelegram(onInactive: () => void): Promise<TelegramIntegration> {
  const cleanups: (() => void)[] = [];
  const visibility = () => {
    if (document.hidden) onInactive();
  };
  document.addEventListener('visibilitychange', visibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', visibility));
  let inside = false;
  try {
    inside = await isTMA();
    if (inside) {
      cleanups.push(init());
      if (themeParams.mount.isAvailable()) {
        themeParams.mount();
        cleanups.push(themeParams.bindCssVars());
      }
      if (miniApp.mount.isAvailable()) miniApp.mount();
      if (miniApp.ready.isAvailable()) miniApp.ready();
      if (viewport.mount.isAvailable()) {
        await viewport.mount();
        if (viewport.expand.isAvailable()) viewport.expand();
        cleanups.push(viewport.bindCssVars());
      }
      if (swipeBehavior.mount.isAvailable()) {
        swipeBehavior.mount();
        if (swipeBehavior.disableVertical.isAvailable()) swipeBehavior.disableVertical();
      }
      cleanups.push(
        on('visibility_changed', (e) => {
          if (!e.is_visible) onInactive();
        }),
      );
    }
  } catch (error) {
    console.warn(
      'Telegram capability unavailable:',
      error instanceof Error ? error.message : 'unknown',
    );
  }
  const landscape = window.matchMedia('(orientation: landscape)');
  const lockLandscape = async () => {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      try {
        await orientation?.lock?.('landscape');
      } catch {
        /* Physical rotation is the fallback. */
      }
      if (
        landscape.matches &&
        inside &&
        supports('web_app_toggle_orientation_lock', retrieveLaunchParams().tgWebAppVersion)
      )
        postEvent('web_app_toggle_orientation_lock', { locked: true });
    } catch {
      /* Telegram/WebKit can restrict the browser orientation API. */
    }
  };
  const fullscreen = async () => {
    try {
      if (inside && viewport.requestFullscreen.isAvailable()) {
        if (!viewport.isFullscreen()) await viewport.requestFullscreen();
      } else if (
        !inside &&
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      )
        await document.documentElement.requestFullscreen();
    } catch {
      /* A user gesture may be required; the next tap retries. */
    }
    await lockLandscape();
  };
  const rotate = () => {
    if (landscape.matches) void lockLandscape();
    else onInactive();
  };
  landscape.addEventListener('change', rotate);
  const enter = () => {
    void fullscreen();
  };
  document.addEventListener('pointerdown', enter);
  cleanups.push(() => landscape.removeEventListener('change', rotate));
  cleanups.push(() => document.removeEventListener('pointerdown', enter));
  if (inside) void fullscreen();
  return {
    inside,
    fullscreen,
    dispose: () => cleanups.forEach((fn) => fn()),
  };
}
