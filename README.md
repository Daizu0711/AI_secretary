# AI秘書アプリ

仕様は `AI秘書アプリ 仕様書 v1.txt` を参照(仕様確定済み)。

## 構成

| パス | 内容 |
|---|---|
| `app/` | PWAフロントエンド(単一HTML。GitHub Pagesで自動デプロイ) |
| `.github/workflows/pages.yml` | `app/` をGitHub Pagesへデプロイ(`index_1.html`→トップページ) |
| `supabase/schema.sql` | `sec_*` テーブル + 共有 `managebac_*` テーブルのスキーマ(RLS付き)。SQL Editorで実行 |
| `supabase/functions/ai/` | AIルーター Edge Function。Gemini → NIM → Hermes(チャット/計画)、NIM → Gemini(課題ヒント)。承認制propose_*ツール + `sec_ai_log` 記録付き |
| `managebac auto/` | ManageBac 非公式スクレイパー + Supabase同期 |
| `.github/workflows/managebac-sync.yml` | 数時間おきの自動取り込み(GitHub Actions) |

## セットアップ

1. Supabase プロジェクトを作成し、`supabase/schema.sql` → `supabase/phase2.sql` の順に SQL Editor で実行
   (既存DBがある場合も phase2.sql は冪等なので安全に再実行できる)
2. 自分のアカウントを作成したら **新規登録をOFF** にする(仕様書 §3)
3. PWAをデプロイ: リポジトリの Settings → Pages → Source を **GitHub Actions** にする。
   以降 `main` への `app/` 変更pushで自動デプロイされる(手動はActionsの pages → Run workflow)
3. ManageBac 同期用に `.env` を作成(`.env.example` をコピー)してローカルで確認:
   ```
   cd "managebac auto"
   .venv/bin/python sync_to_supabase.py --dry-run   # 一覧スクレイプのみ確認
   .venv/bin/python sync_to_supabase.py             # 一覧+課題詳細を同期
   .venv/bin/python sync_to_supabase.py --no-detail # 一覧のみ(詳細ページを叩かない)
   .venv/bin/python managebac_client.py detail <class_id> <task_id>  # 詳細だけ確認
   ```
   課題の詳細ページ(説明文)は `managebac_tasks.detail` に保存される。
   未取得 or 24h以上経過のものだけを1回最大50件(`--detail-limit`)、1.2秒間隔で取得する
   (アカウントBAN回避)。`detail_fetched_at` で最終取得時刻を管理。
4. GitHub リポジトリを **private** にして、Actions Secrets に以下を登録:
   `MB_BASE_URL`, `MB_EMAIL`, `MB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (サービスロールキーを使わない場合は `SUPABASE_ANON_KEY` + `SB_EMAIL` + `SB_PASSWORD`)
5. AIルーター Edge Function をデプロイし、Secretsを設定:
   ```
   supabase secrets set GEMINI_API_KEY=... NIM_API_KEY=...   # NIMはNVIDIA_API_KEYでも可
   # --no-verify-jwt: GET診断とgcalのOAuthコールバック(ブラウザ遷移でヘッダーが付かない)を通すため。
   # POSTは関数内で auth.getUser() によりユーザーJWTを検証するので実質同じ強度。
   supabase functions deploy ai --no-verify-jwt   # ← Secrets変更後は必ず再デプロイ
   supabase functions deploy gcal --no-verify-jwt
   supabase secrets list               # 設定確認
   ```
   **503 (Service Unavailable) が出る場合**はほぼ Secrets未設定 or 再デプロイ忘れ。
   Dashboard → Edge Functions → ai → Logs で実際のエラーを確認できる。
   ヘルス確認: `curl https://<ref>.supabase.co/functions/v1/ai` (anon key不要のGET) で
   `{providers:{gemini:bool, nim:bool}, models:{...}}` が返る。
   実際に使えるモデル一覧(anon keyヘッダー付き):
   `curl -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" "https://<ref>.supabase.co/functions/v1/ai?action=models"`
   (gemini_live / nim_live にプロバイダ側の最新一覧が返る)

   **モデル名について(2026-11時点)**: Geminiの `gemini-2.x` は退役済みで 404 になる。
   既定は `gemini-flash-latest,gemini-pro-latest`(latestエイリアスなので常に現行を指す)で、
   404/退役を検知したら自動で次の候補モデルにフォールバックする。
   NIMは `integrate.api.nvidia.com/v1/models` で現存確認済みの候補から順に試す。
   個別指定は Secrets で上書き可: `GEMINI_MODEL` / `GEMINI_MODELS`(カンマ区切り) /
   `NIM_MODEL` / `NIM_MODELS`(カンマ区切り)。
6. Googleカレンダー連携 (アプリ→カレンダーへの書き込み):
   - Google Cloud Console で OAuth クライアント(ID/シークレット)を作成し、
     承認済みリダイレクトURIに `https://<ref>.supabase.co/functions/v1/gcal?action=callback` を登録
   - `supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...`
   - `supabase functions deploy gcal --no-verify-jwt` (OAuthコールバックがヘッダー無しGETのため)
   - `supabase/schema.sql` → `phase2.sql` を再実行 (sec_gcal / gcal_event_id 列)
   - アプリの設定画面 → Googleカレンダー →「連携する」→ 同意 →「同期」
   - `sec_gcal` はクライアントから不可視(RLSで拒否、状態は `sec_gcal_status` ビューのみ)
7. カレンダー購読(iCalフィード — OAuth不要、スクレイピング不要):
   - `supabase functions deploy ics --no-verify-jwt`(GETはトークン認証、POSTはユーザーJWT検証)
   - `schema.sql` → `phase2.sql` を再実行 (`sec_ics_tokens`)
   - アプリ設定画面の「カレンダー購読」カードに表示されるURLをコピー
   - Googleカレンダー → 他のカレンダー横の「+」→「URLから追加」→ URLを貼り付け
   - 反映はGoogle側の巡回間隔次第で数十分〜数時間遅れる(リアルタイム不要な用途向け。
     即時に書き込みたい場合は 6. のOAuth版 gcal を併用)
   フロント(app/index_1.html)の `askServer()` が使う契約:
   リクエスト `{message, history:[{role,content}], tz, now, purpose?}` →
   レスポンス `{text, provider, tried:[{provider,ok}], proposals:[{tool,args}]}` または `{error}`。
   `proposals[].tool` は `propose_add_task / propose_add_note / propose_update_item /
   propose_complete_task / propose_delete_item / propose_memory` のいずれかで、
   `args` はフロントの `applyProposal()` がそのまま消費する形。適用はユーザー承認後に
   アプリ側がユーザー権限(PostgREST/RLS)で行う。
4. フロントの設定は `app/index_1.html` 冒頭の `SUPABASE_URL` / `SUPABASE_KEY` の2行だけ
   (URLは設定済み、KEYは Settings → API の anon public key)
5. `managebac-sync` ワークフローが3時間おきに走る。失敗時は `managebac_import_log`
   に `ok=false` が記録され、アプリ側は「最終更新◯時間前」を表示する(仕様書 §6)

## ローカル検証

```
cd "managebac auto"
.venv/bin/python -m py_compile managebac_client.py sync_to_supabase.py todo.py
.venv/bin/python todo.py --days 7     # 要提出+直近の予定を表示
.venv/bin/python managebac_client.py serve   # http://127.0.0.1:8000/docs
```
