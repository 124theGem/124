#!/usr/bin/env node
/** Server-initiated HTTPS deployments from one explicitly promoted GitHub channel. No listener or credentials. */
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { join, resolve, posix } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { DatabaseSync } from "node:sqlite";

export const CHANNEL_URL =
  "https://raw.githubusercontent.com/124theGem/124/little-planets-mvp/little-planets/deploy/channel.json";
const STATE_DIR = "/var/lib/little-planets-updater";
const APP_DIR = "/opt/little-planets";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  throw new Error(message);
};

export function parseChannel(value) {
  const c = typeof value === "string" ? JSON.parse(value) : value;
  if (!c || typeof c !== "object" || Array.isArray(c))
    fail("Invalid release channel");
  const keys = [
    "schema",
    "release",
    "version",
    "commit",
    "archive",
    "sha256",
    "enabled",
  ];
  if (
    Object.keys(c).some((k) => !keys.includes(k)) ||
    c.schema !== 1 ||
    !Number.isSafeInteger(c.release) ||
    c.release < 1 ||
    typeof c.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(c.version) ||
    typeof c.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(c.commit) ||
    typeof c.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(c.sha256) ||
    typeof c.archive !== "string" ||
    !/^little-planets-[a-z0-9-]+-v\d+\.tar\.gz$/.test(c.archive) ||
    (c.enabled !== undefined && typeof c.enabled !== "boolean")
  )
    fail("Invalid release channel fields");
  return {
    schema: 1,
    release: c.release,
    version: c.version,
    commit: c.commit,
    archive: c.archive,
    sha256: c.sha256,
    enabled: c.enabled ?? true,
  };
}
export const fingerprint = (c) =>
  digest(JSON.stringify([c.release, c.version, c.commit, c.archive, c.sha256]));
const curl = (url, extra = [], maxBytes = 65536) =>
  execFileSync(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "--connect-timeout",
      "15",
      "--max-time",
      "180",
      "--retry",
      "2",
      "--max-filesize",
      String(maxBytes),
      ...extra,
      url,
    ],
    { encoding: "utf8", maxBuffer: Math.max(maxBytes, 65536) },
  );

export function readState(stateDir) {
  const file = join(stateDir, "state.json");
  if (!existsSync(file)) return { schema: 1 };
  const s = JSON.parse(readFileSync(file, "utf8"));
  if (
    !s ||
    s.schema !== 1 ||
    (s.applied &&
      (!Number.isSafeInteger(s.applied.release) ||
        typeof s.applied.fingerprint !== "string"))
  )
    fail("Invalid updater state; refusing to reset deployment history");
  return s;
}
function writeState(stateDir, state) {
  const temp = join(stateDir, `state-${process.pid}.tmp`);
  writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, join(stateDir, "state.json"));
}
function files(root, prefix = "") {
  const all = [];
  for (const name of readdirSync(join(root, prefix))) {
    const relative = join(prefix, name),
      stat = lstatSync(join(root, relative));
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
      fail("Links/devices are forbidden in a release package");
    if (stat.isDirectory()) all.push(...files(root, relative));
    else all.push(relative);
  }
  return all;
}
function validateTar(archive, selected) {
  const names = execFileSync(
    "tar",
    ["-tzf", archive, ...(selected ? [selected] : [])],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .trim()
    .split("\n");
  for (const name of names) {
    const n = name.replace(/^\.\//, "");
    if (name === "./" || name === ".") continue;
    if (
      !n ||
      n.startsWith("/") ||
      n.includes("\\") ||
      posix.normalize(n).split("/").includes("..") ||
      n.split("/").includes("..")
    )
      fail("Unsafe release archive path");
  }
  const verbose = execFileSync(
    "tar",
    ["-tvzf", archive, ...(selected ? [selected] : [])],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (
    verbose
      .trim()
      .split("\n")
      .some((line) => !["-", "d"].includes(line[0]))
  )
    fail("Only regular files and directories are accepted in release archives");
}
/** Refuse automatic releases whose known migration would reset a saved planet. */
export function validateWorldGenerations(source, database) {
  const code = readFileSync(join(source, "shared/model.ts"), "utf8");
  const match = code.match(/export\s+const\s+WORLD_GENERATION\s*=\s*(\d+)/);
  if (!match || Number(match[1]) !== 3)
    fail(
      "Automatic generation changes are refused; a separate save migration is required",
    );
  if (!existsSync(database)) return;
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    for (const row of db.prepare("SELECT state FROM saves").iterate()) {
      const save = JSON.parse(row.state);
      if (save.generation !== 3)
        fail(
          "An older saved world would reset in this release; automatic update refused before stopping the game",
        );
    }
  } finally {
    db.close();
  }
}
function validateInstalledWorlds(source, appDir) {
  const env = parseEnv(readFileSync(join(appDir, ".env"), "utf8"));
  if (env.DATABASE_PATH !== "/var/lib/little-planets/planets.sqlite")
    fail("Unexpected existing database path");
  validateWorldGenerations(source, env.DATABASE_PATH);
}

const defaultTransport = {
  channel: async () =>
    curl(CHANNEL_URL, ["--header", "Cache-Control: no-cache"]),
  source: async (commit, dest) => {
    curl(
      `https://codeload.github.com/124theGem/124/tar.gz/${commit}`,
      ["--output", dest],
      256 * 1024 * 1024,
    );
  },
};

export async function pullRelease({
  stateDir = STATE_DIR,
  appDir = APP_DIR,
  transport = defaultTransport,
  beforeInstall = (source) => validateInstalledWorlds(source, appDir),
  install = (source) =>
    execFileSync(
      process.execPath,
      [join(source, "deploy/upgrade.mjs"), source],
      { stdio: "inherit" },
    ),
  log = console.log,
  checkOnly = false,
  retry = false,
  health = async () => {
    const r = await fetch("http://127.0.0.1:8003/api/health", {
      signal: AbortSignal.timeout(5000),
    });
    return r.ok && (await r.json()).ok === true;
  },
} = {}) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const paused = () => existsSync(join(stateDir, "paused"));
  if (paused()) {
    log("Auto-updates are paused locally.");
    return "paused";
  }
  const channel = parseChannel(await transport.channel());
  if (!channel.enabled) {
    log("Release channel is paused.");
    return "paused";
  }
  const state = readState(stateDir),
    key = fingerprint(channel),
    current = state.applied;
  if (current && channel.release < current.release)
    fail(
      "Older release sequence refused; publish an explicit new release for rollback",
    );
  if (current && channel.release === current.release) {
    if (current.fingerprint !== key)
      fail(
        "An existing release sequence was changed; publish a new release number",
      );
    log(`Already current: ${current.version} / ${current.commit.slice(0, 12)}`);
    return "current";
  }
  if (state.failed?.fingerprint === key && !retry) {
    log(
      `Release ${channel.release} remains blocked after a previous failure; use --retry after diagnosis.`,
    );
    return "blocked";
  }
  if (checkOnly) {
    log(
      `Available: ${channel.version}, release ${channel.release}, commit ${channel.commit}. No application changes.`,
    );
    return "available";
  }
  const work = mkdtempSync(join(stateDir, "download-"));
  let attempted = false,
    downloaded = false;
  try {
    const sourceArchive = join(work, "source.tar.gz");
    log(
      `Downloading verified release ${channel.version} / ${channel.commit.slice(0, 12)}`,
    );
    await transport.source(channel.commit, sourceArchive);
    downloaded = true;
    const prefix = `124-${channel.commit}/little-planets`;
    validateTar(sourceArchive, prefix);
    execFileSync("tar", [
      "-xzf",
      sourceArchive,
      "-C",
      work,
      "--no-same-owner",
      "--no-same-permissions",
      prefix,
    ]);
    const source = join(work, prefix),
      archive = join(source, "releases", channel.archive);
    if (lstatSync(join(source, "deploy/upgrade.mjs")).isSymbolicLink())
      fail("Symlink upgrader refused");
    if (digest(readFileSync(archive)) !== channel.sha256)
      fail("Release SHA-256 mismatch; application untouched");
    if (
      readFileSync(`${archive}.sha256`, "utf8").trim().split(/\s+/)[0] !==
      channel.sha256
    )
      fail("Release sidecar mismatch");
    if (
      JSON.parse(readFileSync(join(source, "package.json"), "utf8")).version !==
      channel.version
    )
      fail("Source version differs from release channel");
    validateTar(archive);
    const unpack = join(work, "package");
    mkdirSync(unpack);
    execFileSync("tar", [
      "-xzf",
      archive,
      "-C",
      unpack,
      "--no-same-owner",
      "--no-same-permissions",
    ]);
    const members = files(unpack);
    if (
      members.some(
        (f) =>
          f.split("/").includes(".env") ||
          f.split("/").includes("node_modules"),
      )
    )
      fail("Release contains forbidden runtime secrets/dependencies");
    if (
      JSON.parse(readFileSync(join(unpack, "package.json"), "utf8")).version !==
      channel.version
    )
      fail("Artifact version differs from release channel");
    if (
      [
        "package.json",
        "package-lock.json",
        "dist/index.html",
        "server/index.ts",
        "shared/model.ts",
      ].some((f) => !members.includes(f))
    )
      fail("Release is missing required runtime files");
    await beforeInstall(source);
    const same = members.every((f) => {
      const dest = join(appDir, f);
      return (
        existsSync(dest) &&
        lstatSync(dest).isFile() &&
        digest(readFileSync(dest)) === digest(readFileSync(join(unpack, f)))
      );
    });
    if (paused()) {
      log("Auto-updates paused before installation.");
      return "paused";
    }
    if (!same) {
      attempted = true;
      await install(source);
      // The upgrader has already checked health. Also confirm the intended bytes were installed.
      if (
        !members.every(
          (f) =>
            existsSync(join(appDir, f)) &&
            digest(readFileSync(join(appDir, f))) ===
              digest(readFileSync(join(unpack, f))),
        )
      )
        fail("Installed release does not match the promoted package");
    }
    if (!(await health())) fail("Installed service failed the health check");
    const next = {
      ...state,
      applied: {
        release: channel.release,
        version: channel.version,
        commit: channel.commit,
        sha256: channel.sha256,
        fingerprint: key,
        at: new Date().toISOString(),
      },
    };
    delete next.failed;
    writeState(stateDir, next);
    log(
      same
        ? "Verified existing installation; recorded release without restarting the game."
        : "Release installed successfully; application and SQLite backups were retained by the upgrader.",
    );
    return same ? "adopted" : "installed";
  } catch (error) {
    if (attempted || downloaded)
      writeState(stateDir, {
        ...state,
        failed: {
          fingerprint: key,
          at: new Date().toISOString(),
          message: String(error.message).slice(0, 300),
        },
      });
    throw error;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  if (process.getuid?.() !== 0)
    fail("Run the updater as root on the Little Planets server");
  const flags = process.argv.slice(2);
  if (flags.some((f) => !["--check", "--retry", "--locked"].includes(f)))
    fail("Unknown updater option");
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const dir = lstatSync(STATE_DIR);
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== 0 ||
    dir.mode & 0o022
  )
    fail(
      "Updater state directory must be owned by root and not writable by other users",
    );
  if (!flags.includes("--locked")) {
    const run = spawnSync(
      "flock",
      [
        "--nonblock",
        "--conflict-exit-code",
        "75",
        join(STATE_DIR, "pull.lock"),
        process.execPath,
        resolve(process.argv[1]),
        "--locked",
        ...flags,
      ],
      { stdio: "inherit" },
    );
    if (run.error) throw run.error;
    if (run.status === 75) {
      console.log("Another automatic update is running.");
      return;
    }
    process.exitCode = run.status ?? 1;
    return;
  }
  await pullRelease({
    checkOnly: flags.includes("--check"),
    retry: flags.includes("--retry"),
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((e) => {
    console.error("Little Planets update failed:", e.message);
    process.exitCode = 1;
  });
}
