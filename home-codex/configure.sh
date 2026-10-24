#!/usr/bin/env bash
set -euo pipefail
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
state_root="$HOME/.local/share/home-codex"
mkdir -p "$state_root"
export PATH="$state_root/node/bin:$state_root/tools/bin:$PATH"
exec flock -n -E 75 "$state_root/process.lock" node "$app_root/app.mjs" setup
