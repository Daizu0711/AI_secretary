-- ============================================================================
-- AI秘書アプリ schema.sql  (仕様書 v1 §8 データモデル準拠)
-- Supabase の SQL Editor で実行する。すべて idempotent (再実行可)。
-- managebac_tasks は Winter Arc と共有するテーブルのため
-- create table if not exists で既存定義を壊さない。
-- ============================================================================

-- ---------- sec_items: タスク/メモ (列名は app/index_1.html の実装に合わせる) ----------
create table if not exists public.sec_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('task','note')),
  title           text not null,
  body            text default '',
  due             timestamptz,                 -- 期限
  category        text default '',
  est_minutes     integer,                       -- 見積り(分)
  actual_min      integer,                       -- 実績(分) ※見積り学習用(§4.7)
  done            boolean not null default false,
  done_at         timestamptz,                   -- 完了時刻
  ai_hidden       boolean not null default false, -- 「AIに見せない」
  priority        integer default 0,             -- 自動計画で使う重み
  scheduled_start timestamptz,                   -- 自動計画で置かれた開始
  scheduled_end   timestamptz,                   -- 自動計画で置かれた終了
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sec_items_user_due_idx  on public.sec_items (user_id, due);
create index if not exists sec_items_sched_idx      on public.sec_items (user_id, scheduled_start);
create index if not exists sec_items_done_idx       on public.sec_items (user_id, done);

-- ---------- sec_memory: AIの記憶 ----------
create table if not exists public.sec_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

-- ---------- sec_ai_log: AI呼び出しの成否 ----------
create table if not exists public.sec_ai_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  at         timestamptz not null default now(),
  provider   text,          -- gemini / nim / hermes
  purpose    text,          -- chat / plan / transcribe / hint ...
  ok         boolean not null,
  error      text,
  detail     jsonb
);

-- ---------- managebac_tasks: ManageBac課題 (Winter Arc と共有) ----------
create table if not exists public.managebac_tasks (
  task_id     text primary key,                  -- ManageBac側のタスクID
  class_id    text,
  class_name  text,
  title       text,
  kind        text,                              -- Summative / Formative
  status      text,                              -- Submitted / Late / Overdue ...
  submittable boolean default false,
  due         text,                              -- 表示用の原文
  due_iso     timestamptz,                       -- パース済み期限
  url         text,
  context     text,
  views       text,                              -- 取り込み元ビュー(upcoming/overdue)
  fetched_at  timestamptz,                       -- 最終取り込み時刻
  updated_at  timestamptz not null default now()
);

create index if not exists managebac_tasks_due_idx on public.managebac_tasks (due_iso);

-- ---------- sec_hermes_jobs: Hermes(別PC)への依頼ジョブ (仕様書 §7) ----------
create table if not exists public.sec_hermes_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                       -- night_review / notebooklm / free
  payload    jsonb not null default '{}',
  status     text not null default 'pending' check (status in ('pending','running','done','failed','approved_needed')),
  approved   boolean not null default false,       -- 破壊的操作の承認フラグ
  result     jsonb,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_hermes_jobs_status_idx
  on public.sec_hermes_jobs (status, created_at);

-- ---------- sec_push_subscriptions: Web Push購読 (仕様書 §5) ----------
create table if not exists public.sec_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------- managebac_import_log: 取り込みの成否 (失敗通知の判断用) ----------
create table if not exists public.managebac_import_log (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  ok          boolean not null,
  error       text,
  count       integer not null default 0
);

create index if not exists managebac_import_log_finished_idx
  on public.managebac_import_log (finished_at desc);

-- ---------- updated_at 自動更新 ----------
create or replace function public.sec_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists sec_items_touch on public.sec_items;
create trigger sec_items_touch before update on public.sec_items
  for each row execute function public.sec_touch_updated_at();

drop trigger if exists managebac_tasks_touch on public.managebac_tasks;
create trigger managebac_tasks_touch before update on public.managebac_tasks
  for each row execute function public.sec_touch_updated_at();

drop trigger if exists sec_hermes_jobs_touch on public.sec_hermes_jobs;
create trigger sec_hermes_jobs_touch before update on public.sec_hermes_jobs
  for each row execute function public.sec_touch_updated_at();

-- ---------- RLS ----------
alter table public.sec_items            enable row level security;
alter table public.sec_memory           enable row level security;
alter table public.sec_ai_log           enable row level security;
alter table public.managebac_tasks      enable row level security;
alter table public.managebac_import_log enable row level security;
alter table public.sec_hermes_jobs      enable row level security;
alter table public.sec_push_subscriptions enable row level security;

-- 自分の行だけ読み書き (仕様書 §3)
drop policy if exists sec_items_own on public.sec_items;
create policy sec_items_own on public.sec_items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sec_memory_own on public.sec_memory;
create policy sec_memory_own on public.sec_memory
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sec_ai_log_own on public.sec_ai_log;
create policy sec_ai_log_own on public.sec_ai_log
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- managebac_tasks / import_log は Winter Arc 共有テーブル。
-- 両アプリとも同一アカウントでログインする運用なので authenticated に全権を付与する。
-- (Winter Arc 側に既存ポリシーがある場合はそちらが優先されるよう、
--  既存ポリシー名が分かり次第個別に差し替えること)
drop policy if exists managebac_tasks_all on public.managebac_tasks;
create policy managebac_tasks_all on public.managebac_tasks
  for all to authenticated using (true) with check (true);

drop policy if exists managebac_import_log_all on public.managebac_import_log;
create policy managebac_import_log_all on public.managebac_import_log
  for all to authenticated using (true) with check (true);

drop policy if exists sec_hermes_jobs_own on public.sec_hermes_jobs;
create policy sec_hermes_jobs_own on public.sec_hermes_jobs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sec_push_subscriptions_own on public.sec_push_subscriptions;
create policy sec_push_subscriptions_own on public.sec_push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Realtime (アプリの購読用) ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sec_items'
  ) then
    alter publication supabase_realtime add table public.sec_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'managebac_tasks'
  ) then
    alter publication supabase_realtime add table public.managebac_tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sec_hermes_jobs'
  ) then
    alter publication supabase_realtime add table public.sec_hermes_jobs;
  end if;
end $$;
