import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
mkdirSync("releases", { recursive: true });
const file = "releases/little-planets-journey-v7.tar.gz";
execFileSync("tar", [
  "-czf",
  file,
  "dist",
  "server",
  "shared",
  "package.json",
  "package-lock.json",
  ".env.example",
]);
const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
writeFileSync(`${file}.sha256`, `${sha}  little-planets-journey-v7.tar.gz\n`);
console.log(`${file}: ${sha}`);
