import './ui/style.css';
import { GameApp } from './app/GameApp';
const root = document.getElementById('app')!,
  canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const legacyEntry = document.documentElement.dataset.legacyEntry;
const requestedMode = new URLSearchParams(location.search).get('mode');
if (legacyEntry && ['colony', 'raid', 'emberfall'].includes(requestedMode ?? '')) {
  const target = new URL(legacyEntry, location.href);
  target.search = location.search;
  target.hash = location.hash;
  location.replace(target.href);
} else {
  try {
    const app = new GameApp(root, canvas);
    void app.init().catch((error) => app.fail(error));
  } catch (error) {
    root.innerHTML =
      '<div class="loading"><div class="load-error"><h2>Нужна поддержка WebGL</h2><p>Откройте игру в современном браузере или обновите Telegram. Аппаратное ускорение должно быть включено.</p></div></div>';
    console.error(error);
  }
}
