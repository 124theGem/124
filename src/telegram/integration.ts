import { init, isTMA, miniApp, viewport, swipeBehavior, themeParams, on } from '@tma.js/sdk';
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
  return {
    inside,
    fullscreen: async () => {
      try {
        if (inside && viewport.requestFullscreen.isAvailable()) await viewport.requestFullscreen();
      } catch {
        /* Unsupported clients keep the expanded viewport. */
      }
    },
    dispose: () => cleanups.forEach((fn) => fn()),
  };
}
