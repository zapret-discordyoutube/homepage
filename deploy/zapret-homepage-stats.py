#!/usr/bin/env python3
"""Статистика для «Пульса» на главной git.zapret.moe.

Ставится в LXC 102 как /usr/local/sbin/zapret-homepage-stats.py и запускается
таймером zapret-homepage-stats.timer. Пишет один JSON, который главная читает
вместо того, чтобы каждый посетитель дёргал API.

Что считается:
  * коммиты — прямо из git-репозиториев трёх организаций (зеркала пропускаются).
    В форках с чужой историей (Telegram, MTProxy) учитываются только коммиты
    наших авторов — тех, кто коммитил в наши собственные репозитории.
    Боты не считаются;
  * релизы и скачивания — из базы Forgejo, только публичные репозитории.

Названия закрытых репозиториев в JSON не попадают: их активность входит в
общую группу.
"""

import json
import os
import subprocess
import tempfile
import time
from collections import defaultdict

ROOT = "/var/lib/forgejo/data/forgejo-repositories"
OUT = os.environ.get("ZPM_STATS_OUT", "/var/lib/forgejo/custom/public/assets/zapret-moe-stats/stats.json")
ORGS = ("zapretdiscordyoutube", "zapretkvn", "zastogram")
# репозитории, где лежит чужая история апстрима
FORKS = {"zastogram/zastogram", "zastogram/zastogram_desktop", "zastogram/lib_ui",
         "zastogram/lib_lottie", "zapretkvn/vpnbot-mtproxy"}
# группы для графика: ключ, подпись, репозитории
GROUPS = [
    ("gui", "Zapret 2 GUI", {"zapretdiscordyoutube/zapretgui"}),
    ("zsg", "ZaStoGram", {"zastogram/zastogram", "zastogram/zastogram_desktop",
                          "zastogram/lib_ui", "zastogram/lib_lottie"}),
    ("kvn", "Zapret KVN", {"zapretkvn/zapret-kvn", "zapretkvn/zapretkvn-android"}),
    ("magisk", "Magisk Zapret 2", {"zapretdiscordyoutube/magisk-zapret2"}),
    ("vpn", "VPN-бот и сервера", None),  # все репозитории zapretkvn, кроме KVN и yourvpndead
    ("other", "Остальное", None),
]
WEEKS = 52
DAY = 86400
ENV = dict(os.environ, LC_ALL="C")


def psql(query):
    out = subprocess.run(
        ["runuser", "-u", "postgres", "--", "psql", "-d", "forgejodb", "-AtF", "\t", "-c", query],
        check=True, capture_output=True, text=True, env=ENV).stdout
    return [line.split("\t") for line in out.splitlines() if line]


def git_log(path):
    out = subprocess.run(
        ["runuser", "-u", "git", "--", "git", "-C", path, "log", "--all", "--format=%H\t%at\t%ae"],
        capture_output=True, text=True, env=ENV).stdout
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            yield parts[0], int(parts[1]), parts[2].lower()


def group_of(full):
    for key, _, repos in GROUPS:
        if repos and full in repos:
            return key
    if full.startswith("zapretkvn/") and full != "zapretkvn/yourvpndead":
        return "vpn"
    return "other"


def main():
    orgs_sql = ",".join("'%s'" % o for o in ORGS)
    repos = psql(
        'select lower(u.name), r.lower_name, r.is_private, r.is_mirror, r.num_stars, r.id '
        'from repository r join "user" u on u.id = r.owner_id '
        'where lower(u.name) in (%s)' % orgs_sql)
    # «Наши» авторы — те, кто коммитил в наши собственные (не форкнутые)
    # репозитории. Список зарегистрированных пользователей не подходит: при
    # миграции с GitHub в нём оказались и авторы апстрима Telegram.
    logs = {}
    ours = set()
    for owner, name, private, mirror, *_ in repos:
        if mirror == "t":
            continue
        full = "%s/%s" % (owner, name)
        path = os.path.join(ROOT, owner, name + ".git")
        if not os.path.isdir(path):
            continue
        logs[full] = list(git_log(path))
        if full not in FORKS:
            ours.update(email for _, _, email in logs[full])
    ours = {e for e in ours if "[bot]" not in e}

    now = int(time.time())
    # недели начинаются с понедельника 00:00 UTC; последняя — текущая
    monday = now - (now - 4 * DAY) % (7 * DAY)
    week0 = monday - (WEEKS - 1) * 7 * DAY
    series = {key: [0] * WEEKS for key, _, _ in GROUPS}
    seen = set()
    total_all = 0
    days_year = set()
    authors_year = set()
    c7 = c30 = c365 = 0
    for full, commits in logs.items():
        grp = group_of(full)
        for sha, ts, email in commits:
            if sha in seen or "[bot]" in email:
                continue
            if full in FORKS and email not in ours:
                continue
            seen.add(sha)
            total_all += 1
            age = now - ts
            if age < 7 * DAY:
                c7 += 1
            if age < 30 * DAY:
                c30 += 1
            if age < 365 * DAY:
                c365 += 1
                days_year.add(ts // DAY)
                authors_year.add(email)
            if ts >= week0:
                series[grp][min(WEEKS - 1, (ts - week0) // (7 * DAY))] += 1

    totals_by_week = [sum(series[k][i] for k in series) for i in range(WEEKS)]
    best = max(range(WEEKS), key=lambda i: totals_by_week[i])
    # самая длинная серия дней подряд с коммитами за год
    streak = run = 0
    prev = None
    for d in sorted(days_year):
        run = run + 1 if prev is not None and d == prev + 1 else 1
        streak = max(streak, run)
        prev = d

    public_ids = [row[5] for row in repos if row[2] == "f" and row[3] == "f"]
    ids_sql = ",".join(public_ids) or "0"
    releases = int(psql("select count(*) from release where repo_id in (%s) and not is_draft and not is_tag" % ids_sql)[0][0])
    downloads = int(psql("select coalesce(sum(a.download_count), 0) from attachment a join release r on r.id = a.release_id "
                         "where r.repo_id in (%s) and not r.is_draft" % ids_sql)[0][0])
    stars = sum(int(row[4]) for row in repos if row[2] == "f")

    data = {
        "generated": now,
        "week0": week0,
        "labels": {key: label for key, label, _ in GROUPS},
        "order": [key for key, _, _ in GROUPS],
        "series": series,
        "totals": {
            "commits_all": total_all,
            "commits_year": c365,
            "commits_30d": c30,
            "commits_7d": c7,
            "active_days_year": len(days_year),
            "streak_days": streak,
            "authors_year": len(authors_year),
            "best_week": {"start": week0 + best * 7 * DAY, "count": totals_by_week[best]},
            "releases": releases,
            "downloads": downloads,
            "repos_public": len(public_ids),
            "stars": stars,
        },
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(OUT), prefix=".stats.")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, OUT)
    subprocess.run(["chown", "-R", "git:git", os.path.dirname(OUT)], check=False)


if __name__ == "__main__":
    main()
