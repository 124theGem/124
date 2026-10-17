# Размещение Little Planets

Это инструкция для отдельного приложения. Она не выполняет команд на действующем сервере. Используйте отдельную папку и базу; не заменяйте файлы гонок, бота или других сайтов.

## Подготовка

Нужны Node.js 24 LTS, npm, публичный HTTPS и токен вашего Telegram-бота. Токен хранится **только на сервере**, никогда в `VITE_*`, frontend, Git или чате.

Скопируйте эту папку в `/opt/little-planets`. Создайте отдельного системного пользователя, владельца этой папки и каталога данных. Из неё установите зависимости и соберите:

```bash
npm ci
npm run build
cp .env.example .env
chmod 600 .env
```

В `.env` задайте:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8003
DATABASE_PATH=/var/lib/little-planets/planets.sqlite
BOT_TOKEN=ВАШ_ТОКЕН_БОТА
```

Каталог `/var/lib/little-planets` должен существовать и быть доступен пользователю приложения на запись. Порт 8003 должен быть свободен; при необходимости выберите другой в `.env` и reverse_proxy ниже. Для проверки запустите `npm start` и запросите `curl -f http://127.0.0.1:8003/api/health`: ожидается `{"ok":true}`.

Для постоянного запуска создайте отдельный сервис `/etc/systemd/system/little-planets.service` (подставьте существующего отдельного пользователя и корректный путь npm):

```ini
[Unit]
Description=Little Planets Mini App
After=network.target

[Service]
Type=simple
User=little-planets
WorkingDirectory=/opt/little-planets
EnvironmentFile=/opt/little-planets/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/little-planets

[Install]
WantedBy=multi-user.target
```

SQLite-каталог и `.env` должны принадлежать пользователю сервиса. После проверки путей:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now little-planets
sudo systemctl status little-planets --no-pager
```

## HTTPS через существующий Caddy

Можно использовать отдельный маршрут на уже работающем домене `bot.razdorhouse.ru`, например `/planets/`. Добавьте эти обработчики **внутрь существующего блока домена**, сохранив его текущие маршруты и backend:

```caddyfile
redir /planets /planets/ 308

handle_path /planets/* {
    reverse_proxy 127.0.0.1:8003
}
```

Catch-all обработчик существующего бота должен оставаться после специальных `handle`-маршрутов. Не копируйте новый блок домена поверх действующего Caddyfile. Сначала сделайте резервную копию конфигурации, затем выполните `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`; перезагружайте сервис только при успешной проверке.

При такой схеме Caddy удаляет `/planets` перед передачей запроса приложению. Vite собирает относительные пути, поэтому HTML, SDK, assets и `/planets/api/...` работают на одном маршруте. DNS действующего домена менять не требуется.

Проверьте публичные адреса:

- `https://bot.razdorhouse.ru/planets/` — экран входа через Telegram для обычного браузера.
- `https://bot.razdorhouse.ru/planets/api/health` — `{"ok":true}`.
- `https://bot.razdorhouse.ru/planets/api/state` без авторизации — HTTP 401, это правильное поведение.

## BotFather пошагово

1. В Telegram откройте проверенный `@BotFather`.
2. `/mybots` → выберите бота → **Bot Settings** → **Menu Button** → **Configure menu button**. Альтернативный вход — `/setmenubutton`.
3. Введите адрес `https://bot.razdorhouse.ru/planets/`.
4. Введите подпись кнопки, например **Планеты**.
5. Откройте чат своего бота и нажмите новую кнопку меню.
6. Посадите растение, постройте дом, закройте Mini App и откройте снова. Прогресс должен восстановиться из SQLite.

Если у этого бота уже есть кнопка меню гонок, замена URL переключит её на Little Planets. Для двух отдельных игр используйте другого бота или отдельные Web App-кнопки в сообщениях вашего backend. Инструкция не меняет кнопку автоматически.

## Резервная копия и обновление

Не удаляйте `/var/lib/little-planets` при обновлении кода. Сохраняйте SQLite через Online Backup API (`DatabaseSync`/`sqlite3 .backup`) либо остановите только `little-planets` и скопируйте базу вместе с существующими `-wal` и `-shm`. Простое копирование одного открытого файла базы при WAL не гарантирует целостность.

Новая версия кода → `npm ci` → `npm run build` → перезапуск только `little-planets`. Для диагностики: `journalctl -u little-planets -n 80 --no-pager`. Не выводите `.env` в логи или чат.
