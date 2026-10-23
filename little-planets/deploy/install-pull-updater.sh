#!/usr/bin/env bash
set -euo pipefail
umask 077

[ "$(id -u)" -eq 0 ] || { echo 'Запустите установщик от root.'; exit 1; }
LP_SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LP_NODE='/opt/little-planets-node/bin/node'
LP_UPDATER='/opt/little-planets-updater'
LP_STATE='/var/lib/little-planets-updater'
LP_UNITS='/etc/systemd/system'
LP_APP='/opt/little-planets'
for LP_TOOL in curl tar flock systemctl install; do
  command -v "$LP_TOOL" >/dev/null || { echo "Не найдена команда: $LP_TOOL"; exit 1; }
done
[ -x "$LP_NODE" ] || { echo "Не найден Node.js: $LP_NODE"; exit 1; }
[ -f "$LP_APP/.env" ] || { echo 'Не найдена существующая установка Little Planets.'; exit 1; }
"$LP_NODE" --input-type=module - "$LP_APP/.env" <<'NODE'
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
if(Number(process.versions.node.split('.')[0])<24)throw new Error('Required Node.js 24+');
const env=parseEnv(readFileSync(process.argv[2],'utf8'));
if(env.DATABASE_PATH!=='/var/lib/little-planets/planets.sqlite'||env.HOST!=='127.0.0.1'||env.PORT!=='8003'||!env.BOT_TOKEN)throw new Error('Existing Little Planets settings differ from the supported installation. No configuration was changed.');
NODE
systemctl is-active --quiet little-planets || { echo 'Сервис little-planets должен быть запущен.'; exit 1; }
for LP_FILE in pull-release.mjs little-planets-pull.service little-planets-pull.timer; do
  [ -f "$LP_SOURCE/$LP_FILE" ] && [ ! -L "$LP_SOURCE/$LP_FILE" ] || { echo "Не найден файл установщика: $LP_FILE"; exit 1; }
done
for LP_DIR in "$LP_UPDATER" "$LP_STATE"; do
  [ ! -L "$LP_DIR" ] || { echo "Недопустимый символьный путь: $LP_DIR"; exit 1; }
done
# Check network/channel before installing or enabling a background service. This does not update the game.
"$LP_NODE" "$LP_SOURCE/pull-release.mjs" --check
install -d -m 0755 -o root -g root "$LP_UPDATER"
install -d -m 0700 -o root -g root "$LP_STATE"
install -m 0644 -o root -g root "$LP_SOURCE/pull-release.mjs" "$LP_UPDATER/pull-release.mjs"
install -m 0644 -o root -g root "$LP_SOURCE/little-planets-pull.service" "$LP_UNITS/little-planets-pull.service"
install -m 0644 -o root -g root "$LP_SOURCE/little-planets-pull.timer" "$LP_UNITS/little-planets-pull.timer"
systemctl daemon-reload
systemctl enable --now little-planets-pull.timer
printf '%s\n' 'Автообновление включено. Первая проверка релиза запускается сейчас.'
if ! systemctl start little-planets-pull.service; then
  journalctl -u little-planets-pull.service -n 40 --no-pager
  exit 1
fi
journalctl -u little-planets-pull.service -n 25 --no-pager
systemctl --no-pager --full status little-planets
printf '%s\n' 'Следующие проверенные релизы будут загружаться автоматически. Пароль root не сохранялся. DNS, Caddy, street-racing и unit little-planets не изменялись.'
