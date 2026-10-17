#!/usr/bin/env bash
# Run on the destination server as root. The ZIP and this script may be uploaded together.
set -Eeuo pipefail

archive=${1:-"$(dirname -- "$0")/coastline-dist.zip"}
expected_sha=493a3c33b41fcc40a76ce1db4fc5d417abec7ebcfbd80c5f117ca9ae487645df
config=/etc/caddy/Caddyfile
site=/etc/caddy/sites/coastline-racing.caddy
base=/var/www/coastline-racing
import_line="import $site"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run as root: sudo bash deploy-coastline.sh /tmp/coastline-dist.zip'
for tool in caddy systemctl python3 sha256sum curl install mktemp cp grep ln mv cmp; do
    command -v "$tool" >/dev/null || fail "Required command missing: $tool"
done
[[ -f $archive ]] || fail "Archive not found: $archive"
[[ -f $config ]] || fail "Caddy configuration not found: $config"
actual_sha=$(sha256sum -- "$archive"); actual_sha=${actual_sha%% *}
[[ $actual_sha == "$expected_sha" ]] || fail 'Archive checksum mismatch; use the supplied coastline-dist.zip.'
systemctl is-active --quiet caddy || fail 'Caddy service is inactive. Inspect: systemctl status caddy --no-pager'
[[ ! -e $base/current || -L $base/current ]] || fail "$base/current already exists and is not a symlink. Nothing changed."
if [[ -e $site ]] && ! grep -Fq '# Managed by COASTLINE deployment.' "$site"; then
    fail "$site belongs to another configuration. Nothing changed."
fi

work=$(mktemp -d /tmp/coastline-deploy.XXXXXX)
trap 'rm -rf -- "$work"' EXIT
caddy adapt --config "$config" --adapter caddyfile > "$work/existing.json"
if ! grep -Fqx "$import_line" "$config"; then
    python3 - "$work/existing.json" <<'PY'
import json, sys
def owns_domain(value):
    if isinstance(value, dict):
        hosts = value.get('host', [])
        if isinstance(hosts, list) and 'razdorhouse.ru' in hosts:
            return True
        return any(owns_domain(v) for v in value.values())
    if isinstance(value, list):
        return any(owns_domain(v) for v in value)
    return False
if owns_domain(json.load(open(sys.argv[1]))):
    sys.exit('razdorhouse.ru is already configured. Stop: integrate /racing/ into that existing site first. Nothing changed.')
PY
fi

# Keep permanent backups. Only this site's files and the one import line are changed.
backup=$(mktemp -d /etc/caddy/coastline-backup.XXXXXX)
cp -a -- "$config" "$backup/Caddyfile"
if [[ -e $site ]]; then cp -a -- "$site" "$backup/site.caddy"; fi
if [[ -L $base/current ]]; then cp -a -- "$base/current" "$backup/current"; fi
printf 'Configuration backup: %s\n' "$backup"

rollback() {
    status=$?
    trap - ERR
    cp -a -- "$backup/Caddyfile" "$config"
    if [[ -e $backup/site.caddy ]]; then cp -a -- "$backup/site.caddy" "$site"; else rm -f -- "$site"; fi
    if [[ -L $backup/current ]]; then
        cp -a -- "$backup/current" "$base/.restore.$$"
        mv -Tf -- "$base/.restore.$$" "$base/current"
    elif [[ -L $base/current ]]; then rm -f -- "$base/current"; fi
    if [[ ${reload_attempted:-0} == 1 ]]; then systemctl reload caddy || printf 'Restored files; reload Caddy manually.\n' >&2; fi
    printf 'Deployment failed; previous configuration restored. Backup: %s\n' "$backup" >&2
    exit "$status"
}
trap rollback ERR

install -d -m 755 "$base" "$base/releases" /etc/caddy/sites
release=$(mktemp -d "$base/releases/release.XXXXXX")
python3 - "$archive" "$release" <<'PY'
import os, sys, zipfile
archive, target = sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    z.extractall(target)  # Archive integrity was checked against the release SHA-256 above.
for path, dirs, files in os.walk(target):
    os.chmod(path, 0o755)
    for name in files:
        os.chmod(os.path.join(path, name), 0o644)
PY
cat > "$work/site.caddy" <<'CADDY'
# Managed by COASTLINE deployment.
razdorhouse.ru {
    encode zstd gzip
    redir / /racing/ 302
    redir /racing /racing/ 308
    handle_path /racing/* {
        root * /var/www/coastline-racing/current
        file_server
    }
    handle {
        respond "Not Found" 404
    }
}
CADDY
install -m 644 "$work/site.caddy" "$site"
if ! grep -Fqx "$import_line" "$config"; then printf '\n%s\n' "$import_line" >> "$config"; fi
caddy validate --config "$config" --adapter caddyfile
ln -s -- "$release" "$base/.current.$$"
mv -Tf -- "$base/.current.$$" "$base/current"
reload_attempted=1
systemctl reload caddy
trap - ERR

printf '\nCaddy configuration loaded. Checking public HTTPS...\n'
for attempt in {1..10}; do
    if curl --fail --silent --show-error --connect-timeout 2 --max-time 4 \
        https://razdorhouse.ru/racing/ -o "$work/index.html" 2> "$work/curl-error" &&
        grep -q '<title>Coastline' "$work/index.html"; then
        asset=$(python3 - "$release/index.html" <<'PY'
import re, sys
html = open(sys.argv[1]).read()
match = re.search(r'src="\./(assets/[^\"]+\.js)"', html)
if not match:
    sys.exit('Cannot identify the production JavaScript asset.')
print(match.group(1))
PY
)
        if curl --fail --silent --show-error --connect-timeout 2 --max-time 8 \
            "https://razdorhouse.ru/racing/$asset" -o "$work/game.js" &&
            cmp -s "$work/game.js" "$release/$asset"; then
            printf '\nREADY: https://razdorhouse.ru/racing/\nHTML and game JavaScript verified over HTTPS.\n'
            exit 0
        fi
    fi
    sleep 2
done
printf '\nConfiguration saved, but public HTTPS readiness is not confirmed.\n' >&2
printf 'Check DNS A/AAAA for razdorhouse.ru, ports 80/443, and: journalctl -u caddy -n 50 --no-pager\n' >&2
printf 'Caddy obtains the HTTPS certificate automatically after the domain reaches this server.\n' >&2
exit 2
