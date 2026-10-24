import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "planets-runtime-"));
try {
  execFileSync("tar", [
    "-xzf",
    resolve("releases", JSON.parse(readFileSync("deploy/artifact.json","utf8")).archive),
    "-C",
    dir,
  ]);
  execFileSync(
    "npm",
    [
      "ci",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--cache",
      resolve(".npm-cache"),
    ],
    { cwd: dir, stdio: "inherit" },
  );
  const code = `const {createApp}=await import(${JSON.stringify(pathToFileURL(join(dir, "server/app.ts")).href)});const app=await createApp({botToken:'synthetic-fixture-only',databasePath:':memory:'});try{const health=await app.inject('/api/health');if(health.statusCode!==200||!health.json().ok)throw Error('Health failed');const html=await app.inject('/');if(html.statusCode!==200||!html.body.includes('EMBERFALL'))throw Error('Static files unavailable');const auth=await app.inject('/api/state');if(auth.statusCode!==401)throw Error('Unauthenticated legacy login enabled');const raid=await app.inject({method:'POST',url:'/api/raid',payload:{type:'hello'}});if(raid.statusCode!==401)throw Error('Unauthenticated raid login enabled');const webhook=await app.inject({method:'POST',url:'/api/raid/payments/telegram',payload:{update_id:1}});if(webhook.statusCode!==403)throw Error('Unsigned payment accepted');}finally{await app.close();}`;
  execFileSync(
    process.execPath,
    [
      "--import",
      join(dir, "node_modules/tsx/dist/loader.mjs"),
      "--input-type=module",
      "-e",
      code,
    ],
    {
      cwd: dir,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  console.log(
    "PASS: release archive installs with production dependencies only and serves HTML, health and protected API.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
