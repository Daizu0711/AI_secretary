-- ============================================================================
-- phase3.sql — EE / IA / TOK などのプロジェクト管理 (仕様書 §4.8)
--   schema.sql → phase2.sql → phase3.sql の順に実行する。
--   何度実行しても安全(冪等)。
-- ============================================================================

-- ---------- sec_projects: プロジェクト本体 ----------
create table if not exists public.sec_projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null default 'EE'
                check (kind in ('EE','IA','TOK','OTHER')),
  title         text not null,
  subject       text default '',                 -- 科目(化学 / 生物 など)
  stage         text not null default 'theme',   -- theme|research|outline|draft|feedback|revise|final
  target_words  integer,                          -- 目標語数
  current_words integer not null default 0,       -- 現在の語数
  supervisor    text default '',                  -- 指導者
  feedback      text default '',                  -- フィードバックの記録
  due           timestamptz,                      -- 最終提出期限
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists sec_projects_user_idx on public.sec_projects (user_id, archived);
create index if not exists sec_projects_due_idx  on public.sec_projects (user_id, due);

-- ---------- sec_milestones: マイルストーン ----------
create table if not exists public.sec_milestones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.sec_projects(id) on delete cascade,
  title      text not null,
  due        timestamptz,
  done       boolean not null default false,
  done_at    timestamptz,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sec_milestones_project_idx on public.sec_milestones (user_id, project_id, sort);

-- ---------- updated_at トリガー ----------
create or replace function public.sec_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists sec_projects_touch on public.sec_projects;
create trigger sec_projects_touch before update on public.sec_projects
  for each row execute function public.sec_touch_updated_at();

-- ---------- RLS ----------
alter table public.sec_projects   enable row level security;
alter table public.sec_milestones enable row level security;

drop policy if exists sec_projects_own on public.sec_projects;
create policy sec_projects_own on public.sec_projects
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sec_milestones_own on public.sec_milestones;
create policy sec_milestones_own on public.sec_milestones
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Realtime ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sec_projects'
  ) then
    alter publication supabase_realtime add table public.sec_projects;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sec_milestones'
  ) then
    alter publication supabase_realtime add table public.sec_milestones;
  end if;
end $$;
