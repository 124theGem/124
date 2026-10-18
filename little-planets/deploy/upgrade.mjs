#!/usr/bin/env node
// Only updates this application's directory and database; uses the existing service unit.
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  renameSync,
  copyFileSync,
  chmodSync,
  chownSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { execFileSync, spawnSync } from "node:child_process";
import { DatabaseSync, backup } from "node:sqlite";
const source = resolve(
  process.argv[2] || dirname(new URL(import.meta.url).pathname) + "/..",
);
const app = "/opt/little-planets",
  unit = "little-planets",
  envFile = join(app, ".env");
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...options });
const fail = (message) => {
  throw new Error(message);
};
if (process.getuid?.() !== 0)
  fail("Run as root on your Little Planets server.");
if (!existsSync(envFile))
  fail("Existing /opt/little-planets/.env was not found. No changes made.");
const conf = parseEnv(readFileSync(envFile, "utf8"));
if (
  resolve(conf.DATABASE_PATH || "") !== "/var/lib/little-planets/planets.sqlite"
)
  fail(
    "Expected DATABASE_PATH=/var/lib/little-planets/planets.sqlite. No changes made.",
  );
if (conf.HOST !== "127.0.0.1" || conf.PORT !== "8003")
  fail("Expected existing HOST=127.0.0.1 and PORT=8003. No changes made.");
if (!conf.BOT_TOKEN)
  fail("BOT_TOKEN is missing in the existing .env. No changes made.");
const database = conf.DATABASE_PATH;
const archive = join(source, "releases/little-planets-frontiers-v3.tar.gz"),
  expected = readFileSync(`${archive}.sha256`, "utf8").trim().split(/\s+/)[0];
if (
  createHash("sha256").update(readFileSync(archive)).digest("hex") !== expected
)
  fail("Package SHA-256 mismatch. No changes made.");
const uid = Number(
    execFileSync("id", ["-u", unit], { encoding: "utf8" }).trim(),
  ),
  gid = Number(execFileSync("id", ["-g", unit], { encoding: "utf8" }).trim());
const active =
  spawnSync("systemctl", ["is-active", "--quiet", unit]).status === 0;
if (!active)
  fail("The existing little-planets service must be running before upgrading.");
const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
  backupDir = `/opt/little-planets-backup-${stamp}`,
  stage = mkdtempSync("/opt/.little-planets-next-");
let stopped = false,
  swapped = false,
  oldMoved = false,
  dbBackup = false;
try {
  run("tar", ["-xzf", archive, "-C", stage]);
  chmodSync(stage, 0o755);
  // Install before downtime. BOT_TOKEN is never passed to package scripts or printed.
  run(
    join(dirname(process.execPath), "npm"),
    ["ci", "--omit=dev", "--no-audit", "--no-fund"],
    {
      cwd: stage,
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
      },
    },
  );
  copyFileSync(envFile, join(stage, ".env"));
  chmodSync(join(stage, ".env"), 0o600);
  run("chown", ["-R", `${uid}:${gid}`, stage]);
  mkdirSync(backupDir, { mode: 0o700 });
  console.log(`Backup: ${backupDir}`);
  run("systemctl", ["stop", unit]);
  stopped = true;
  if (existsSync(database)) {
    const db = new DatabaseSync(database);
    try {
      await backup(db, join(backupDir, "planets.sqlite"));
      dbBackup = true;
    } finally {
      db.close();
    }
  }
  // Validate saved JSON; old prototype versions start fresh on first login.
  const validator = join(stage, "check-saves.mjs");
  writeFileSync(
    validator,
    `import {DatabaseSync} from 'node:sqlite';import {parseSave} from './shared/model.ts';const db=new DatabaseSync(process.argv[2],{readOnly:true});try{let n=0;for(const r of db.prepare('SELECT state FROM saves').iterate()){parseSave(r.state);n++;}console.log('Validated saves: '+n);}finally{db.close();}`,
  );
  if (dbBackup)
    run(process.execPath, [
      "--import",
      join(stage, "node_modules/tsx/dist/loader.mjs"),
      validator,
      join(backupDir, "planets.sqlite"),
    ]);
  rmSync(validator);
  renameSync(app, join(backupDir, "app"));
  oldMoved = true;
  renameSync(stage, app);
  swapped = true;
  run("systemctl", ["start", unit]);
  let healthy = false;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8003/api/health", {
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok && (await r.json()).ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!healthy) fail("New service did not pass the health check.");
  console.log(
    "Updated successfully. Reopen the Telegram Mini App. Settings are preserved. Earlier prototype progress starts fresh in this version.",
  );
  console.log("Caddy, DNS and other services were not changed.");
} catch (error) {
  console.error("Update failed:", error.message);
  if (stopped) {
    run("systemctl", ["stop", unit]);
    if (swapped) renameSync(app, join(backupDir, "failed-app"));
    if (oldMoved) renameSync(join(backupDir, "app"), app);
    if (dbBackup && swapped) {
      for (const suffix of ["-wal", "-shm"])
        rmSync(database + suffix, { force: true });
      copyFileSync(join(backupDir, "planets.sqlite"), database);
      chownSync(database, uid, gid);
      chmodSync(database, 0o600);
    }
    run("systemctl", ["start", unit]);
    console.error("Previous application restarted. Backup:", backupDir);
  }
  process.exitCode = 1;
} finally {
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
}
