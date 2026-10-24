#!/usr/bin/env bash
# Run in the user's Ubuntu terminal, never as root and never on the game VPS.
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then
  echo 'Запусти установку под обычным пользователем Ubuntu, не root.' >&2; exit 1
fi
if uname -r | grep -qi microsoft && ! uname -r | grep -qi wsl2; then
  echo 'Нужен WSL2. В PowerShell: wsl --set-version Ubuntu 2. Затем снова открой Ubuntu.' >&2; exit 1
fi
app_root="$HOME/.local/share/home-codex"
project_root="$HOME/home-codex-projects/124"
mkdir -p "$app_root"
chmod 700 "$app_root"
install_work="$(mktemp -d)"
trap 'rm -rf -- "$install_work"' EXIT
# Bootstrap only an explicitly selected local machine; no server configuration.
sudo apt-get update
sudo apt-get install -y ca-certificates curl git python3 xz-utils util-linux build-essential
# GitHub CLI is in newer Ubuntu archives; older installations use its official signed repository.
if ! command -v gh >/dev/null 2>&1; then
  if ! apt-cache show gh >/dev/null 2>&1; then
    sudo mkdir -p -m 755 /etc/apt/keyrings
    curl -fLSs --proto '=https' --tlsv1.2 https://cli.github.com/packages/githubcli-archive-keyring.gpg -o "$install_work/githubcli.gpg"
    sudo install -m 644 "$install_work/githubcli.gpg" /etc/apt/keyrings/home-codex-githubcli.gpg
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/home-codex-githubcli.gpg] https://cli.github.com/packages stable main\n' "$(dpkg --print-architecture)" | sudo tee /etc/apt/sources.list.d/home-codex-githubcli.list >/dev/null
    sudo apt-get update
  fi
  sudo apt-get install -y gh
fi
case "$(uname -m)" in x86_64) node_arch=x64 ;; aarch64|arm64) node_arch=arm64 ;; *) echo 'Неизвестная архитектура.' >&2; exit 1 ;; esac
curl -fLSs --proto '=https' --tlsv1.2 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -o "$install_work/SHASUMS256.txt"
node_archive="$(awk -v arch="$node_arch" '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2;exit}' "$install_work/SHASUMS256.txt")"
if [ -z "$node_archive" ]; then echo 'Не найден официальный Node 24 для этой архитектуры.' >&2; exit 1; fi
curl -fLSs --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$install_work/$node_archive"
(cd "$install_work"; awk -v file="$node_archive" '$2 == file' SHASUMS256.txt | sha256sum -c -)
node_folder="${node_archive%.tar.xz}"
if [ ! -d "$app_root/$node_folder" ]; then
  tar -xJf "$install_work/$node_archive" -C "$app_root"
fi
ln -sfn "$app_root/$node_folder" "$app_root/node"
export PATH="$app_root/node/bin:$app_root/tools/bin:$PATH"
node --version
npm install --global --prefix "$app_root/tools" --cache "$app_root/npm-cache" --no-audit --no-fund '@openai/codex@0.164.0'
codex exec --help | grep -q -- '--approve-for-me' || { echo 'Codex не поддерживает нужный режим согласования.' >&2; exit 1; }
# A separate checkout keeps any existing PC workspace intact.
if [ ! -e "$app_root/source" ]; then
  git clone --depth 1 --single-branch --branch home-codex https://github.com/124theGem/124.git "$app_root/source"
else
  echo 'Код установщика уже существует: сохраняю без сброса локальных изменений.'
fi
mkdir -p "$(dirname "$project_root")"
if [ ! -e "$project_root" ]; then
  git clone --depth 1 --single-branch --branch little-planets-mvp https://github.com/124theGem/124.git "$project_root"
  git -C "$project_root" switch -c home-pc
else
  echo 'Рабочий проект уже существует: сохраняю файлы и текущую ветку.'
fi
if ! git -C "$project_root" check-ignore -q little-planets/.home-codex/; then
  printf '\n/little-planets/.home-codex/\n' >> "$project_root/.git/info/exclude"
fi
cat > "$app_root/run.sh" <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail
exec bash "$HOME/.local/share/home-codex/source/home-codex/start.sh"
RUNNER
chmod 700 "$app_root/run.sh"
cat > "$app_root/setup.sh" <<'SETUP'
#!/usr/bin/env bash
set -euo pipefail
exec bash "$HOME/.local/share/home-codex/source/home-codex/configure.sh"
SETUP
chmod 700 "$app_root/setup.sh"
# No login tokens are requested by this installer or written into the repository.
cat <<'NEXT'

Базовая установка готова. Теперь в ЭТОМ окне Ubuntu:

export PATH="$HOME/.local/share/home-codex/node/bin:$HOME/.local/share/home-codex/tools/bin:$PATH"
codex login

gh auth login
# Выбери GitHub.com → HTTPS → вход через браузер. Затем:
gh auth setup-git

# Укажи имя и email автора коммитов, если ещё не настроены:
git -C "$HOME/home-codex-projects/124" config user.name "Your Name"
git -C "$HOME/home-codex-projects/124" config user.email "YOUR_GITHUB_EMAIL"

# Создай НОВОГО отдельного бота в @BotFather и настрой подключение:
bash "$HOME/.local/share/home-codex/setup.sh"
# Папка проекта: /home/ИМЯ_ПОЛЬЗОВАТЕЛЯ/home-codex-projects/124/little-planets
# Узнать свой полный путь: echo "$HOME/home-codex-projects/124/little-planets"
# После настройки запусти:
bash "$HOME/.local/share/home-codex/run.sh"

Секреты вводятся только локально, не присылай их в чат.
NEXT
