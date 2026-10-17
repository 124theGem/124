# Превью приложения «Простор» на Ubuntu

Готовая сборка приложения: `prostor-server.zip`. Node.js не требуется.

## Установка на сервере

Скачайте архив из этой ветки GitHub и передайте его в `/root/prostor-server.zip`.
При публичном доступе к репозиторию можно скачать прямо на сервер:

```bash
curl --fail --location --output /root/prostor-server.zip https://raw.githubusercontent.com/124theGem/124/prostor-server-20261017/prostor-server.zip
```

Проверка целостности перед запуском:

```bash
printf '%s  %s\n' '17dd82e77af2581c78a839d9e071650447bafa4718cfdf9389c44866b6787391' '/root/prostor-server.zip' | sha256sum --check
```

После успешной проверки:

```bash
prostor_unpack=$(mktemp -d /tmp/prostor.XXXXXX)
python3 -m zipfile -e /root/prostor-server.zip "$prostor_unpack"
bash "$prostor_unpack/start.sh"
```

Сервер слушает только 127.0.0.1:18080. Проверяется HTML страницы, журнал хранится в `/root/prostor-preview/server.log`. Существующие сторонние файлы защищены от перезаписи. Повторный запуск обновляет сборку.

## Открыть на своём компьютере

В отдельном локальном терминале выполните и оставьте работающим:

```bash
ssh -N -o ExitOnForwardFailure=yes -L 18080:127.0.0.1:18080 root@201.34.135.216
```

Откройте в браузере своего компьютера `http://127.0.0.1:18080`. Это локальный вход в SSH-туннель к вашему серверу.

Планировки сохраняются в браузере этого компьютера. Для резервной копии используйте экспорт JSON. Прямой публичный HTTP по IP не поддерживается: необходим HTTPS либо этот SSH-туннель.

Остановка на сервере:

```bash
bash /root/prostor-preview/stop.sh
```

Автозапуск после перезагрузки сервера не настраивается. Скрипт не меняет Nginx, firewall и системные службы.
