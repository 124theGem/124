#!/usr/bin/env bash
# Add the game to the existing bot HTTPS site. DNS is not changed.
set -Eeuo pipefail
config=/etc/caddy/Caddyfile
game=/var/www/coastline-racing/current
url=https://bot.razdorhouse.ru/racing/

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run this script as root.'
for tool in caddy systemctl python3 curl mktemp cp grep cmp; do
    command -v "$tool" >/dev/null || fail "Missing command: $tool"
done
[[ -f $game/index.html ]] || fail "Game files missing: $game/index.html"
systemctl is-active --quiet caddy || fail 'Caddy service is inactive.'

candidate=$(mktemp /etc/caddy/.coastline-bot.XXXXXX)
probe=$(mktemp /tmp/coastline-bot-check.XXXXXX)
trap 'rm -f -- "$candidate" "$probe" "$probe.js"' EXIT

python3 - "$config" "$candidate" <<'PY'
import re, sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
text = source.read_text()
original = r'(?m)^bot\.razdorhouse\.ru[ \t]*\{\s*reverse_proxy[ \t]+127\.0\.0\.1:8000[ \t]*\n\}'
replacement = '''bot.razdorhouse.ru {
    # COASTLINE racing route.
    redir /racing /racing/ 308

    handle_path /racing/* {
        root * /var/www/coastline-racing/current
        file_server
    }

    handle {
        reverse_proxy 127.0.0.1:8000
    }
}'''
if replacement not in text:
    text, count = re.subn(original, lambda _: replacement, text)
    if count != 1:
        sys.exit('The bot site differs from the supplied configuration. Stopped without changing Caddyfile; send the current bot site block for an exact update.')
# Remove only the import installed by our previous root-domain installer.
# The file is retained as a backup; the existing main website DNS is untouched.
text = '\n'.join(line for line in text.split('\n')
                 if line.strip() != 'import /etc/caddy/sites/coastline-racing.caddy')
target.write_text(text)
PY

# The candidate is beside Caddyfile so relative imports resolve in the same directory.
caddy validate --config "$candidate" --adapter caddyfile
if ! cmp -s "$candidate" "$config"; then
    backup=$(mktemp /etc/caddy/Caddyfile.before-coastline-bot.XXXXXX)
    cp -a -- "$config" "$backup"
    printf 'Configuration backup: %s\n' "$backup"
    rollback() {
        status=$?
        trap - ERR
        cp -a -- "$backup" "$config"
        systemctl reload caddy || printf 'Restored files; reload Caddy manually.\n' >&2
        printf 'Update failed; previous configuration restored: %s\n' "$backup" >&2
        exit "$status"
    }
    trap rollback ERR
    cp -- "$candidate" "$config"
    systemctl reload caddy
    trap - ERR
fi

printf '\nGame route configured. Checking %s\n' "$url"
if curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "$url" -o "$probe" &&
    grep -q '<title>Coastline' "$probe"; then
    asset=$(python3 - "$game/index.html" <<'PY'
import re, sys
html = open(sys.argv[1]).read()
match = re.search(r'src="\./(assets/[^\"]+\.js)"', html)
if not match:
    sys.exit('Cannot identify game JavaScript.')
print(match.group(1))
PY
)
    if curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
        "$url$asset" -o "$probe.js" && cmp -s "$probe.js" "$game/$asset"; then
        printf '\nREADY: %s\nHTML and game JavaScript verified over HTTPS.\n' "$url"
        exit 0
    fi
fi
printf '\nThe game route was saved, but public HTTPS readiness is not confirmed.\n' >&2
printf 'Send the output of this script and: journalctl -u caddy -n 30 --no-pager\n' >&2
exit 2
