import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
mkdirSync("releases", { recursive: true });
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const archive = `little-planets-server-v${version.replaceAll(".", "")}.tar.gz`;
const file = `releases/${archive}`;
execFileSync("tar", [
  "-czf",
  file,
  "dist",
  "server",
  "shared",
  "package.json",
  "package-lock.json",
  ".env.example",
  "ASSETS.md",
  "RIFT-RAID.md",
  "scripts/raid-metrics.mjs",
  "deploy/raid-stars.mjs",
]);
const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
writeFileSync(`${file}.sha256`, `${sha}  ${archive}\n`);
writeFileSync(
  "deploy/artifact.json",
  JSON.stringify({ version, archive, sha256: sha }, null, 2) + "\n",
);
console.log(`${file}: ${sha}`);
