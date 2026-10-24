#!/usr/bin/env bash
set -euo pipefail
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
state_root="$HOME/.local/share/home-codex"
mkdir -p "$state_root"
chmod 700 "$state_root"
export PATH="$state_root/node/bin:$state_root/tools/bin:$PATH"
export HOME_CODEX_LOCKED=1
exec flock -n -E 75 "$state_root/process.lock" node "$app_root/app.mjs" run
