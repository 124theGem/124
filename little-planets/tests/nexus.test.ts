import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NexusServer } from "../server/nexus";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { RACE_GATES, RELIC_ISLANDS, freshNexusProfile, spawnNexus, stepNexus, type NexusSnapshot } from "../shared/nexus";
const token = "synthetic-nexus-telegram-token";
function authorization(id: number) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: `<Pilot ${id}>` }) };
  const text = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return "tma " + new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(text).digest("hex") });
}
function driver(server: NexusServer, id = 1) {
  let now = 100000, state = server.request(id, "Pilot", { type: "join" }, now) as NexusSnapshot;
  return {
    get state() { return state; },
    advance(ms: number) { now += ms; },
    command(command: unknown) { now += 300; state = server.request(id, "Pilot", { type: "command", session: state.session, command }, now) as NexusSnapshot; return state; },
    input(x: number, z: number, jump = false, dt = 0.05, advance = 50) {
      now += advance;
      state = server.request(id, "Pilot", { type: "input", session: state.session, frames: [{ seq: state.self.seq + 1, dt, x, z, jump, sprint: state.self.world === "race" }] }, now) as NexusSnapshot;
      return state;
    },
    race() {
      this.command({ type: "enter", world: "race" }); this.advance(3000);
      for (let i = 0; i < 2000 && state.self.finishedAt === null; i++) {
        const target = RACE_GATES[state.self.checkpoint], dx = target.x - state.self.x, dz = target.z - state.self.z, n = Math.max(1, Math.hypot(dx, dz));
        this.input(dx / n, dz / n);
      }
      expect(state.self.finishedAt).not.toBeNull(); return state;
    },
  };
}
describe("NEXUS authoritative multiplayer and progress", () => {
  it("requires Telegram authentication, rejects position injection and never exposes another Telegram id/session", async () => {
    const app = await createApp({ botToken: token, databasePath: ":memory:" });
    try {
      expect((await app.inject({ method: "POST", url: "/api/nexus", payload: { type: "join" } })).statusCode).toBe(401);
      const join = async (id: number) => (await app.inject({ method: "POST", url: "/api/nexus", headers: { authorization: authorization(id) }, payload: { type: "join" } })).json() as NexusSnapshot;
      const first = await join(7654321), second = await join(9876543);
      expect(second.online).toBe(2); expect(second.peers).toHaveLength(1);
      expect(second.peers[0].id).not.toBe("7654321");
      expect(second.peers[0]).not.toHaveProperty("session"); expect(second.peers[0].name).not.toContain("<");
      const invalid = await app.inject({ method: "POST", url: "/api/nexus", headers: { authorization: authorization(7654321) }, payload: { type: "input", session: first.session, frames: [{ seq: 1, dt: 0.1, x: 0, z: 0, jump: false, sprint: false, position: { x: 999, z: 999 } }] } });
      expect(invalid.statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it("isolates worlds, updates emotes and expires disconnected users", () => {
    const server = new NexusServer(":memory:");
    try {
      const a = server.request(1, "One", { type: "join" }, 10000) as NexusSnapshot;
      const b = server.request(2, "Two", { type: "join" }, 10000) as NexusSnapshot;
      expect(b.peers[0].name).toBe("One");
      server.request(1, "One", { type: "command", session: a.session, command: { type: "emote", emote: "dance" } }, 10300);
      let state = server.request(2, "Two", { type: "command", session: b.session, command: { type: "emote", emote: "wave" } }, 10300) as NexusSnapshot;
      expect(state.peers[0].emote).toBe("dance");
      state = server.request(2, "Two", { type: "command", session: b.session, command: { type: "enter", world: "relic" } }, 10600) as NexusSnapshot;
      expect(state.peers).toHaveLength(0); expect(state.online).toBe(1);
      server.request(2, "Two", { type: "join" }, 27000);
      expect(() => server.request(1, "One", { type: "leave", session: a.session }, 27000)).toThrow(/соединение/i);
    } finally { server.close(); }
  });
  it("limits simulation to elapsed server time and ignores duplicate input frames", () => {
    const server = new NexusServer(":memory:");
    try {
      const d = driver(server); let original = d.input(1, 0, false, 0.2, 0);
      for (let i = 0; i < 100; i++) d.input(1, 0, false, 0.2, 0);
      expect(d.state.self.x).toBe(original.self.x);
      original = d.state;
      const repeated = server.request(1, "Pilot", { type: "input", session: original.session, frames: [{ seq: original.self.seq, dt: 0.2, x: 1, z: 0, jump: false, sprint: true }] }, 100000) as NexusSnapshot;
      expect(repeated.self).toEqual(original.self);
      expect(d.state.self.x).toBeLessThan(1);
    } finally { server.close(); }
  });
  it("completes a real ordered lap, pays once, buys an outfit and persists alongside the untouched colony", () => {
    const root = mkdtempSync(join(tmpdir(), "nexus-persist-")), path = join(root, "game.sqlite");
    const colony = new Store(path); let server = new NexusServer(path);
    try {
      const before = colony.get(1); const d = driver(server);
      let state = d.race();
      expect(state.self.checkpoint).toBe(12); expect(state.profile.credits).toBe(60); expect(state.profile.races).toBe(1);
      for (let i = 0; i < 20; i++) d.input(0, 0);
      expect(d.state.profile.credits).toBe(60);
      expect(() => d.command({ type: "customize", name: "Runner", color: "amber", outfit: "runner" })).toThrow(/160/);
      d.race(); state = d.race();
      expect(state.profile.credits).toBe(180);
      state = d.command({ type: "customize", name: "<Пилот>", color: "amber", outfit: "runner" });
      expect(state.profile.credits).toBe(20); expect(state.profile.name).toBe("Пилот");
      server.close(); server = new NexusServer(path);
      const reopened = server.request(1, "Telegram name", { type: "join" }, 900000) as NexusSnapshot;
      expect(reopened.profile).toEqual(state.profile); expect(reopened.leaderboard[0].bestRace).toBe(state.profile.bestRace);
      expect(colony.get(1)).toEqual(before);
    } finally { server.close(); colony.close(); rmSync(root, { recursive: true, force: true }); }
  });
  it("allows the island route by actual jumps, collects five distinct shards and completes at the archive", () => {
    const actor = spawnNexus(freshNexusProfile(), "test", "relic", 0);
    let route = 1, seq = 0;
    const goals = [...RELIC_ISLANDS.slice(1, 8), RELIC_ISLANDS[8]];
    for (let i = 0; i < 12000 && actor.finishedAt === null; i++) {
      const goal = goals[route - 1], dx = goal.x - actor.x, dz = goal.z - actor.z, n = Math.hypot(dx, dz);
      const x = Math.max(-1, Math.min(1, dx * 0.6)), z = Math.max(-1, Math.min(1, dz * 0.6));
      stepNexus(actor, { seq: ++seq, dt: 0.025, x, z, jump: n > 1.7, sprint: false }, i * 25);
      if (n < 0.8 && actor.y < 0.4 && route < goals.length) route++;
    }
    expect(actor.collected).toBe(31); expect(actor.finishedAt).not.toBeNull(); expect(actor.y).toBeGreaterThan(-1);
  });
  it("awards an expedition only after the actual route and archive return, retaining shards after a fall", () => {
    const server = new NexusServer(":memory:");
    try {
      const d = driver(server); d.command({ type: "enter", world: "relic" });
      const goals = [...RELIC_ISLANDS.slice(1, 8), RELIC_ISLANDS[8]]; let route = 0;
      for (let i = 0; i < 12000 && d.state.self.finishedAt === null; i++) {
        const a = d.state.self, goal = goals[route], dx = goal.x - a.x, dz = goal.z - a.z, distance = Math.hypot(dx, dz);
        d.input(Math.max(-1, Math.min(1, dx * 0.6)), Math.max(-1, Math.min(1, dz * 0.6)), distance > 1.7, 0.025, 25);
        expect(d.state.self.collected | a.collected).toBe(d.state.self.collected);
        if (distance < 0.8 && d.state.self.y < 0.4 && route < goals.length - 1) route++;
      }
      expect(d.state.self.collected).toBe(31); expect(d.state.self.finishedAt).not.toBeNull();
      expect(d.state.profile).toMatchObject({ credits: 80, xp: 100, expeditions: 1 });
      for (let i = 0; i < 10; i++) d.input(0, 0);
      expect(d.state.profile.credits).toBe(80);
    } finally { server.close(); }
  });
});
