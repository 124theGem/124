#!/usr/bin/env bash
# Update only the static game release. Existing Caddy configuration and DNS are retained.
set -Eeuo pipefail
archive=${1:-/tmp/coastline-night-v2.zip}
expected_sha=8e8593a644077d32e4df407768055260d1823ad7a89dade3837620b599ff8280
base=/var/www/coastline-racing
url=https://bot.razdorhouse.ru/racing/
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run as root.'
for tool in python3 sha256sum curl mktemp readlink ln mv cmp; do command -v "$tool" >/dev/null || fail "Missing command: $tool"; done
[[ -f $archive ]] || fail "Release archive missing: $archive"
[[ -L $base/current ]] || fail "Expected the existing game symlink: $base/current"
actual_sha=$(sha256sum -- "$archive");actual_sha=${actual_sha%% *}
[[ $actual_sha == "$expected_sha" ]] || fail 'Release checksum mismatch. Existing game was not changed.'
previous=$(readlink -f -- "$base/current")
[[ $previous == "$base/releases/"* && -f $previous/index.html ]] || fail 'Unexpected current release; stopped before changing it.'
release=$(mktemp -d "$base/releases/night-v2.XXXXXX")
probe=$(mktemp /tmp/coastline-update-check.XXXXXX)
trap 'rm -f -- "$probe" "$probe.js" "$base/.night-current.$$"' EXIT
python3 - "$archive" "$release" <<'PY'
import os, sys, zipfile
from pathlib import Path
archive, target = sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    z.extractall(target)  # Exact trusted release was verified by SHA-256 before extraction.
for path, dirs, files in os.walk(target):
    os.chmod(path,0o755)
    for name in files: os.chmod(os.path.join(path,name),0o644)
if not (Path(target)/'vendor/telegram-web-app-8.0.2.js').is_file():
    sys.exit('Telegram bridge missing in the new release.')
PY
rollback(){
    status=$?
    trap - ERR
    ln -s -- "$previous" "$base/.night-current.$$"
    mv -Tf -- "$base/.night-current.$$" "$base/current"
    printf 'Update did not pass readiness; previous release restored: %s\n' "$previous" >&2
    exit "$status"
}
printf 'Previous release retained: %s\n' "$previous"
ln -s -- "$release" "$base/.night-current.$$"
mv -Tf -- "$base/.night-current.$$" "$base/current"
trap rollback ERR
curl --fail --silent --show-error --connect-timeout 5 --max-time 20 "$url" -o "$probe"
cmp -s "$probe" "$release/index.html"
asset=$(python3 - "$release/index.html" <<'PY'
import re, sys
html=open(sys.argv[1]).read()
match=re.search(r'src="\./(assets/[^\"]+\.js)"',html)
if not match: sys.exit('Production JavaScript not found.')
print(match.group(1))
PY
)
curl --fail --silent --show-error --connect-timeout 5 --max-time 20 "$url$asset" -o "$probe.js"
cmp -s "$probe.js" "$release/$asset"
curl --fail --silent --show-error --connect-timeout 5 --max-time 20 "${url}vendor/telegram-web-app-8.0.2.js" -o "$probe.js"
cmp -s "$probe.js" "$release/vendor/telegram-web-app-8.0.2.js"
trap - ERR
printf '\nREADY: %s?v=night2\nNight city, arcade handling and fullscreen bridge deployed.\n' "$url"
printf 'Close the Mini App completely and reopen it to load the new release.\n'
