import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { legacySave } from "./fixtures.ts";
const original = readFileSync("deploy/upgrade.mjs", "utf8"),
  modules = resolve("node_modules"),
  source = resolve(".");
for (const mode of ["success", "invalid-save", "rollback"]) {
  const root = mkdtempSync(join(tmpdir(), "planets-upgrade-")),
    app = join(root, "app"),
    data = join(root, "planets.sqlite"),
    bin = join(root, "bin");
  mkdirSync(app);
  mkdirSync(bin);
  writeFileSync(join(root, "running"), "1");
  writeFileSync(join(app, "old-version"), "1");
  const env = `BOT_TOKEN=synthetic-test-only\nHOST=127.0.0.1\nPORT=8003\nDATABASE_PATH=${data}\n`;
  writeFileSync(join(app, ".env"), env);
  const old = legacySave();
  let db = new DatabaseSync(data);
  db.exec("CREATE TABLE saves(user_id TEXT PRIMARY KEY,state TEXT NOT NULL)");
  db.prepare("INSERT INTO saves VALUES(?,?)").run(
    "1",
    mode === "invalid-save" ? "{}" : JSON.stringify(old),
  );
  db.close();
  const stub = (name, body) =>
    writeFileSync(join(bin, name), `#!/bin/sh\nset -eu\n${body}\n`, {
      mode: 0o755,
    });
  stub(
    "id",
    `case "$1" in -u) echo ${process.getuid()}; ;; -g) echo ${process.getgid()}; ;; *) exit 1 ;; esac`,
  );
  stub("chown", "exit 0");
  stub("npm", `ln -s '${modules}' node_modules`);
  stub(
    "systemctl",
    `case "$1" in is-active) test -f '${root}/running' ;; stop) rm -f '${root}/running' ;; start) touch '${root}/running' ;; *) exit 1 ;; esac`,
  );
  const server = createServer((req, res) => {
    const isNew = existsSync(join(app, "package.json"));
    if (mode === "rollback" && isNew) {
      const db = new DatabaseSync(data);
      db.prepare("UPDATE saves SET state=?").run(
        JSON.stringify({ version: 2, changed: true }),
      );
      db.close();
      res.writeHead(503);
      res.end("{}");
    } else res.end('{"ok":true}');
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  let script = original
    .replace("process.getuid?.() !== 0", "false")
    .replaceAll('"/opt/little-planets"', JSON.stringify(app))
    .replaceAll(
      '"/var/lib/little-planets/planets.sqlite"',
      JSON.stringify(data),
    )
    .replace(
      "`/opt/little-planets-backup-${stamp}`",
      "`" + root + "/backup-${stamp}`",
    )
    .replace(
      '"/opt/.little-planets-next-"',
      JSON.stringify(join(root, "next-")),
    )
    .replace(
      'join(dirname(process.execPath), "npm")',
      JSON.stringify(join(bin, "npm")),
    )
    .replace(
      "http://127.0.0.1:8003/api/health",
      `http://127.0.0.1:${port}/api/health`,
    )
    .replace("setTimeout(done, 500)", "setTimeout(done, 10)");
  const path = join(root, "upgrade.mjs");
  writeFileSync(path, script);
  let output = "";
  try {
    const child = spawn(process.execPath, [path, source], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const code = await new Promise((done, reject) => {
      child.on("error", reject);
      child.on("close", done);
    });
    assert.equal(code, mode === "success" ? 0 : 1, output);
    assert(existsSync(join(root, "running")), output);
    assert.equal(readFileSync(join(app, ".env"), "utf8"), env);
    const check = new DatabaseSync(data);
    const restored = JSON.parse(
      check.prepare("SELECT state FROM saves").get().state,
    );
    check.close();
    assert.deepEqual(restored, mode === "invalid-save" ? {} : old);
    assert.equal(existsSync(join(app, "old-version")), mode !== "success");
    const backups = readdirSync(root).filter((n) => n.startsWith("backup-"));
    assert.equal(backups.length, 1);
    assert(existsSync(join(root, backups[0], "planets.sqlite")));
    assert(!output.includes("synthetic-test-only"));
    console.log(
      `PASS: upgrade ${mode}, env/save backup, service state and rollback.`,
    );
  } catch (e) {
    console.error(output);
    throw e;
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(root, { recursive: true, force: true });
  }
}
