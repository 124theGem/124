import { spawn } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = ["dev:client", "dev:server"].map((script) =>
  spawn(npm, ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, NODE_ENV: "development" },
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
