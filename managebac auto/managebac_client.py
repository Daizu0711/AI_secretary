#!/usr/bin/env python3
"""
managebac_client.py — ManageBac 非公式クライアント(自分のアカウント用)

依存: pip install requests beautifulsoup4 lxml fastapi uvicorn
環境変数: MB_BASE_URL (例 https://nihs.managebac.com)
          MB_EMAIL, MB_PASSWORD

使い方:
  python managebac_client.py login
  python managebac_client.py classes
  python managebac_client.py deadlines [upcoming|past|overdue]
  python managebac_client.py tasks <class_id>
  python managebac_client.py dump /student/tasks_and_deadlines?view=upcoming
  python managebac_client.py serve        # http://127.0.0.1:8000/docs
"""
import json
import os
import pickle
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = os.environ.get("MB_BASE_URL", "").rstrip("/")
SESSION_FILE = Path.home() / ".managebac_session.pkl"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
MIN_INTERVAL = 1.0  # 秒。アカウントロック/BAN回避のため叩きすぎない

TASK_HREF = re.compile(r"/student/classes/(\d+)/core_tasks/(\d+)")
# 形式A(Tasks & Deadlines): "Oct 30, 12:50 PM"
DATE_A = re.compile(r"([A-Z][a-z]{2}) (\d{1,2}), (\d{1,2}:\d{2} [AP]M)")
# 形式B(クラスページ): 先頭が "Oct 28" で、後ろに "Wednesday at 11:55 PM"
DATE_B_DAY = re.compile(r"^([A-Z][a-z]{2}) (\d{1,2})\b")
DATE_B_TIME = re.compile(r"\bat (\d{1,2}:\d{2} [AP]M)")
STATUS_RE = re.compile(
    r"(Not Assessed Yet|Submitted|Incomplete|Complete|Late|Pending|Missing|Overdue|Excused)")
KIND_RE = re.compile(r"\b(Summative|Formative)\b")


class ManageBacError(Exception):
    pass


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _to_iso(month: str, day: str, time_s: str) -> str | None:
    """ページには年が無いので、現在日付に最も近い年を採用する。"""
    now = datetime.now()
    best = None
    for y in (now.year - 1, now.year, now.year + 1):
        try:
            dt = datetime.strptime(f"{y} {month} {day} {time_s}", "%Y %b %d %I:%M %p")
        except ValueError:
            return None
        if best is None or abs((dt - now).total_seconds()) < abs((best - now).total_seconds()):
            best = dt
    return best.isoformat(timespec="minutes") if best else None


def _parse_due(ctx: str):
    """(表示用の原文, ISO) を返す。取れなければ (None, None)。"""
    m = DATE_A.search(ctx)
    if m:
        return f"{m.group(1)} {m.group(2)}, {m.group(3)}", _to_iso(*m.groups())
    d = DATE_B_DAY.search(ctx)
    t = DATE_B_TIME.search(ctx)
    if d and t:
        return f"{d.group(1)} {d.group(2)}, {t.group(1)}", _to_iso(d.group(1), d.group(2), t.group(1))
    return None, None


class ManageBac:
    def __init__(self, base_url: str = BASE_URL):
        if not base_url:
            raise ManageBacError("MB_BASE_URL が未設定です")
        self.base = base_url.rstrip("/")
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "en,ja;q=0.8"})
        self._last = 0.0
        self._class_names: dict[str, str] | None = None
        self._load_session()

    # ---------- session ----------
    def _load_session(self):
        if SESSION_FILE.exists():
            try:
                self.s.cookies.update(pickle.loads(SESSION_FILE.read_bytes()))
            except Exception:
                pass

    def _save_session(self):
        SESSION_FILE.write_bytes(pickle.dumps(self.s.cookies))
        SESSION_FILE.chmod(0o600)

    def _throttle(self):
        wait = MIN_INTERVAL - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.time()

    def _get(self, path: str, **kw) -> requests.Response:
        self._throttle()
        url = path if path.startswith("http") else urljoin(self.base + "/", path.lstrip("/"))
        return self.s.get(url, timeout=20, **kw)

    # ---------- auth ----------
    def is_logged_in(self) -> bool:
        r = self._get("/student", allow_redirects=True)
        return r.ok and "/login" not in r.url and not self._find_login_form(r.text)

    @staticmethod
    def _find_login_form(html: str):
        soup = BeautifulSoup(html, "lxml")
        for form in soup.find_all("form"):
            if form.find("input", {"type": "password"}):
                return form
        return None

    def login(self, email: str | None = None, password: str | None = None):
        email = email or os.environ.get("MB_EMAIL")
        password = password or os.environ.get("MB_PASSWORD")
        if not email or not password:
            raise ManageBacError("MB_EMAIL / MB_PASSWORD が未設定です")

        r = self._get("/login")
        form = self._find_login_form(r.text)
        if form is None:
            if self.is_logged_in():
                return
            raise ManageBacError("ログインフォームが見つかりません(SSOの学校かも)")

        data = {}
        user_field = pass_field = None
        for inp in form.find_all("input"):
            name = inp.get("name")
            if not name:
                continue
            t = (inp.get("type") or "text").lower()
            if t == "password":
                pass_field = name
            elif t in ("text", "email") and user_field is None:
                user_field = name
            elif t == "hidden":
                data[name] = inp.get("value", "")
        if not (user_field and pass_field):
            raise ManageBacError("ID/パスワード入力欄を特定できませんでした")
        data[user_field] = email
        data[pass_field] = password
        data["remember_me"] = "1"  # セッションを長持ちさせる

        action = urljoin(r.url, form.get("action") or "/sessions")
        self._throttle()
        resp = self.s.post(action, data=data, timeout=20, allow_redirects=True,
                           headers={"Referer": r.url})
        if self._find_login_form(resp.text) or "/login" in resp.url:
            raise ManageBacError("ログイン失敗(認証情報を確認。連続試行はロックされます)")
        self._save_session()

    def ensure_login(self):
        if not self.is_logged_in():
            self.login()

    # ---------- data ----------
    def get_html(self, path: str) -> str:
        self.ensure_login()
        r = self._get(path)
        r.raise_for_status()
        return r.text

    def classes(self) -> list[dict]:
        soup = BeautifulSoup(self.get_html("/student"), "lxml")
        out, seen = [], set()
        for a in soup.find_all("a", href=re.compile(r"/student/classes/\d+")):
            m = re.search(r"/student/classes/(\d+)", a["href"])
            cid = m.group(1)
            name = _norm(a.get_text(" ", strip=True))
            if cid in seen or not name:
                continue
            seen.add(cid)
            out.append({"id": cid, "name": name,
                        "url": urljoin(self.base + "/", a["href"].lstrip("/"))})
        self._class_names = {c["id"]: c["name"] for c in out}
        return out

    def _class_name(self, cid: str) -> str | None:
        if self._class_names is None:
            self.classes()
        return (self._class_names or {}).get(cid)

    def _parse_tasks(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")

        # タスクIDごとにリンクをまとめる(タイトルリンク+「Submit Coursework」の重複対策)
        groups: dict[str, list] = {}
        for a in soup.find_all("a", href=TASK_HREF):
            m = TASK_HREF.search(a["href"])
            groups.setdefault(m.group(2), []).append(a)

        tasks = []
        for task_id, anchors in groups.items():
            cid = TASK_HREF.search(anchors[0]["href"]).group(1)

            title, submit_url = None, None
            for a in anchors:
                text = _norm(a.get_text(" ", strip=True))
                if re.fullmatch(r"Submit Coursework|Submit|提出", text, re.I):
                    submit_url = urljoin(self.base + "/", a["href"].lstrip("/"))
                elif text and title is None:
                    title = text
            if not title:
                continue

            # このタスクだけを含む最大の親要素=行
            row = anchors[0]
            while row.parent is not None and row.parent.name not in ("body", "html"):
                ids = {TASK_HREF.search(x["href"]).group(2)
                       for x in row.parent.find_all("a", href=TASK_HREF)}
                if ids != {task_id}:
                    break
                row = row.parent
            ctx = _norm(row.get_text(" ", strip=True))

            due, due_iso = _parse_due(ctx)

            # 状況・種別はタイトル部分を除いた文脈から拾う
            rest = ctx.replace(title, " ")
            statuses = STATUS_RE.findall(rest)
            kind = KIND_RE.search(rest)

            tasks.append({
                "id": task_id,
                "title": title,
                "class_id": cid,
                "class_name": self._class_name(cid),
                "due": due,
                "due_iso": due_iso,
                "status": statuses[-1] if statuses else None,
                "kind": kind.group(1) if kind else None,
                "submittable": submit_url is not None,
                "url": urljoin(self.base + "/", anchors[0]["href"].lstrip("/")),
                "context": ctx[:300],
            })
        return tasks

    def deadlines(self, view: str = "upcoming") -> list[dict]:
        """view: upcoming | past | overdue"""
        if view not in ("upcoming", "past", "overdue"):
            raise ManageBacError("view は upcoming / past / overdue のいずれか")
        return self._parse_tasks(self.get_html(f"/student/tasks_and_deadlines?view={view}"))

    def class_tasks(self, class_id: str) -> list[dict]:
        return self._parse_tasks(self.get_html(f"/student/classes/{class_id}/core_tasks"))

    def task_detail(self, class_id: str, task_id: str, max_chars: int = 8000) -> dict:
        """課題詳細ページからタイトルと説明文を取る。
        説明文は複数セレクタを試すが、構造が変わっても空で返す(例外は投げない)。"""
        html = self.get_html(f"/student/classes/{class_id}/core_tasks/{task_id}")
        soup = BeautifulSoup(html, "lxml")

        title = None
        for tag in ("h1", "h2", "h3"):
            h = soup.find(tag)
            if h and _norm(h.get_text(" ", strip=True)):
                title = _norm(h.get_text(" ", strip=True))
                break

        detail = None
        for sel in ('[class*="description"]', '[class*="instruction"]', '[class*="content"]', "article", "main"):
            el = soup.select_one(sel)
            if not el:
                continue
            text = _norm(el.get_text("\n", strip=True))
            if len(text) > 20:
                detail = text[:max_chars]
                break
        return {"task_id": task_id, "detail_title": title, "detail": detail}


# ---------- FastAPI ----------
def build_app():
    from fastapi import FastAPI, HTTPException

    app = FastAPI(title="ManageBac Unofficial API")
    mb = ManageBac()

    def guard(fn):
        try:
            return fn()
        except ManageBacError as e:
            raise HTTPException(401, str(e))
        except Exception as e:  # requests 系など
            raise HTTPException(502, f"ManageBac request failed: {e}")

    @app.get("/health")
    def health():
        return {"ok": True, "logged_in": mb.is_logged_in()}

    @app.get("/classes")
    def classes():
        return guard(mb.classes)

    @app.get("/deadlines/{view}")
    def deadlines(view: str):
        return guard(lambda: mb.deadlines(view))

    @app.get("/tasks/{class_id}")
    def tasks(class_id: str):
        return guard(lambda: mb.class_tasks(class_id))

    @app.get("/detail/{class_id}/{task_id}")
    def detail(class_id: str, task_id: str):
        return guard(lambda: mb.task_detail(class_id, task_id))

    return app


def main():
    """コマンドライン入口。"""
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"

    if command == "serve":
        import uvicorn
        uvicorn.run(build_app(), host="127.0.0.1", port=8000)
        return

    mb = ManageBac()
    if command == "login":
        mb.login()
        print("ログイン成功")
    elif command == "classes":
        print(json.dumps(mb.classes(), ensure_ascii=False, indent=2))
    elif command == "deadlines":
        view = sys.argv[2] if len(sys.argv) > 2 else "upcoming"
        print(json.dumps(mb.deadlines(view), ensure_ascii=False, indent=2))
    elif command == "tasks" and len(sys.argv) > 2:
        print(json.dumps(mb.class_tasks(sys.argv[2]), ensure_ascii=False, indent=2))
    elif command == "detail" and len(sys.argv) > 3:
        print(json.dumps(mb.task_detail(sys.argv[2], sys.argv[3]), ensure_ascii=False, indent=2))
    elif command == "dump" and len(sys.argv) > 2:
        print(mb.get_html(sys.argv[2]))
    else:
        raise ManageBacError(
            "使い方: login | classes | deadlines | tasks <class_id> | "
            "detail <class_id> <task_id> | dump <path> | serve"
        )


if __name__ == "__main__":
    main()
