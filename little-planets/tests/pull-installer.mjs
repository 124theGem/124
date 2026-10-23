import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  cpSync,
  lstatSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const script = readFileSync("deploy/install-pull-updater.sh", "utf8");
const realNode = process.execPath,
  realInstall = execFileSync("which", ["install"], { encoding: "utf8" }).trim();
for (const mode of ["success", "offline", "bad-env", "inactive"]) {
  const root = mkdtempSync(join(tmpdir(), "planets-install-pull-"));
  try {
    const bin = join(root, "bin"),
      source = join(root, "source"),
      app = join(root, "app"),
      state = join(root, "state"),
      target = join(root, "updater"),
      units = join(root, "units"),
      calls = join(root, "calls");
    for (const d of [bin, source, app, units, state]) mkdirSync(d);
    writeFileSync(join(state, "keep.txt"), "existing updater history");
    writeFileSync(
      join(app, ".env"),
      `BOT_TOKEN=never-print-this-fixture-token\nHOST=127.0.0.1\nPORT=${mode === "bad-env" ? "1234" : "8003"}\nDATABASE_PATH=/var/lib/little-planets/planets.sqlite\n`,
    );
    writeFileSync(join(app, "old-version"), "unchanged game");
    for (const name of [
      "pull-release.mjs",
      "little-planets-pull.service",
      "little-planets-pull.timer",
    ])
      cpSync(join("deploy", name), join(source, name));
    let testScript = script
      .replace(
        "LP_NODE='/opt/little-planets-node/bin/node'",
        `LP_NODE='${bin}/node'`,
      )
      .replace(
        "LP_UPDATER='/opt/little-planets-updater'",
        `LP_UPDATER='${target}'`,
      )
      .replace(
        "LP_STATE='/var/lib/little-planets-updater'",
        `LP_STATE='${state}'`,
      )
      .replace("LP_UNITS='/etc/systemd/system'", `LP_UNITS='${units}'`)
      .replace("LP_APP='/opt/little-planets'", `LP_APP='${app}'`);
    writeFileSync(join(source, "install.sh"), testScript);
    const stub = (name, body) =>
      writeFileSync(join(bin, name), `#!${realNode}\n${body}`, { mode: 0o755 });
    stub("id", `console.log('0')`);
    stub(
      "node",
      `import{spawnSync}from'node:child_process';const a=process.argv.slice(2);if(a[0]?.endsWith('/pull-release.mjs'))process.exit(${mode === "offline" ? 1 : 0});const r=spawnSync(${JSON.stringify(realNode)},a,{stdio:'inherit'});process.exit(r.status??1);`,
    );
    stub(
      "install",
      `import{spawnSync}from'node:child_process';const a=process.argv.slice(2),b=[];for(let i=0;i<a.length;i++){if(a[i]==='-o'||a[i]==='-g'){i++;continue;}b.push(a[i]);}const r=spawnSync(${JSON.stringify(realInstall)},b,{stdio:'inherit'});process.exit(r.status??1);`,
    );
    stub(
      "systemctl",
      `import{appendFileSync}from'node:fs';const a=process.argv.slice(2);appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');if(a[0]==='is-active')process.exit(${mode === "inactive" ? 1 : 0});`,
    );
    stub(
      "journalctl",
      `console.log('Fixture journal: no actual service invoked')`,
    );
    const run = spawnSync("bash", [join(source, "install.sh")], {
      encoding: "utf8",
      env: { ...process.env, PATH: bin + ":" + process.env.PATH },
    });
    assert.equal(
      run.status,
      mode === "success" ? 0 : 1,
      run.stdout + run.stderr,
    );
    assert.equal(
      existsSync(join(target, "pull-release.mjs")),
      mode === "success",
    );
    assert.equal(
      existsSync(join(units, "little-planets-pull.timer")),
      mode === "success",
    );
    assert.equal(
      readFileSync(join(app, "old-version"), "utf8"),
      "unchanged game",
    );
    assert.equal(
      readFileSync(join(state, "keep.txt"), "utf8"),
      "existing updater history",
    );
    assert(!run.stdout.includes("never-print-this-fixture-token"));
    if (mode === "success") {
      assert.equal(
        readFileSync(join(target, "pull-release.mjs"), "utf8"),
        readFileSync("deploy/pull-release.mjs", "utf8"),
      );
      const commands = readFileSync(calls, "utf8")
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      assert(
        commands.some(
          (a) =>
            JSON.stringify(a) ===
            JSON.stringify(["enable", "--now", "little-planets-pull.timer"]),
        ),
      );
      assert(
        commands.some(
          (a) =>
            JSON.stringify(a) ===
            JSON.stringify(["start", "little-planets-pull.service"]),
        ),
      );
      assert(
        !commands.some(
          (a) =>
            ["start", "stop", "restart", "enable"].includes(a[0]) &&
            a.includes("little-planets"),
        ),
      );
      assert.equal(lstatSync(state).mode & 0o777, 0o700);
    }
    console.log(
      "PASS installer",
      mode,
      "— existing game and updater history preserved; only dedicated updater units managed",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
