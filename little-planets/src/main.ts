import "./ui/styles.css";
import { Telegram } from "./platform/Telegram";
import { Persistence } from "./platform/Persistence";
import { Game } from "./game/Game";
async function start() {
  try {
    const telegram = new Telegram(),
      store = new Persistence(telegram.initData);
    await store.load();
    new Game(store, telegram);
  } catch (error) {
    const app = document.querySelector("#app")!;
    app.innerHTML =
      '<main class="loading error"><span>✦</span><h1>Little Planets</h1><p id="error-message"></p><button onclick="location.reload()">Попробовать снова</button></main>';
    document.querySelector("#error-message")!.textContent =
      error instanceof Error
        ? error.message
        : "Не удалось открыть мир. Нужен браузер с WebGL 2.";
  }
}
void start();
