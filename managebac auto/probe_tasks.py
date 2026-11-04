# probe_tasks.py — タスクページの構造を確認する(managebac_client.py と同じフォルダに置く)
import re
from bs4 import BeautifulSoup
from managebac_client import ManageBac

mb = ManageBac()

PATHS = [
    "/student/tasks_and_deadlines?view=upcoming",
    "/student/tasks_and_deadlines?view=past",
    "/student/tasks_and_deadlines?view=overdue",
    "/student/tasks_and_deadlines",
    "/student/classes/12975939/assignments",   # Chemistry
    "/student/classes/12975939/tasks",
]

for p in PATHS:
    print("=" * 70)
    print(p)
    try:
        r = mb._get(p)
    except Exception as e:
        print("  ERROR:", e)
        continue
    print("  status:", r.status_code, "| final:", r.url, "| bytes:", len(r.text))
    if not r.ok:
        continue

    soup = BeautifulSoup(r.text, "lxml")
    print("  title:", soup.title.get_text(strip=True) if soup.title else None)

    # JS描画の兆候
    scripts_json = soup.find_all("script", {"type": re.compile("json")})
    print("  json scripts:", len(scripts_json),
          "| data-react/props:", len(soup.select("[data-react-props],[data-props],[data-react-class]")))

    # リンク(task/assignment/unit/assessment系)
    hrefs = []
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if re.search(r"task|assign|assess|unit|deadline|calendar", h, re.I):
            hrefs.append((h, a.get_text(" ", strip=True)[:50]))
    print("  matching links:", len(hrefs))
    for h, t in hrefs[:12]:
        print("   ", h, "|", t)

    # 本文テキストの冒頭(個人情報が出る場合は伏せてから貼ること)
    main = soup.find("main") or soup.find(id=re.compile("content|main", re.I)) or soup.body
    text = re.sub(r"\s+", " ", main.get_text(" ", strip=True)) if main else ""
    print("  text head:", text[:400])
    