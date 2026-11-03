-- 이글루 마을 전용 초기 스키마. 다른 프로젝트에 적용하지 않는다.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null default 'student' check (role in ('student', 'instructor')),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;
revoke all on public.members from public, anon, authenticated;
grant select on public.members to authenticated;
grant update(display_name) on public.members to authenticated;

-- 역할은 관리자가 지정한다. 사용자 메타데이터나 클라이언트 값으로 판단하지 않는다.
create function private.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.id = (select auth.uid()) and m.approved);
$$;
create function private.is_student() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.id = (select auth.uid()) and m.approved and m.role = 'student');
$$;
create function private.is_instructor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.id = (select auth.uid()) and m.approved and m.role = 'instructor');
$$;
revoke all on function private.is_member(), private.is_student(), private.is_instructor() from public, anon;
grant execute on function private.is_member(), private.is_student(), private.is_instructor() to authenticated;
create policy members_read on public.members for select to authenticated
  using (id = (select auth.uid()) or (select private.is_member()));
create policy members_name on public.members for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create table public.igloos (
  id smallint primary key check (id between 0 and 30),
  owner_id uuid unique references public.members(id),
  is_public boolean not null default false,
  claimed_at timestamptz,
  check ((owner_id is null and claimed_at is null) or (owner_id is not null and claimed_at is not null))
);
insert into public.igloos(id) select generate_series(0, 30);
alter table public.igloos enable row level security;
revoke all on public.igloos from public, anon, authenticated;
grant select on public.igloos to anon, authenticated;
grant update(owner_id, is_public, claimed_at) on public.igloos to authenticated;
create policy igloos_read on public.igloos for select to anon, authenticated using (true);
create policy igloos_update on public.igloos for update to authenticated
  using ((owner_id is null or owner_id = (select auth.uid())) and (select private.is_student()))
  with check (owner_id = (select auth.uid()) and (select private.is_student()));

create function public.claim_igloo(p_igloo_id smallint) returns public.igloos
language plpgsql security invoker set search_path = '' as $$
declare result public.igloos;
begin
  if not private.is_student() then raise insufficient_privilege using message = '승인된 수강생만 이글루를 선택할 수 있습니다.'; end if;
  if p_igloo_id < 0 or p_igloo_id > 30 then raise invalid_parameter_value using message = '존재하지 않는 이글루입니다.'; end if;
  update public.igloos set owner_id = auth.uid(), claimed_at = now()
    where id = p_igloo_id and owner_id is null returning * into result;
  if not found then raise exception '이미 선택된 이글루입니다.'; end if;
  return result;
end;
$$;
revoke all on function public.claim_igloo(smallint) from public, anon;
grant execute on function public.claim_igloo(smallint) to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  igloo_id smallint not null references public.igloos(id),
  owner_id uuid not null references public.members(id),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now()
);
create index projects_home_time on public.projects(igloo_id, created_at desc);
create index projects_owner on public.projects(owner_id);
alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select, delete on public.projects to authenticated;
grant insert(igloo_id, owner_id, title, description, url) on public.projects to authenticated;
grant update(title, description, url) on public.projects to authenticated;
create policy projects_read on public.projects for select to authenticated using (
  (select private.is_member()) and (owner_id = (select auth.uid()) or exists (
    select 1 from public.igloos i where i.id = projects.igloo_id and i.owner_id = projects.owner_id and i.is_public
  ))
);
create policy projects_insert on public.projects for insert to authenticated with check (
  (select private.is_student()) and owner_id = (select auth.uid()) and exists (
    select 1 from public.igloos i where i.id = projects.igloo_id and i.owner_id = (select auth.uid())
  )
);
create policy projects_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_student()))
  with check (owner_id = (select auth.uid()) and (select private.is_student()));
create policy projects_delete on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_student()));

create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.members(id),
  recipient_id uuid not null references public.members(id),
  body text not null default '' check (char_length(body) <= 5000),
  link text not null default '' check (char_length(link) <= 2048 and (link = '' or link ~* '^https?://[^[:space:]]+$')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (btrim(body) <> '' or btrim(link) <> '')
);
create index mail_inbox on public.mail_messages(recipient_id, created_at desc);
create index mail_sender on public.mail_messages(sender_id, created_at desc);
alter table public.mail_messages enable row level security;
revoke all on public.mail_messages from public, anon, authenticated;
grant select on public.mail_messages to authenticated;
grant insert(sender_id, recipient_id, body, link) on public.mail_messages to authenticated;
grant update(read_at) on public.mail_messages to authenticated;
create policy mail_read on public.mail_messages for select to authenticated using (
  (select private.is_member()) and (recipient_id = (select auth.uid()) or sender_id = (select auth.uid()))
);
create policy mail_send on public.mail_messages for insert to authenticated with check (
  (select private.is_instructor()) and sender_id = (select auth.uid()) and exists (
    select 1 from public.igloos i join public.members m on m.id = i.owner_id
    where i.owner_id = recipient_id and m.approved and m.role = 'student'
  )
);
create policy mail_mark_read on public.mail_messages for update to authenticated
  using (recipient_id = (select auth.uid()) and (select private.is_member()))
  with check (recipient_id = (select auth.uid()) and (select private.is_member()));

-- 단체 발송도 하나의 트랜잭션으로 처리하고 수신자 전원을 검증한다.
create function public.send_mail(p_recipient_ids uuid[], p_body text default '', p_link text default '') returns integer
language plpgsql security invoker set search_path = '' as $$
declare wanted integer; valid integer; sent integer;
begin
  if not private.is_instructor() then raise insufficient_privilege using message = '강사 계정만 우편을 보낼 수 있습니다.'; end if;
  select count(distinct id) into wanted from unnest(p_recipient_ids) as r(id);
  if wanted < 1 or wanted > 31 or array_position(p_recipient_ids, null) is not null then
    raise invalid_parameter_value using message = '받는 수강생을 선택해주세요.';
  end if;
  select count(*) into valid from public.igloos i join public.members m on m.id = i.owner_id
    where i.owner_id = any(p_recipient_ids) and m.approved and m.role = 'student';
  if valid <> wanted then raise invalid_parameter_value using message = '현재 입주한 수강생만 선택할 수 있습니다.'; end if;
  insert into public.mail_messages(sender_id, recipient_id, body, link)
    select auth.uid(), id, coalesce(p_body, ''), coalesce(p_link, '') from (select distinct unnest(p_recipient_ids) as id) as recipients;
  get diagnostics sent = row_count;
  return sent;
end;
$$;
revoke all on function public.send_mail(uuid[], text, text) from public, anon;
grant execute on function public.send_mail(uuid[], text, text) to authenticated;

-- 우편 내용은 RLS 통과 시에만 전달한다. 공개 마을 상태와 개인 우편만 구독한다.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.igloos, public.mail_messages;
  end if;
end $$;
commit;
