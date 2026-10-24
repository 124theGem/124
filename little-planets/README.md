# RIFT RAID · 0.18.1

Telegram Mini App: кооперативные трёхминутные рейды за добычей. Управление одним джойстиком, автоматический огонь, эвакуация, постоянный арсенал и отряды до трёх настоящих игроков.

[Игра, управление, экономика, Stars и поставка](RIFT-RAID.md) · [Скриншоты](docs/screenshots/rift-raid) · [Происхождение графики](ASSETS.md)

```bash
cd little-planets
npm ci
npm run dev
```

Нужен Node 24+. В разработке без Telegram работает одиночный локальный профиль. Production проверяет подпись Telegram, считает бой на сервере и хранит прогресс в SQLite. Переменные — в `.env.example`; бот-токен не попадает в браузер. Реальные покупки Stars закрыты до отдельной настройки и проверки webhook.

```bash
npm run build
npm test
npm run test:raid-browser
npm run package:server
```

Серверный архив использует прежнее имя `little-planets-server-v0181.tar.gz`, порт 8003 и существующий механизм обновления. Источник новой игры — `rift-raid-mvp`; опубликованный канал — `little-planets-mvp`.

Little Planets/NEXUS сохранена в `archive/little-planets-nexus-0.17`, документация — [LEGACY-LITTLE-PLANETS.md](LEGACY-LITTLE-PLANETS.md). Старые сохранения не сбрасываются, street-racing и настройки работающего сервера не изменяются.

Обновление 0.18.1: немедленная реакция на управление, плавная отрисовка противников и пуль между сетевыми пакетами. Проверка с задержкой: `npm run test:raid-motion-browser`.
