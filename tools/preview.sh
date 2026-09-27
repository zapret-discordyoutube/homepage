#!/bin/bash
# Локальный предпросмотр главной в настоящем Forgejo той же версии, что на сервере.
# Шаблоны рендерятся по-настоящему, поэтому ошибка в home.tmpl видна здесь,
# а не на git.zapret.moe.
#
#   tools/preview.sh            # http://127.0.0.1:3999/
#   PORT=4000 tools/preview.sh
#
# Картинки проектов и «Пульс разработки» берутся с репозиториев на сервере,
# поэтому в предпросмотре на месте обложек будут пустые места — это нормально.

set -euo pipefail

VERSION=${FORGEJO_VERSION:-16.0.2}
PORT=${PORT:-3999}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$ROOT/.preview}
BIN=$WORK/forgejo-$VERSION

mkdir -p "$WORK/data" "$WORK/log"
if [ ! -x "$BIN" ]; then
    arch=$(uname -m); case "$arch" in x86_64) arch=amd64 ;; aarch64) arch=arm64 ;; esac
    echo "Скачиваю Forgejo $VERSION ($arch)…"
    curl -fL -o "$BIN" "https://codeberg.org/forgejo/forgejo/releases/download/v$VERSION/forgejo-$VERSION-linux-$arch"
    chmod +x "$BIN"
fi

cat > "$WORK/app.ini" <<INI
APP_NAME = preview
RUN_MODE = dev
WORK_PATH = $WORK
[database]
DB_TYPE = sqlite3
PATH = $WORK/data/forgejo.db
[server]
HTTP_ADDR = 127.0.0.1
HTTP_PORT = $PORT
ROOT_URL = http://127.0.0.1:$PORT/
DISABLE_SSH = true
APP_DATA_PATH = $WORK/data
OFFLINE_MODE = true
[security]
INSTALL_LOCK = true
SECRET_KEY = local-preview-only-local-preview-only
[log]
ROOT_PATH = $WORK/log
LEVEL = Warn
[repository]
ROOT = $WORK/data/repos
INI

# custom/ Forgejo — это корень репозитория: templates/ и public/ лежат там же.
ln -sfn "$ROOT" "$WORK/custom"
"$BIN" --config "$WORK/app.ini" --work-path "$WORK" migrate >/dev/null
echo "Открывайте http://127.0.0.1:$PORT/ — RUN_MODE=dev, шаблоны перечитываются без перезапуска."
exec "$BIN" web --config "$WORK/app.ini" --work-path "$WORK"
