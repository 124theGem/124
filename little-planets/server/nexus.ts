import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  freshNexusProfile, spawnNexus, stepNexus, completeNexus, customizeNexus,
  type NexusActor, type NexusProfile, type NexusSnapshot,
} from "../shared/nexus";
const colors = z.enum(["cyan", "amber", "violet", "coral", "lime", "silver"]);
const outfits = z.enum(["scout", "runner", "sentinel"]);
const world = z.enum(["hub", "race", "relic"]);
const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enter"), world }).strict(),
  z.object({ type: z.literal("restart") }).strict(),
  z.object({ type: z.literal("customize"), name: z.string().min(1).max(64), color: colors, outfit: outfits }).strict(),
  z.object({ type: z.literal("emote"), emote: z.enum(["wave", "dance", "cheer"]) }).strict(),
]);
export const nexusRequest = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join") }).strict(),
  z.object({ type: z.literal("leave"), session: z.string().uuid() }).strict(),
  z.object({ type: z.literal("command"), session: z.string().uuid(), command }).strict(),
  z.object({ type: z.literal("input"), session: z.string().uuid(), frames: z.array(z.object({
    seq: z.number().int().positive().max(2 ** 40), dt: z.number().positive().max(0.2),
    x: z.number().finite().min(-1).max(1), z: z.number().finite().min(-1).max(1),
    jump: z.boolean(), sprint: z.boolean(),
  }).strict()).min(1).max(30) }).strict(),
]);
const profileSchema = z.object({
  name: z.string(), color: colors, outfit: outfits, unlocked: z.array(outfits),
  xp: z.number().int().nonnegative(), credits: z.number().int().nonnegative(),
  races: z.number().int().nonnegative(), expeditions: z.number().int().nonnegative(),
  bestRace: z.number().positive().nullable(),
});
class NexusError extends Error { constructor(message: string, readonly statusCode = 400) { super(message); } }
interface Member { session: string; actor: NexusActor; profile: NexusProfile; seenAt: number; inputAt: number; budget: number; commandAt: number; }
/** A shared, authenticated room. Authority over movement, objectives and payouts stays here. */
export class NexusServer {
  private db: DatabaseSync;
  private members = new Map<number, Member>();
  private board: NexusSnapshot["leaderboard"] = [];
  private boardAt = 0;
  constructor(database: string) {
    this.db = new DatabaseSync(database);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS nexus_profiles(user_id TEXT PRIMARY KEY,profile TEXT NOT NULL)");
  }
  private load(id: number, name: string) {
    const row = this.db.prepare("SELECT profile FROM nexus_profiles WHERE user_id=?").get(String(id)) as { profile: string } | undefined;
    return row ? profileSchema.parse(JSON.parse(row.profile)) : freshNexusProfile(name);
  }
  private persist(id: number, profile: NexusProfile) {
    this.db.prepare("INSERT INTO nexus_profiles(user_id,profile) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile").run(String(id), JSON.stringify(profile));
    this.boardAt = 0;
  }
  request(id: number, name: string, raw: unknown, now = Date.now()): NexusSnapshot | { ok: true } {
    const body = nexusRequest.parse(raw);
    for (const [key, member] of this.members) if (now - member.seenAt > 15000) this.members.delete(key);
    if (body.type === "join") {
      if (!this.members.has(id) && this.members.size >= 200) throw new NexusError("Хаб заполнен. Попробуйте подключиться немного позже.", 503);
      const profile = this.load(id, name);
      this.persist(id, profile);
      this.members.set(id, { session: randomUUID(), actor: spawnNexus(profile, randomUUID(), "hub", now), profile, seenAt: now, inputAt: now, budget: 0.15, commandAt: -Infinity });
    }
    const member = this.members.get(id);
    if (!member || (body.type !== "join" && member.session !== body.session))
      throw new NexusError("Соединение с хабом завершено. Подключитесь заново.", 409);
    member.seenAt = now;
    if (body.type === "leave") { this.members.delete(id); return { ok: true }; }
    if (body.type === "command") {
      if (now - member.commandAt < 250) throw new NexusError("Подождите секунду.", 429);
      member.commandAt = now;
      const c = body.command;
      if (c.type === "enter" || c.type === "restart") {
        member.actor = spawnNexus(member.profile, member.actor.id, c.type === "enter" ? c.world : member.actor.world, now);
        member.inputAt = now; member.budget = 0.15;
      } else if (c.type === "customize") {
        const profile = structuredClone(member.profile);
        try { customizeNexus(profile, c); } catch (error) { throw new NexusError((error as Error).message); }
        this.persist(id, profile); member.profile = profile;
        Object.assign(member.actor, { name: profile.name, color: profile.color, outfit: profile.outfit });
      } else { member.actor.emote = c.emote; member.actor.emoteAt = now; }
    }
    if (body.type === "input") {
      member.budget = Math.min(0.5, member.budget + Math.max(0, now - member.inputAt) / 1000);
      member.inputAt = now;
      const actor = member.actor, finished = actor.finishedAt, before = { ...actor };
      for (const frame of body.frames) {
        if (frame.seq <= actor.seq) continue;
        const dt = Math.min(frame.dt, member.budget);
        stepNexus(actor, { ...frame, dt }, now);
        member.budget = Math.max(0, member.budget - dt);
      }
      if (finished === null && actor.finishedAt !== null) {
        const next = structuredClone(member.profile);
        completeNexus(next, actor);
        try { this.persist(id, next); member.profile = next; }
        catch (error) { member.actor = before; throw error; }
      }
    }
    if (now - this.boardAt > 2000) {
      this.board = (this.db.prepare("SELECT profile FROM nexus_profiles WHERE json_extract(profile,'$.bestRace') IS NOT NULL ORDER BY json_extract(profile,'$.bestRace') ASC LIMIT 5").all() as { profile: string }[])
        .map(r => JSON.parse(r.profile) as NexusProfile).map(p => ({ name: p.name, bestRace: p.bestRace! }));
      this.boardAt = now;
    }
    const others = [...this.members.values()].filter(p => p !== member && p.actor.world === member.actor.world);
    others.sort((a, b) => Math.hypot(a.actor.x - member.actor.x, a.actor.z - member.actor.z) - Math.hypot(b.actor.x - member.actor.x, b.actor.z - member.actor.z));
    return { session: member.session, serverTime: now, self: { ...member.actor }, profile: structuredClone(member.profile),
      peers: others.slice(0, 32).map(p => ({ ...p.actor })), online: others.length + 1, leaderboard: this.board.map(p => ({ ...p })) };
  }
  close() { this.members.clear(); this.db.close(); }
}
