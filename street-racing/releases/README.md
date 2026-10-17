# Готовые пакеты для сервера

**Текущий выпуск: Night City v2.** `coastline-night-v2.zip` содержит ночной город, аркадную физику и Telegram bridge для полного экрана. Для уже установленной игры используйте [update-game.sh](../deploy/update-game.sh); он сохраняет прежний выпуск для отката.

Ниже — история первоначальной установки.

Актуальная схема размещения — `https://bot.razdorhouse.ru/racing/`. На сервере владельца первоначальный пакет уже установлен; следующий шаг — [добавление маршрута к существующему домену бота](../deploy/README.md). Приведённые ниже команды описывают историческую первоначальную установку на корневой домен.

`coastline-server.tar.gz` содержит production-сборку `coastline-dist.zip` и установщик `deploy-coastline.sh` для Caddy на `razdorhouse.ru`.

Откройте файл архива в GitHub и нажмите **Download raw file**, чтобы скачать его. При закрытом репозитории войдите в GitHub под аккаунтом с доступом.

Загрузите скачанный архив на сервер с компьютера:

```bash
scp coastline-server.tar.gz root@IP_СЕРВЕРА:/tmp/
```

Замените `IP_СЕРВЕРА` тем адресом, который используете для SSH. В SSH-терминале сервера выполните:

```bash
mkdir -p /tmp/coastline-upload
tar -xzf /tmp/coastline-server.tar.gz -C /tmp/coastline-upload
bash /tmp/coastline-upload/deploy-coastline.sh
```

Успех подтверждается строкой `READY: https://razdorhouse.ru/racing/`. Детали, требования и границы локальной проверки — в [инструкции размещения](../deploy/README.md).

Сборка проверена локально. Публикация этой ветки в GitHub не устанавливает игру на пользовательский сервер и не подтверждает готовность публичного HTTPS.
