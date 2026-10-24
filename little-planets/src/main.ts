import { Telegram } from "./platform/Telegram";
async function start() {
  if (new URLSearchParams(location.search).get("mode") === "colony") {
    await import("./legacy");
    return;
  }
  if (new URLSearchParams(location.search).get("mode") === "raid") {
    const { RaidApp } = await import("./raid/RaidApp");
    new RaidApp(new Telegram());
    return;
  }
  try {
    const { RPGApp } = await import("./rpg/RPGApp");
    new RPGApp(new Telegram());
  } catch (error) {
    document.querySelector("#app")!.innerHTML =
      '<main class="ef-error"><h1>EMBERFALL</h1><p id="ef-error-message"></p><button onclick="location.reload()">Попробовать снова</button></main>';
    document.querySelector("#ef-error-message")!.textContent =
      error instanceof Error ? error.message : "Не удалось открыть игру.";
  }
}
void start();
