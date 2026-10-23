#!/usr/bin/env node
/** Publish only the channel pointer after the tested payload commit has reached GitHub. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseChannel } from "./pull-release.mjs";
const [commit, archive, version, ...extra] = process.argv.slice(2);
const dryRun = extra.length === 1 && extra[0] === "--dry-run";
if (extra.length && !dryRun) throw new Error("Unknown arguments");
if (
  !commit ||
  !/^[a-f0-9]{40}$/.test(commit) ||
  !archive ||
  !/^little-planets-[a-z0-9-]+-v\d+\.tar\.gz$/.test(archive) ||
  !version ||
  !/^\d+\.\d+\.\d+$/.test(version)
)
  throw new Error(
    "Usage: node deploy/promote-release.mjs <published-commit> <archive-name> <version> [--dry-run]",
  );
const previous = parseChannel(readFileSync("deploy/channel.json", "utf8"));
const sha256 = createHash("sha256")
  .update(readFileSync(join("releases", archive ?? "")))
  .digest("hex");
const channel = parseChannel({
  schema: 1,
  release: previous.release + 1,
  commit,
  archive,
  version,
  sha256,
});
if (
  readFileSync(join("releases", archive + ".sha256"), "utf8")
    .trim()
    .split(/\s+/)[0] !== sha256
)
  throw new Error("Local release sidecar mismatch");
const work = mkdtempSync(join(tmpdir(), "little-planets-promote-"));
try {
  const file = join(work, "published.tar.gz");
  execFileSync("curl", [
    "--fail",
    "--location",
    "--silent",
    "--show-error",
    "--proto",
    "=https",
    "--proto-redir",
    "=https",
    "--max-time",
    "180",
    "--max-filesize",
    String(256 * 1024 * 1024),
    `https://codeload.github.com/124theGem/124/tar.gz/${channel.commit}`,
    "--output",
    file,
  ]);
  const prefix = `124-${channel.commit}/little-planets`;
  const bytes = execFileSync(
    "tar",
    ["-xOf", file, `${prefix}/releases/${channel.archive}`],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  if (createHash("sha256").update(bytes).digest("hex") !== channel.sha256)
    throw new Error("Published artifact differs from local validated release");
  const pkg = JSON.parse(
    execFileSync("tar", ["-xOf", file, `${prefix}/package.json`], {
      encoding: "utf8",
    }),
  );
  if (pkg.version !== channel.version)
    throw new Error("Published source version differs from channel");
  const manifest = JSON.parse(
    execFileSync("tar", ["-xOf", file, `${prefix}/deploy/artifact.json`], {
      encoding: "utf8",
    }),
  );
  if (
    manifest.version !== channel.version ||
    manifest.archive !== channel.archive ||
    manifest.sha256 !== channel.sha256
  )
    throw new Error("Installer artifact manifest differs from promoted release");
  const payload = join(work, "payload.tar.gz");
  writeFileSync(payload, bytes);
  const artifact = JSON.parse(
    execFileSync("tar", ["-xOf", payload, "package.json"], {
      encoding: "utf8",
    }),
  );
  if (artifact.version !== channel.version)
    throw new Error("Published artifact version differs from channel");
  if (dryRun)
    console.log("DRY RUN: published artifact verified; channel unchanged.");
  else {
    writeFileSync(
      resolve("deploy/channel.json"),
      JSON.stringify(channel, null, 2) + "\n",
    );
    console.log(
      "Verified channel prepared. Commit and push deploy/channel.json after reviewing the completed release checks.",
    );
  }
  console.log(JSON.stringify(channel, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
