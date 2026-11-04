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
