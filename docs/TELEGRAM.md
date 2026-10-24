# Запуск через @LittlePlanets_bot

Бот: https://t.me/LittlePlanets_bot

Адрес Mini App: https://bot.razdorhouse.ru/planets/

## Опубликованный выпуск

24 октября 2026 года опубликован серверный пакет размещения **0.20.0**, выпуск канала **23**. Он содержит RAID & SIEGE и прежние игры. Токен существующего бота остаётся на VPS; в frontend и этот репозиторий он не переносился.

- Самостоятельные исходники: ветка `raid-and-siege`, начальный коммит `94f9038`.
- Проверенный пакет: `a2cb8c65fe158c8be93f4d7d3836d1c97a2d6360` в ветке `little-planets-mvp`.
- Продвижение канала: `a3c57b7213330d9a28e50a9199b70c066240c388`.
- Архив: `little-planets/releases/little-planets-server-v0200.tar.gz`.
- SHA-256: `dd9f06911529ac3aedab2a9467115d8661cbbb11a8da46fb72e58650bcfc49e4`.

Канал использует прежний серверный updater: проверка примерно раз в две минуты, проверка SHA-256, резервная копия приложения/SQLite и откат при неудаче. DNS, Caddy, серверный API, общая модель данных и .env не менялись. Новая игра хранит профиль локально под отдельным ключом `raid-siege.profile.v1`.

До публикации прошли 175 тестов прежнего приложения, 86 тестов новой игры, общая production-сборка, проверки upgrader/pull-deployment и интеграционный браузерный запуск под реальным эквивалентом Caddy-префикса `/planets/`. С имитацией Telegram 8.0 проверены SDK ready, viewport, жесты, запрос fullscreen и начало боя. Физические Telegram-клиенты и FPS на телефонах этим не проверены.

## Открытие

Откройте бота и нажмите существующую кнопку запуска приложения. После обновления полностью закройте и снова откройте Mini App. На главном экране должны быть RAID & SIEGE, три режима и выбор из 15 классов.

Если кнопка бота содержит старый параметр `?mode=raid` или `?mode=colony`, он намеренно сохраняет прежнюю игру. Для новой игры URL кнопки должен быть ровно `https://bot.razdorhouse.ru/planets/`. При необходимости владелец меняет его в @BotFather: `/mybots` → @LittlePlanets_bot → Bot Settings → Menu Button → Configure menu button. Новый токен для этого не нужен.

Прежние игры сохранены через `?mode=emberfall`, `?mode=raid`, `?mode=colony`; Telegram query/hash передаются на сохранённый `legacy.html`.

## Если VPS не обновился

Из уже существующего SSH-доступа проверить `journalctl -u little-planets-pull.service -n 40 --no-pager` и `systemctl list-timers little-planets-pull.timer`. Не удалять .env, SQLite или предыдущие резервные копии. Публикация канала сама по себе не доказывает применение на VPS.
