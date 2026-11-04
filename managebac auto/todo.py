#!/usr/bin/env python3
"""
todo.py — ManageBacから「今やること」を一覧表示する

使い方:
  python todo.py            # 要提出(overdue含む)+ 今後の予定を、期限順に表示
  python todo.py --json     # JSONで出力
  python todo.py --days 7   # 今後7日以内の予定だけ(要提出は常に全件)
"""
import argparse
import json
from datetime import datetime

from managebac_client import ManageBac


def days_left(due_iso: str | None):
    
    if not due_iso:
        return None
    delta = datetime.fromisoformat(due_iso) - datetime.now()
    return delta.total_seconds() / 86400


def short_class(name: str | None) -> str:
    if not name:
        return "?"
    name = name.replace(" (DP1)", "").replace(" (DP2)", "")
    return name[:22]


def collect(days: int | None = None) -> dict:
    mb = ManageBac()
    upcoming = mb.deadlines("upcoming")
    overdue = mb.deadlines("overdue")

    # 要提出: overdue全件 + upcomingのうち提出ボタンがあるもの
    must_submit = overdue + [t for t in upcoming if t["submittable"]]
    # 予定: 提出不要の今後のタスク(テスト・口頭など)
    schedule = [t for t in upcoming if not t["submittable"]]
    if days is not None:
        schedule = [t for t in schedule
                    if (d := days_left(t["due_iso"])) is not None and d <= days]

    key = lambda t: t["due_iso"] or "9999"
    return {
        "must_submit": sorted(must_submit, key=key),
        "schedule": sorted(schedule, key=key),
    }


def fmt(t: dict) -> str:
    d = days_left(t["due_iso"])
    if d is None:
        rel = "  ?  "
    elif d < 0:
        rel = f"{-d:4.0f}日超過"
    else:
        rel = f"あと{d:4.1f}日"
    return (f"{rel:>9} | {t['due'] or '?':<17} | {short_class(t['class_name']):<22} | "
            f"{t['kind'] or '-':<9} | {t['title']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--days", type=int, default=None)
    args = ap.parse_args()

    data = collect(args.days)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return

    print(f"\n■ 要提出({len(data['must_submit'])}件)  ※期限超過を含む")
    for t in data["must_submit"]:
        print("  " + fmt(t))
    print(f"\n■ 今後の予定・提出不要({len(data['schedule'])}件)")
    for t in data["schedule"]:
        print("  " + fmt(t))
    print()


if __name__ == "__main__":
    main()