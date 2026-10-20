import {
  applyAction,
  newGame,
  parseSave,
  type Save,
  type Action,
} from "../../shared/model";
export class Persistence {
  state: Save = newGame(Date.now(), true, true);
  name = "Путешественник";
  private offset = 0;
  private queue = Promise.resolve();
  readonly local: boolean;
  constructor(private initData: string) {
    this.local = import.meta.env.DEV && !initData;
  }
  now() {
    return Date.now() + this.offset;
  }
  private async request(path: string, body?: unknown) {
    const response = await fetch(new URL(`./api/${path}`, location.href), {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `tma ${this.initData}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (data.serverTime) this.offset = data.serverTime - Date.now();
    if (!response.ok) {
      if (response.status === 409 && data.state) this.state = data.state;
      throw new Error(data.error ?? "Не удалось связаться с сервером.");
    }
    return data;
  }
  async load() {
    if (this.local) {
      const saved = localStorage.getItem("little-planets-v6");
      if (saved) {
        try {
          this.state = parseSave(saved);
          // Persist the reset before the player clicks anything, so it runs only once.
          localStorage.setItem("little-planets-v6", JSON.stringify(this.state));
        } catch {
          localStorage.setItem("little-planets-recovery", saved);
          throw new Error(
            "Локальное сохранение повреждено. Его копия сохранена в little-planets-recovery.",
          );
        }
      }
    } else {
      if (!this.initData)
        throw new Error(
          "Откройте Little Planets через кнопку вашего Telegram-бота. Локальный режим доступен через npm run dev.",
        );
      const result = await this.request("state");
      this.state = result.state;
      this.name = result.name;
    }
  }
  action(action: Action): Promise<Save> {
    const task = this.queue.then(async () => {
      if (this.local) {
        const next = applyAction(this.state, action, this.now());
        localStorage.setItem("little-planets-v6", JSON.stringify(next));
        this.state = next;
      } else
        this.state = (
          await this.request("action", {
            revision: this.state.revision,
            action,
          })
        ).state;
      return this.state;
    });
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
}
