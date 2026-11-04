-- ============================================================================
-- phase2.sql — 既存DBを app/index_1.html の列構成へ移行する冪等マイグレーション
--   (app 側は scheduled_start が無いと検知してこのファイルの実行を促す)
-- 新規環境は schema.sql だけで済む。既存環境は schema.sql → phase2.sql の順で実行。
-- ============================================================================

-- ---------- sec_items: 不足カラムの追加 + 旧名からの移行 ----------
do $$
declare
  has_col text;
begin
  -- est_minutes (旧: estimate_min)
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_items' and column_name='est_minutes') then
    alter table public.sec_items add column est_minutes integer;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='sec_items' and column_name='estimate_min') then
      update public.sec_items set est_minutes = estimate_min;
      alter table public.sec_items drop column estimate_min;
    end if;
  end if;

  -- done_at
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_items' and column_name='done_at') then
    alter table public.sec_items add column done_at timestamptz;
  end if;

  -- ai_hidden (旧: hide_from_ai)
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_items' and column_name='ai_hidden') then
    alter table public.sec_items add column ai_hidden boolean not null default false;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='sec_items' and column_name='hide_from_ai') then
      update public.sec_items set ai_hidden = hide_from_ai;
      alter table public.sec_items drop column hide_from_ai;
    end if;
  end if;

  -- actual_min / priority / scheduled_start / scheduled_end
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_items' and column_name='actual_min') then
    alter table public.sec_items add column actual_min integer;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_items' and column_name='priority') then
    alter table public.sec_items add column priority integer default 0;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_items' and column_name='scheduled_start') then
    alter table public.sec_items add column scheduled_start timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_items' and column_name='scheduled_end') then
    alter table public.sec_items add column scheduled_end timestamptz;
  end if;

  -- kind: 'memo' → 'note' に統一(フロントエンドは task|note)
  update public.sec_items set kind = 'note' where kind = 'memo';
  alter table public.sec_items drop constraint if exists sec_items_kind_check;
  alter table public.sec_items add constraint sec_items_kind_check check (kind in ('task','note'));
end $$;

create index if not exists sec_items_user_due_idx on public.sec_items (user_id, due);
create index if not exists sec_items_sched_idx    on public.sec_items (user_id, scheduled_start);
create index if not exists sec_items_done_idx     on public.sec_items (user_id, done);

-- ---------- managebac_tasks: detail 列(課題詳細ページの説明文) ----------
alter table public.managebac_tasks add column if not exists detail text;
alter table public.managebac_tasks add column if not exists detail_title text;
alter table public.managebac_tasks add column if not exists detail_fetched_at timestamptz;

-- ---------- RLS 修復: 「DBにはあるのにアプリで見えない」対策 ----------
-- 1) user_id の自動補完(アプリは insert 時に user_id を送らないため必須)
alter table public.sec_items            alter column user_id set default auth.uid();
alter table public.sec_memory           alter column user_id set default auth.uid();
alter table public.sec_hermes_jobs      alter column user_id set default auth.uid();
alter table public.sec_push_subscriptions alter column user_id set default auth.uid();

-- 2) user_id が NULL の既存行を、単一ユーザー運用(新規登録OFF)前提で唯一のアカウントに紐付け
do $$
declare
  only_user uuid;
begin
  select id into only_user from auth.users order by created_at limit 1;
  if (select count(*) from auth.users) = 1 and only_user is not null then
    update public.sec_items            set user_id = only_user where user_id is null;
    update public.sec_memory           set user_id = only_user where user_id is null;
    update public.sec_hermes_jobs      set user_id = only_user where user_id is null;
    update public.sec_push_subscriptions set user_id = only_user where user_id is null;
  end if;
end $$;

-- 3) ポリシーの再作成(既存環境で未作成/食い違いがあっても確実に張る)
drop policy if exists sec_items_own on public.sec_items;
create policy sec_items_own on public.sec_items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists sec_memory_own on public.sec_memory;
create policy sec_memory_own on public.sec_memory
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists sec_ai_log_own on public.sec_ai_log;
create policy sec_ai_log_own on public.sec_ai_log
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists sec_hermes_jobs_own on public.sec_hermes_jobs;
create policy sec_hermes_jobs_own on public.sec_hermes_jobs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists sec_push_subscriptions_own on public.sec_push_subscriptions;
create policy sec_push_subscriptions_own on public.sec_push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists managebac_tasks_all on public.managebac_tasks;
create policy managebac_tasks_all on public.managebac_tasks
  for all to authenticated using (true) with check (true);
drop policy if exists managebac_import_log_all on public.managebac_import_log;
create policy managebac_import_log_all on public.managebac_import_log
  for all to authenticated using (true) with check (true);

-- ---------- sec_memory: content → text ----------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sec_memory' and column_name='text') then
    alter table public.sec_memory add column text text;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='sec_memory' and column_name='content') then
      update public.sec_memory set text = content;
      alter table public.sec_memory drop column content;
    end if;
    alter table public.sec_memory alter column text set not null;
  end if;
end $$;
