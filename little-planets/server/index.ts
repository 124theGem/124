import "dotenv/config";
import { createApp } from "./app";
const production = process.env.NODE_ENV === "production",
  botToken = process.env.BOT_TOKEN ?? "";
if (production && !botToken)
  throw new Error("Для production задайте BOT_TOKEN в .env сервера.");
const app = await createApp({
  botToken,
  databasePath: process.env.DATABASE_PATH ?? "./data/planets.sqlite",
  raidPayments: {
    enabled: process.env.RAID_STARS_ENABLED === "true",
    secret: process.env.RAID_STARS_WEBHOOK_SECRET,
    appURL: process.env.RAID_APP_URL,
    botUsername: process.env.RAID_BOT_USERNAME,
  },
});
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8003),
});
console.log(
  `EMBERFALL backend listening on port ${Number(process.env.PORT ?? 8003)} (${production ? "production" : "development"})`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
