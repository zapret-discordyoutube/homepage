#!/bin/bash
# Выкладка главной git.zapret.moe из репозитория zapretdiscordyoutube/homepage.
# Ставится в LXC 102 как /usr/local/sbin/zapret-homepage-sync.sh, запускается
# таймером zapret-homepage-sync.timer раз в две минуты.
#
# Правила:
#  * Репозиторий — единственный источник правды. templates/ и public/ в
#    /var/lib/forgejo/custom зеркалируют ветку main целиком: файлы, которых нет
#    в git, удаляются. Правки прямо на сервере не живут дольше одной выкладки.
#    Исключение — PRESERVE: статистика, которую пишет zapret-homepage-stats.py.
#  * @ASSETS_VER@ в шаблонах заменяется хешем home.css, home.js и site.css,
#    поэтому браузеры получают новые CSS/JS сразу, несмотря на кеш статики Forgejo.
#  * Шаблоны Forgejo читает при старте: при их изменении сервис
#    перезапускается, после чего проверяется, что сайт отвечает. Если нет —
#    возвращается предыдущая версия, а сломанный коммит запоминается и больше
#    не выкладывается, пока в main не появится новый.

set -euo pipefail

# Переменные окружения нужны только для проверки скрипта вне сервера.
REPO_DIR=${REPO_DIR:-/var/lib/forgejo/homepage-src}
CUSTOM_DIR=${CUSTOM_DIR:-/var/lib/forgejo/custom}
STATE_DIR=${STATE_DIR:-/var/lib/forgejo/homepage-state}
BRANCH=${BRANCH:-main}
HEALTH_URL=${HEALTH_URL:-http://10.20.0.40:3000/}
RESTART_CMD=${RESTART_CMD:-systemctl restart forgejo}
OWNER=${OWNER:-git}
LOCK=${LOCK:-/run/zapret-homepage-sync.lock}
MANAGED="templates public"
# Генерируемое на сервере (не из git) — переживает выкладку.
PRESERVE="public/assets/zapret-moe-stats"
ASSET_FILES="public/assets/zapret-moe/home.css public/assets/zapret-moe/home.js public/assets/zapret-moe/site.css"

exec 9>"$LOCK"
flock -n 9 || exit 0

git_as_owner() {
    if [ "$(id -un)" = "$OWNER" ]; then
        git -C "$REPO_DIR" "$@"
    else
        runuser -u "$OWNER" -- git -C "$REPO_DIR" "$@"
    fi
}

mkdir -p "$STATE_DIR"
deployed=$(cat "$STATE_DIR/deployed" 2>/dev/null || true)
failed=$(cat "$STATE_DIR/failed" 2>/dev/null || true)

git_as_owner fetch --quiet origin "$BRANCH"
rev=$(git_as_owner rev-parse "origin/$BRANCH")

if [ "$rev" = "$deployed" ] && [ "${1:-}" != "--force" ]; then
    exit 0
fi
if [ "$rev" = "$failed" ]; then
    exit 0
fi
# Ночной бэкап останавливает Forgejo; перезапускать его посреди pg_dump нельзя.
# Через две минуты таймер попробует снова.
if [ "$RESTART_CMD" = "systemctl restart forgejo" ] && ! systemctl is-active --quiet forgejo; then
    exit 0
fi

stage=$(mktemp -d "$CUSTOM_DIR/.stage.XXXXXX")
backup="$CUSTOM_DIR/.previous"
trap 'rm -rf "$stage"' EXIT

git_as_owner archive "$rev" $MANAGED | tar -x -C "$stage"
# Версия — хеш только CSS и JS: замена картинки или robots.txt не трогает
# шаблоны и не перезапускает Forgejo.
assets_ver=$(git_as_owner ls-tree "$rev" -- $ASSET_FILES | sha1sum | cut -c1-12)
find "$stage/templates" -type f -name '*.tmpl' -exec sed -i "s/@ASSETS_VER@/$assets_ver/g" {} +
[ "$(id -un)" = "$OWNER" ] || chown -R "$OWNER:$OWNER" "$stage"

templates_changed=0
diff -rq "$stage/templates" "$CUSTOM_DIR/templates" >/dev/null 2>&1 || templates_changed=1

# Атомарная подмена каталогов: старое уходит в .previous для отката.
rm -rf "$backup"
mkdir -p "$backup"
for dir in $MANAGED; do
    [ -e "$CUSTOM_DIR/$dir" ] && mv "$CUSTOM_DIR/$dir" "$backup/$dir"
    mv "$stage/$dir" "$CUSTOM_DIR/$dir"
done
keep_generated() {  # $1 — откуда, $2 — куда
    for p in $PRESERVE; do
        if [ -e "$1/$p" ] && [ ! -e "$2/$p" ]; then
            mkdir -p "$(dirname "$2/$p")"
            mv "$1/$p" "$2/$p"
        fi
    done
}
keep_generated "$backup" "$CUSTOM_DIR"

echo "homepage-sync: ${deployed:0:8} -> ${rev:0:8} (assets $assets_ver, templates_changed=$templates_changed)"

# Главная и регистрация (у неё свой шаблон) должны отвечать 200.
healthy() {
    for _ in $(seq 1 30); do
        home=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)
        signup=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${HEALTH_URL}user/sign_up" || true)
        [ "$home" = "200" ] && [ "$signup" = "200" ] && return 0
        sleep 2
    done
    return 1
}

if [ "$templates_changed" = 1 ]; then
    $RESTART_CMD
    if ! healthy; then
        echo "homepage-sync: после выкладки ${rev:0:8} сайт не отвечает, откат" >&2
        keep_generated "$CUSTOM_DIR" "$backup"
        for dir in $MANAGED; do
            rm -rf "$CUSTOM_DIR/$dir"
            [ -e "$backup/$dir" ] && mv "$backup/$dir" "$CUSTOM_DIR/$dir"
        done
        $RESTART_CMD
        echo "$rev" > "$STATE_DIR/failed"
        exit 1
    fi
fi

echo "$rev" > "$STATE_DIR/deployed"
rm -f "$STATE_DIR/failed"
