import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  cpSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  parseChannel,
  pullRelease,
  readState,
  fingerprint,
  validateWorldGenerations,
} from "../deploy/pull-release.mjs";

let count = 0;
async function scenario(name, test) {
  await test();
  count++;
  console.log("PASS", name);
}
const root = mkdtempSync(join(tmpdir(), "little-planets-pull-test-"));
const fixture = join(root, "fixture"),
  commit = "7cccb796aeea62cd77e1def682acb98064d271e0";
const prefix = `124-${commit}/little-planets`;
mkdirSync(join(fixture, prefix, "releases"), { recursive: true });
mkdirSync(join(fixture, prefix, "deploy"));
writeFileSync(join(fixture, prefix, "package.json"), '{"version":"0.16.0"}');
writeFileSync(
  join(fixture, prefix, "deploy/upgrade.mjs"),
  "// Test-only installer entry; production uses the audited upgrader",
);
const artifact = join(root, "artifact");
mkdirSync(artifact);
const members = {
  "package.json": '{"version":"0.16.0"}',
  "package-lock.json": "{}",
  "dist/index.html": "<h1>Real artifact fixture</h1>",
  "server/index.ts": "export const server=true;",
  "shared/model.ts": "export const generation=3;",
};
for (const [name, body] of Object.entries(members)) {
  mkdirSync(join(artifact, name, ".."), { recursive: true });
  writeFileSync(join(artifact, name), body);
}
const archive = "little-planets-atlas-v16.tar.gz",
  payload = join(fixture, prefix, "releases", archive);
execFileSync("tar", ["-czf", payload, "-C", artifact, "."]);
const hash = createHash("sha256").update(readFileSync(payload)).digest("hex");
writeFileSync(payload + ".sha256", `${hash}  ${archive}\n`);
const source = join(root, "source.tar.gz");
execFileSync("tar", ["-czf", source, "-C", fixture, `124-${commit}`]);
const channel = {
  schema: 1,
  release: 16,
  version: "0.16.0",
  commit,
  archive,
  sha256: hash,
};
let instance = 0;
function harness() {
  const dir = join(root, "case-" + ++instance),
    stateDir = join(dir, "state"),
    appDir = join(dir, "app");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, ".env"), "BOT_TOKEN=test-only-do-not-log\n");
  writeFileSync(join(appDir, "progress.txt"), "persistent user progress");
  const logs = [];
  let installs = 0,
    downloads = 0;
  const config = {
    stateDir,
    appDir,
    health: async () => true,
    beforeInstall: async () => {},
    log: (s) => logs.push(s),
    transport: {
      channel: async () => JSON.stringify(channel),
      source: async (c, d) => {
        assert.equal(c, commit);
        downloads++;
        cpSync(source, d);
      },
    },
    install: async (src) => {
      assert(existsSync(join(src, "deploy/upgrade.mjs")));
      installs++;
      cpSync(artifact, appDir, { recursive: true });
    },
  };
  return {
    dir,
    stateDir,
    appDir,
    config,
    logs,
    installs: () => installs,
    downloads: () => downloads,
  };
}
try {
  await scenario(
    "rejects malformed channels, arbitrary archive paths, changed schemas and executable fields",
    async () => {
      for (const invalid of [
        { ...channel, archive: "../../x.tar.gz" },
        { ...channel, commit: "HEAD" },
        { ...channel, release: 0 },
        { ...channel, command: "rm" },
        { ...channel, sha256: "a" },
        { ...channel, schema: 2 },
      ])
        assert.throws(() => parseChannel(invalid));
    },
  );
  await scenario(
    "installs a hash-verified artifact, retains env/progress, records exact release and does not redeploy it",
    async () => {
      const h = harness();
      assert.equal(await pullRelease(h.config), "installed");
      assert.equal(h.installs(), 1);
      assert.equal(readState(h.stateDir).applied.commit, commit);
      assert.equal(
        readFileSync(join(h.appDir, "progress.txt"), "utf8"),
        "persistent user progress",
      );
      assert.equal(
        readFileSync(join(h.appDir, ".env"), "utf8"),
        "BOT_TOKEN=test-only-do-not-log\n",
      );
      assert.equal(await pullRelease(h.config), "current");
      assert.equal(h.installs(), 1);
      assert.equal(h.downloads(), 1);
      assert(!h.logs.join("\n").includes("test-only-do-not-log"));
      assert(!readdirSync(h.stateDir).some((f) => f.startsWith("download-")));
    },
  );
  await scenario(
    "adopts an exactly matching installed release without restarting or reinstalling it",
    async () => {
      const h = harness();
      cpSync(artifact, h.appDir, { recursive: true });
      assert.equal(await pullRelease(h.config), "adopted");
      assert.equal(h.installs(), 0);
    },
  );
  await scenario(
    "checks availability without installing, downloading payload or recording it as applied",
    async () => {
      const h = harness();
      assert.equal(
        await pullRelease({ ...h.config, checkOnly: true }),
        "available",
      );
      assert.equal(h.downloads(), 0);
      assert(!existsSync(join(h.stateDir, "state.json")));
    },
  );
  await scenario(
    "fails a wrong artifact digest before installation and leaves current progress untouched",
    async () => {
      const h = harness();
      h.config.transport.channel = async () => ({
        ...channel,
        sha256: "a".repeat(64),
      });
      await assert.rejects(pullRelease(h.config), /SHA-256/);
      assert.equal(h.installs(), 0);
      assert(!readState(h.stateDir).applied);
      assert.equal(
        readFileSync(join(h.appDir, "progress.txt"), "utf8"),
        "persistent user progress",
      );
    },
  );
  await scenario(
    "does not repeat failed installs until a diagnosed manual retry or a newly promoted release",
    async () => {
      const h = harness();
      h.config.install = async () => {
        throw new Error("Fixture rollback completed");
      };
      await assert.rejects(pullRelease(h.config), /rollback completed/);
      assert.equal(
        readState(h.stateDir).failed.fingerprint,
        fingerprint(parseChannel(channel)),
      );
      const downloads = h.downloads();
      assert.equal(await pullRelease(h.config), "blocked");
      assert.equal(h.downloads(), downloads);
      h.config.install = async () =>
        cpSync(artifact, h.appDir, { recursive: true });
      assert.equal(
        await pullRelease({ ...h.config, retry: true }),
        "installed",
      );
      assert(!readState(h.stateDir).failed);
    },
  );
  await scenario(
    "rejects altered or older sequence numbers and permits an explicit rollback as a new sequence",
    async () => {
      const h = harness();
      await pullRelease(h.config);
      h.config.transport.channel = async () => ({ ...channel, release: 15 });
      await assert.rejects(pullRelease(h.config), /Older release/);
      h.config.transport.channel = async () => ({
        ...channel,
        sha256: "b".repeat(64),
      });
      await assert.rejects(pullRelease(h.config), /sequence was changed/);
      h.config.transport.channel = async () => ({ ...channel, release: 17 });
      assert.equal(await pullRelease(h.config), "adopted");
      assert.equal(readState(h.stateDir).applied.release, 17);
    },
  );
  await scenario(
    "retries transient download errors on a later scheduled check without blocking the release",
    async () => {
      const h = harness(),
        original = h.config.transport.source;
      h.config.transport.source = async () => {
        throw new Error("network down");
      };
      await assert.rejects(pullRelease(h.config), /network down/);
      assert(!readState(h.stateDir).failed);
      h.config.transport.source = original;
      assert.equal(await pullRelease(h.config), "installed");
    },
  );
  await scenario(
    "honors local and remotely published pause switches, including a pause before installation",
    async () => {
      const h = harness();
      mkdirSync(h.stateDir);
      writeFileSync(join(h.stateDir, "paused"), "");
      assert.equal(await pullRelease(h.config), "paused");
      assert.equal(h.downloads(), 0);
      rmSync(join(h.stateDir, "paused"));
      h.config.transport.channel = async () => ({ ...channel, enabled: false });
      assert.equal(await pullRelease(h.config), "paused");
      assert.equal(h.downloads(), 0);
      h.config.transport.channel = async () => channel;
      const original = h.config.transport.source;
      h.config.transport.source = async (c, d) => {
        await original(c, d);
        writeFileSync(join(h.stateDir, "paused"), "");
      };
      assert.equal(await pullRelease(h.config), "paused");
      assert.equal(h.installs(), 0);
    },
  );
  await scenario(
    "refuses corrupt local history instead of resetting it or downgrading the installation",
    async () => {
      const h = harness();
      mkdirSync(h.stateDir);
      writeFileSync(join(h.stateDir, "state.json"), '{"schema":9}');
      await assert.rejects(pullRelease(h.config), /Invalid updater state/);
      assert.equal(h.installs(), 0);
    },
  );
  await scenario(
    "does not mark an unhealthy existing installation as a successful release",
    async () => {
      const h = harness();
      cpSync(artifact, h.appDir, { recursive: true });
      h.config.health = async () => false;
      await assert.rejects(pullRelease(h.config), /health check/);
      assert(!readState(h.stateDir).applied);
    },
  );
  await scenario(
    "rejects symbolic links in a release package before running the installer",
    async () => {
      const h = harness(),
        unsafe = join(root, "unsafe"),
        uSource = join(root, "unsafe-source.tar.gz");
      cpSync(fixture, unsafe, { recursive: true });
      const symlinkDir = join(root, "symlink-payload");
      cpSync(artifact, symlinkDir, { recursive: true });
      const { symlinkSync } = await import("node:fs");
      symlinkSync("/etc/passwd", join(symlinkDir, "link"));
      const uPayload = join(unsafe, prefix, "releases", archive);
      execFileSync("tar", ["-czf", uPayload, "-C", symlinkDir, "."]);
      const sha = createHash("sha256")
        .update(readFileSync(uPayload))
        .digest("hex");
      writeFileSync(uPayload + ".sha256", `${sha}  ${archive}\n`);
      execFileSync("tar", ["-czf", uSource, "-C", unsafe, `124-${commit}`]);
      h.config.transport.channel = async () => ({ ...channel, sha256: sha });
      h.config.transport.source = async (c, d) => cpSync(uSource, d);
      await assert.rejects(pullRelease(h.config), /regular files/);
      assert.equal(h.installs(), 0);
    },
  );
  await scenario(
    "protects current SQLite worlds and refuses old generations before an automatic migration",
    async () => {
      const { DatabaseSync } = await import("node:sqlite");
      const source = join(root, "generation-source");
      mkdirSync(join(source, "shared"), { recursive: true });
      writeFileSync(
        join(source, "shared/model.ts"),
        "export const WORLD_GENERATION = 3;",
      );
      const database = join(root, "save-guard.sqlite");
      const db = new DatabaseSync(database);
      db.exec("CREATE TABLE saves(state TEXT NOT NULL)");
      db.prepare("INSERT INTO saves VALUES(?)").run(
        JSON.stringify({ generation: 3, progression: { xp: 1234 } }),
      );
      validateWorldGenerations(source, database);
      const before = db.prepare("SELECT state FROM saves").get().state;
      assert.equal(JSON.parse(before).progression.xp, 1234);
      db.prepare("INSERT INTO saves VALUES(?)").run(
        JSON.stringify({ generation: 2, progression: { xp: 9876 } }),
      );
      assert.throws(
        () => validateWorldGenerations(source, database),
        /older saved world/,
      );
      assert.equal(db.prepare("SELECT state FROM saves").get().state, before);
      db.close();
      writeFileSync(
        join(source, "shared/model.ts"),
        "export const WORLD_GENERATION = 4;",
      );
      assert.throws(
        () => validateWorldGenerations(source, database),
        /generation changes/,
      );
    },
  );
  console.log(
    `PASS ${count} pull-deployment scenarios; no real service or server configuration was modified.`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
