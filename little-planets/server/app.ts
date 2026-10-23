import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z, ZodError } from "zod";
import { verifyTelegram } from "./auth";
import { Store, Conflict } from "./store";
import { RuleError } from "../shared/model";
import { NexusServer } from "./nexus";
import { RaidServer, RaidError } from "./raid";
import { RaidPayments, type RaidPaymentConfig } from "./raid-payments";
export async function createApp(options: {
  botToken: string;
  databasePath: string;
  staticRoot?: string;
  raidPayments?: RaidPaymentConfig;
}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 24576,
    trustProxy: ["127.0.0.1", "::1"],
  });
  const store = new Store(options.databasePath);
  const nexus = new NexusServer(options.databasePath);
  const raid = new RaidServer(options.databasePath);
  const payments = new RaidPayments(raid, options.botToken, options.raidPayments);
  await payments.initialize();
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  app.addHook("onClose", async () => { raid.close(); nexus.close(); store.close(); });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    // Telegram embeds this app; frame-ancestors must permit Telegram web clients.
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    return payload;
  });
  app.get("/api/health", async () => ({ ok: true }));
  const authenticate = (header: string | undefined) => {
    if (!header?.startsWith("tma "))
      throw new Error("Откройте игру через Telegram");
    return verifyTelegram(header.slice(4), options.botToken);
  };
  app.post("/api/raid", { config: { rateLimit: { max: 1000, timeWindow: "1 minute", keyGenerator: (req: {headers: {authorization?:string};ip:string}) => {try{return `raider:${authenticate(req.headers.authorization).id}`;}catch{return req.ip;}} } } }, async (req, reply) => {
    let user;
    try { user = authenticate(req.headers.authorization); }
    catch { return reply.code(401).send({ error: "Откройте RIFT RAID через Telegram заново." }); }
    reply.header("Cache-Control", "no-store");
    try { return raid.request(user.id, user.first_name, req.body); }
    catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ error: "Некорректная команда рейда." });
      if (error instanceof RaidError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.post("/api/raid/invite", async (req, reply) => {
    let user;
    try { user = authenticate(req.headers.authorization); } catch { return reply.code(401).send({ error: "Откройте игру через Telegram." }); }
    const body = z.object({ session: z.string().uuid() }).strict().parse(req.body);
    const code = raid.invite(user.id, body.session), username = await payments.username();
    return { code, url: username ? `https://t.me/${username}?startapp=rr_${code}` : null };
  });
  app.post("/api/raid/invoice", async (req, reply) => {
    let user;
    try { user = authenticate(req.headers.authorization); } catch { return reply.code(401).send({ error: "Откройте игру через Telegram." }); }
    const body = z.object({ sku: z.enum(["solar", "void", "founder"]) }).strict().parse(req.body);
    try { return await payments.invoice(user.id, body.sku); }
    catch(error) { if(error instanceof RaidError)return reply.code(error.statusCode).send({error:error.message}); throw error; }
  });
  app.get("/api/raid/purchases", async (req, reply) => {
    let user;
    try { user = authenticate(req.headers.authorization); } catch { return reply.code(401).send({ error: "Откройте игру через Telegram." }); }
    reply.header("Cache-Control", "no-store"); return { purchases: payments.purchases(user.id) };
  });
  app.post("/api/raid/refund", async (req, reply) => {
    let user;
    try { user = authenticate(req.headers.authorization); } catch { return reply.code(401).send({ error: "Откройте игру через Telegram." }); }
    const body = z.object({ id: z.string().min(1).max(256) }).strict().parse(req.body);
    try { return await payments.refund(user.id,body.id); } catch(error) { if(error instanceof RaidError)return reply.code(error.statusCode).send({error:error.message});throw error; }
  });
  app.post("/api/raid/payments/telegram", async (req, reply) => {
    try { return await payments.webhook(typeof req.headers["x-telegram-bot-api-secret-token"] === "string" ? req.headers["x-telegram-bot-api-secret-token"] : undefined,req.body); }
    catch(error) { if(error instanceof RaidError)return reply.code(error.statusCode).send({error:error.message});throw error; }
  });
  app.post("/api/nexus", { config: { rateLimit: { max: 1200, timeWindow: "1 minute" } } }, async (req, reply) => {
    let user;
    try { user = authenticate(req.headers.authorization); }
    catch { return reply.code(401).send({ error: "Откройте игру через Telegram заново." }); }
    reply.header("Cache-Control", "no-store");
    try { return nexus.request(user.id, user.first_name, req.body); }
    catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ error: "Некорректная команда хаба." });
      const code = (error as { statusCode?: number }).statusCode;
      if (code && code >= 400 && code <= 503) return reply.code(code).send({ error: (error as Error).message });
      throw error;
    }
  });
  app.get("/api/state", async (req, reply) => {
    let user;
    try {
      user = authenticate(req.headers.authorization);
    } catch {
      return reply
        .code(401)
        .send({ error: "Откройте игру через Telegram заново." });
    }
    reply.header("Cache-Control", "no-store");
    return {
      state: store.get(user.id),
      serverTime: Date.now(),
      name: user.first_name,
    };
  });
  app.post("/api/action", async (req, reply) => {
    let user;
    try {
      user = authenticate(req.headers.authorization);
    } catch {
      return reply
        .code(401)
        .send({ error: "Вход устарел. Откройте Mini App заново." });
    }
    try {
      const body = z
        .object({
          revision: z.number().int().nonnegative(),
          action: z.unknown(),
        })
        .strict()
        .parse(req.body);
      reply.header("Cache-Control", "no-store");
      return {
        state: store.action(user.id, body.revision, body.action),
        serverTime: Date.now(),
      };
    } catch (error) {
      if (error instanceof Conflict)
        return reply
          .code(409)
          .send({
            error: error.message,
            state: error.state,
            serverTime: Date.now(),
          });
      if (error instanceof RuleError || error instanceof ZodError)
        return reply
          .code(400)
          .send({
            error:
              error instanceof RuleError
                ? error.message
                : "Некорректное действие.",
          });
      throw error;
    }
  });
  const root = resolve(options.staticRoot ?? "dist");
  if (existsSync(root))
    await app.register(staticFiles, {
      root,
      index: ["index.html"],
      cacheControl: true,
      maxAge: 0,
    });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "Некорректный запрос." });
    const code = (error as { statusCode?: number }).statusCode;
    if (code === 429)
      return reply
        .code(429)
        .send({ error: "Слишком много действий. Подождите немного." });
    if (code && code >= 400 && code < 500)
      return reply.code(code).send({ error: "Некорректный запрос." });
    reply
      .code(500)
      .send({ error: "Не удалось сохранить прогресс. Попробуйте ещё раз." });
  });
  return app;
}
