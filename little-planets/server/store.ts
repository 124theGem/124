import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { newGame, parseSave, applyAction, type Save } from "../shared/model";
export class Conflict extends Error {
  constructor(readonly state: Save) {
    super("Сохранение изменилось в другой вкладке");
  }
}
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS saves(user_id TEXT PRIMARY KEY,state TEXT NOT NULL)",
    );
  }
  get(userId: number, now = Date.now()): Save {
    const row = this.db
      .prepare("SELECT state FROM saves WHERE user_id=?")
      .get(String(userId)) as { state: string } | undefined;
    if (row) {
      const save = parseSave(row.state);
      const raw = JSON.parse(row.state);
      const needsDefaults =
        raw.version !== 6 ||
        raw.hand === undefined ||
        raw.progression === undefined ||
        raw.cycleEpoch === undefined ||
        raw.grapple === undefined ||
        Object.values(raw.worlds ?? {}).some(
          (w: any) => w.cleared === undefined || w.clearedNodes === undefined,
        );
      if (needsDefaults)
        this.db
          .prepare("UPDATE saves SET state=? WHERE user_id=? AND state=?")
          .run(JSON.stringify(save), String(userId), row.state);
      return save;
    }
    const save = newGame(now);
    this.db
      .prepare("INSERT INTO saves(user_id,state) VALUES(?,?)")
      .run(String(userId), JSON.stringify(save));
    return save;
  }
  action(
    userId: number,
    revision: number,
    action: unknown,
    now = Date.now(),
  ): Save {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(userId, now);
      if (current.revision !== revision) throw new Conflict(current);
      const next = applyAction(current, action, now);
      this.db
        .prepare("UPDATE saves SET state=? WHERE user_id=?")
        .run(JSON.stringify(next), String(userId));
      this.db.exec("COMMIT");
      return next;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
