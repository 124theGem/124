import "./ui/styles.css";
import "./ui/horizon.css";
import "./ui/outpost.css";
import { Telegram } from "./platform/Telegram";
import { Persistence } from "./platform/Persistence";
function showError(error: unknown) {
  const app = document.querySelector("#app")!;
  app.innerHTML = '<main class="loading error"><span>✦</span><h1>Little Planets</h1><p id="error-message"></p><button onclick="location.reload()">Попробовать снова</button></main>';
  document.querySelector("#error-message")!.textContent = error instanceof Error ? error.message : "Не удалось открыть мир. Нужен браузер с WebGL 2.";
}
async function start() {
  try {
    let telegram = new Telegram();
    const store = new Persistence(telegram.initData);
    await store.load();
    let disposeCurrent = () => {};
    let switching = false;
    const openHub = async () => {
      if (switching) return;
      switching = true;
      try {
        const { NexusApp } = await import("./nexus/NexusApp");
        disposeCurrent();
        telegram = new Telegram();
        const nexus = new NexusApp(store, telegram, () => void openColony().catch(showError));
        disposeCurrent = () => { nexus.dispose(); telegram.dispose(); };
      } finally { switching = false; }
    };
    const openColony = async () => {
      if (switching) return;
      switching = true;
      try {
        const { Game } = await import("./game/Game");
        disposeCurrent();
        telegram = new Telegram();
        const game = new Game(store, telegram, () => void openHub().catch(showError));
        disposeCurrent = () => game.dispose();
      } finally { switching = false; }
    };
    telegram.dispose();
    if (new URLSearchParams(location.search).get("mode") === "colony" || store.state.flight) await openColony();
    else await openHub();
  } catch (error) {
    showError(error);
  }
}
void start();
