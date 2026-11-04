# AI秘書アプリ

仕様は `AI秘書アプリ 仕様書 v1.txt` を参照(仕様確定済み)。

## 構成

| パス | 内容 |
|---|---|
| `app/` | PWAフロントエンド(単一HTML。GitHub Pagesで公開) |
| `supabase/schema.sql` | `sec_*` テーブル + 共有 `managebac_*` テーブルのスキーマ(RLS付き)。SQL Editorで実行 |
| `supabase/functions/ai/` | AIルーター Edge Function。Gemini → NIM → Hermes(チャット/計画)、NIM → Gemini(課題ヒント)。承認制propose_*ツール + `sec_ai_log` 記録付き |
| `managebac auto/` | ManageBac 非公式スクレイパー + Supabase同期 |
| `.github/workflows/managebac-sync.yml` | 数時間おきの自動取り込み(GitHub Actions) |

## セットアップ

1. Supabase プロジェクトを作成し、`supabase/schema.sql` を SQL Editor で実行
2. 自分のアカウントを作成したら **新規登録をOFF** にする(仕様書 §3)
3. ManageBac 同期用に `.env` を作成(`.env.example` をコピー)してローカルで確認:
   ```
   cd "managebac auto"
   .venv/bin/python sync_to_supabase.py --dry-run   # スクレイプのみ確認
   .venv/bin/python sync_to_supabase.py             # Supabaseへ同期
   ```
4. GitHub リポジトリを **private** にして、Actions Secrets に以下を登録:
   `MB_BASE_URL`, `MB_EMAIL`, `MB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (サービスロールキーを使わない場合は `SUPABASE_ANON_KEY` + `SB_EMAIL` + `SB_PASSWORD`)
5. AIルーター Edge Function をデプロイし、Secretsを設定:
   ```
   supabase functions deploy ai
   supabase secrets set GEMINI_API_KEY=... NIM_API_KEY=...   # NIMはNVIDIA_API_KEYでも可
   # 任意: GEMINI_MODEL / NIM_BASE / NIM_MODEL
   ```
   フロントからは `POST {SUPABASE_URL}/functions/v1/ai` にユーザーJWT付きで
   `{purpose, messages:[{role,content}]}` を送ると `{ok, provider, reply, proposals[]}` が返る。
   `proposals` は承認カード。適用はアプリ側がユーザー権限(PostgREST/RLS)で行う。
5. `managebac-sync` ワークフローが3時間おきに走る。失敗時は `managebac_import_log`
   に `ok=false` が記録され、アプリ側は「最終更新◯時間前」を表示する(仕様書 §6)

## ローカル検証

```
cd "managebac auto"
.venv/bin/python -m py_compile managebac_client.py sync_to_supabase.py todo.py
.venv/bin/python todo.py --days 7     # 要提出+直近の予定を表示
.venv/bin/python managebac_client.py serve   # http://127.0.0.1:8000/docs
```
