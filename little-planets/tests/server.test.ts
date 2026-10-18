import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { legacySave } from "./fixtures";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyTelegram } from "../server/auth";
import { createApp } from "../server/app";
import { Store, Conflict } from "../server/store";
const token = "123456:test-token-for-automated-validation";
function signed(
  user = 123,
  date = Math.floor(Date.now() / 1000),
  extra: Record<string, string> = {},
) {
  const fields = {
    auth_date: String(date),
    query_id: "fixture",
    user: JSON.stringify({ id: user, first_name: "Test traveller" }),
    ...extra,
  };
  const check = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
describe("Telegram identity verification", () => {
  it("accepts genuine signed users including the signature field used by current clients", () => {
    expect(verifyTelegram(signed(), token).id).toBe(123);
    expect(
      verifyTelegram(
        signed(123, Math.floor(Date.now() / 1000), {
          signature: "ed25519-fixture",
        }),
        token,
      ).id,
    ).toBe(123);
  });
  it("rejects tampering, wrong secrets, duplicate fields, stale and future authentication", () => {
    expect(() =>
      verifyTelegram(signed().replace("Test+traveller", "Attacker"), token),
    ).toThrow();
    expect(() => verifyTelegram(signed(), "wrong-secret")).toThrow();
    expect(() => verifyTelegram(signed() + "&auth_date=1", token)).toThrow();
    expect(() => verifyTelegram(signed(123, 1), token)).toThrow();
    expect(() =>
      verifyTelegram(signed(123, Math.floor(Date.now() / 1000) + 120), token),
    ).toThrow();
    expect(() => verifyTelegram("user=%7B%22id%22%3A123%7D", token)).toThrow();
  });
});
describe("SQLite persistence and authenticated API", () => {
  it("migrates version 1 once in SQLite and retains revisions and inventory after reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "planets-migration-")),
      file = join(dir, "save.sqlite");
    let store = new Store(file);
    store.close();
    const db = new DatabaseSync(file);
    db.prepare("INSERT INTO saves(user_id,state) VALUES(?,?)").run(
      "7",
      JSON.stringify(legacySave()),
    );
    db.close();
    store = new Store(file);
    try {
      const migrated = store.get(7);
      expect(migrated.version).toBe(2);
      expect(migrated.revision).toBe(12);
      store.close();
      store = new Store(file);
      expect(store.get(7)).toEqual(migrated);
      const verify = new DatabaseSync(file);
      try {
        const raw = verify
          .prepare("SELECT state FROM saves WHERE user_id='7'")
          .get() as { state: string };
        expect(JSON.parse(raw.state).version).toBe(2);
      } finally {
        verify.close();
      }
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("persists after reopening, isolates users and refuses stale revisions", () => {
    const dir = mkdtempSync(join(tmpdir(), "little-planets-db-")),
      file = join(dir, "save.sqlite");
    let store = new Store(file);
    try {
      const initial = store.get(1);
      store.action(1, initial.revision, {
        type: "build",
        kind: "house",
        x: 16,
        z: 14,
        rotation: 0,
      });
      store.close();
      store = new Store(file);
      expect(store.get(1).worlds.home.buildings).toHaveLength(2);
      expect(store.get(2).worlds.home.buildings).toHaveLength(1);
      expect(() => store.action(1, 0, { type: "move", x: 8, z: 11 })).toThrow(
        Conflict,
      );
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("never accepts a bare user ID or a development login; uses validated Telegram identities", async () => {
    const app = await createApp({
      botToken: token,
      databasePath: ":memory:",
      staticRoot: "/nonexistent-planets-build",
    });
    try {
      expect(
        (await app.inject({ url: "/api/state?userId=123" })).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/dev-login",
            payload: { id: 123 },
          })
        ).statusCode,
      ).toBe(404);
      const headers = { authorization: `tma ${signed()}` };
      const first = await app.inject({ url: "/api/state", headers });
      expect(first.statusCode).toBe(200);
      const built = await app.inject({
        method: "POST",
        url: "/api/action",
        headers,
        payload: {
          revision: 0,
          action: { type: "build", kind: "house", x: 16, z: 14, rotation: 0 },
        },
      });
      expect(built.statusCode).toBe(200);
      expect(built.json().state.inventory.wood).toBe(72);
      const conflict = await app.inject({
        method: "POST",
        url: "/api/action",
        headers,
        payload: { revision: 0, action: { type: "move", x: 8, z: 11 } },
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().state.revision).toBe(1);
      const other = await app.inject({
        url: "/api/state",
        headers: { authorization: `tma ${signed(456)}` },
      });
      expect(other.json().state.inventory.wood).toBe(90);
      const forged = await app.inject({
        method: "POST",
        url: "/api/action",
        headers,
        payload: {
          revision: 1,
          action: { type: "move", x: 8, z: 11 },
          userId: 456,
        },
      });
      expect(forged.statusCode).toBe(400);
      const invalid = await app.inject({
        method: "POST",
        url: "/api/action",
        headers,
        payload: {
          revision: 1,
          action: { type: "build", kind: "house", x: 12, z: 15, rotation: 0 },
        },
      });
      expect(invalid.statusCode).toBe(400);
      const malformed = await app.inject({
        method: "POST",
        url: "/api/action",
        headers: { ...headers, "content-type": "application/json" },
        payload: "{broken",
      });
      expect(malformed.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
