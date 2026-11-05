-- 직접 등록 프로젝트의 댓글과 반응. 기존 프로젝트는 변경하지 않는다.
create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and btrim(body) <> ''),
  created_at timestamptz not null default now()
);
create index project_comments_time on public.project_comments(project_id, created_at);
alter table public.project_comments enable row level security;
revoke all on public.project_comments from public, anon, authenticated;
grant select on public.project_comments to authenticated;
grant insert(project_id, member_id, body) on public.project_comments to authenticated;
create policy project_comments_read on public.project_comments for select to authenticated
using ((select private.is_member()) and exists (select 1 from public.projects p where p.id = project_id));
create policy project_comments_insert on public.project_comments for insert to authenticated
with check (member_id = (select auth.uid()) and (select private.is_member()) and exists (select 1 from public.projects p where p.id = project_id));

create table public.project_reactions (
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️')),
  created_at timestamptz not null default now(),
  primary key (project_id, member_id, emoji)
);
alter table public.project_reactions enable row level security;
revoke all on public.project_reactions from public, anon, authenticated;
grant select, delete on public.project_reactions to authenticated;
grant insert(project_id, member_id, emoji) on public.project_reactions to authenticated;
create policy project_reactions_read on public.project_reactions for select to authenticated
using ((select private.is_member()) and exists (select 1 from public.projects p where p.id = project_id));
create policy project_reactions_insert on public.project_reactions for insert to authenticated
with check (member_id = (select auth.uid()) and (select private.is_member()) and exists (select 1 from public.projects p where p.id = project_id));
create policy project_reactions_delete on public.project_reactions for delete to authenticated
using (member_id = (select auth.uid()) and (select private.is_member()) and exists (select 1 from public.projects p where p.id = project_id));
