#!/usr/bin/env python3
"""
sync_to_supabase.py — ManageBac の課題を Supabase の managebac_tasks へ同期する

GitHub Actions から数時間おきに実行することを想定。
成功時: managebac_tasks を upsert し、managebac_import_log に ok=true を記録(終了コード0)
失敗時: managebac_import_log に ok=false を記録し、終了コード1
       (アプリ側は「最終更新◯時間前」表示に使う)

環境変数(.env でも可):
  MB_BASE_URL, MB_EMAIL, MB_PASSWORD          … ManageBac認証情報(GitHub Secretsから注入)
  SUPABASE_URL                                 … https://YOUR-PROJECT.supabase.co
  SUPABASE_SERVICE_ROLE_KEY                    … サーバー側実行なのでサービスロールキー推奨
    または SUPABASE_ANON_KEY + SB_EMAIL + SB_PASSWORD (パスワードグラントでトークン取得)

使い方:
  python sync_to_supabase.py            # 同期を実行
  python sync_to_supabase.py --dry-run  # スクレイプ結果をJSON表示するだけ(Supabaseへは書かない)
  python sync_to_supabase.py --json     # 同期結果サマリをJSONで表示
"""
import argparse
import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import requests

from managebac_client import ManageBac, ManageBacError

VIEWS = ("upcoming", "overdue")


def load_env(path: Path):
    """python-dotenv 無しの簡易 .env ローダー。既存の環境変数は上書きしない。"""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def supabase_token() -> tuple[str, str]:
    """(apikey, bearer) を返す。サービスロールキー優先、なければパスワードグラント。"""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not url:
        raise ManageBacError("SUPABASE_URL が未設定です")

    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if service:
        return service, service

    anon = os.environ.get("SUPABASE_ANON_KEY")
    email = os.environ.get("SB_EMAIL")
    password = os.environ.get("SB_PASSWORD")
    if anon and email and password:
        r = requests.post(
            f"{url}/auth/v1/token?grant_type=password",
            headers={"apikey": anon, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=20,
        )
        r.raise_for_status()
        return anon, r.json()["access_token"]

    raise ManageBacError(
        "Supabase認証が未設定です。SUPABASE_SERVICE_ROLE_KEY か、"
        "SUPABASE_ANON_KEY+SB_EMAIL+SB_PASSWORD を設定してください"
    )


def collect_tasks(mb: ManageBac) -> list[dict]:
    """upcoming + overdue をマージし、task_id で重複排除する。"""
    seen: dict[str, dict] = {}
    for view in VIEWS:
        for t in mb.deadlines(view):
            tid = t.get("id")
            if not tid:
                continue
            # overdue 側の status を優先して記録したいので後勝ちだが、
            # submittable など欠けている場合はマージする
            if tid in seen:
                seen[tid] = {**seen[tid], **{k: v for k, v in t.items() if v not in (None, "")}, "_views": seen[tid].get("_views", []) + [view]}
            else:
                t["_views"] = [view]
                seen[tid] = t
    return sorted(seen.values(), key=lambda t: t.get("due_iso") or "9999")


def row_from_task(t: dict, fetched_at: str) -> dict:
    return {
        "task_id": t["id"],
        "class_id": t.get("class_id"),
        "class_name": t.get("class_name"),
        "title": t.get("title"),
        "kind": t.get("kind"),
        "status": t.get("status"),
        "submittable": bool(t.get("submittable")),
        "due": t.get("due"),
        "due_iso": t.get("due_iso"),
        "url": t.get("url"),
        "context": (t.get("context") or "")[:300] or None,
        "views": ",".join(t.get("_views", [])),
        "fetched_at": fetched_at,
    }


def log_import(url: str, apikey: str, bearer: str, ok: bool, error: str | None, count: int, started: str) -> None:
    """取り込み結果を managebac_import_log に記録する。失敗しても同期自体は継続。"""
    try:
        requests.post(
            f"{url}/rest/v1/managebac_import_log",
            headers={
                "apikey": apikey,
                "Authorization": f"Bearer {bearer}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json={
                "started_at": started,
                "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "ok": ok,
                "error": (error or "")[:1000] or None,
                "count": count,
            },
            timeout=20,
        )
    except Exception:
        pass  # ログ記録の失敗で全体を落とさない


def upsert_tasks(url: str, apikey: str, bearer: str, rows: list[dict]) -> None:
    if not rows:
        return
    r = requests.post(
        f"{url}/rest/v1/managebac_tasks",
        headers={
            "apikey": apikey,
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        params={"on_conflict": "task_id"},
        json=rows,
        timeout=30,
    )
    r.raise_for_status()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="スクレイプのみでSupabaseへ書かない")
    ap.add_argument("--json", action="store_true", help="結果サマリをJSONで出力")
    args = ap.parse_args()

    here = Path(__file__).resolve().parent
    load_env(here / ".env")
    load_env(here.parent / ".env")

    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    summary = {"started_at": started, "ok": False, "count": 0, "error": None}

    try:
        mb = ManageBac()
        mb.ensure_login()
        tasks = collect_tasks(mb)
        fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        rows = [row_from_task(t, fetched_at) for t in tasks]
        summary["count"] = len(rows)

        if args.dry_run:
            print(json.dumps({"ok": True, "count": len(rows), "tasks": rows},
                             ensure_ascii=False, indent=2))
            return 0

        url = os.environ["SUPABASE_URL"].rstrip("/")
        apikey, bearer = supabase_token()
        upsert_tasks(url, apikey, bearer, rows)
        log_import(url, apikey, bearer, True, None, len(rows), started)
        summary["ok"] = True
        if args.json:
            print(json.dumps(summary, ensure_ascii=False))
        else:
            print(f"[sync] ok: {len(rows)}件を managebac_tasks へ upsert しました ({fetched_at})")
        return 0

    except Exception as e:
        summary["error"] = f"{type(e).__name__}: {e}"
        traceback.print_exc(file=sys.stderr)
        # 失敗もログに残す(通知設計: 取り込み失敗を重要通知に載せるため)
        try:
            url = os.environ.get("SUPABASE_URL", "").rstrip("/")
            if url:
                apikey, bearer = supabase_token()
                log_import(url, apikey, bearer, False, summary["error"], 0, started)
        except Exception:
            pass
        if args.json:
            print(json.dumps(summary, ensure_ascii=False))
        else:
            print(f"[sync] FAILED: {summary['error']}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
