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
  latest_project_at timestamptz,
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
  instructions text not null default '' check (char_length(instructions) <= 5000),
  image_path text check (image_path is null or image_path ~ ('^' || owner_id::text || '/[0-9a-f-]+[.]jpg$')),
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now()
);
create index projects_home_time on public.projects(igloo_id, created_at desc);
create index projects_owner on public.projects(owner_id);
alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select, delete on public.projects to authenticated;
grant insert(igloo_id, owner_id, title, description, instructions, image_path, url) on public.projects to authenticated;
grant update(title, description, instructions, image_path, url) on public.projects to authenticated;
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

-- 빛기둥용 마지막 프로젝트 등록 시간. 내용은 드러나지 않고, 사용자가 직접 고칠 수 없다.
create function private.sync_igloo_project_time() returns trigger
language plpgsql security definer set search_path = '' as $$
declare home smallint := coalesce(new.igloo_id, old.igloo_id);
begin
  update public.igloos set latest_project_at = (
    select max(p.created_at) from public.projects p where p.igloo_id = home
  ) where id = home;
  return null;
end;
$$;
revoke all on function private.sync_igloo_project_time() from public, anon, authenticated;
create trigger projects_sync_igloo_time after insert or delete on public.projects
  for each row execute function private.sync_igloo_project_time();

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

-- 초대 코드 가입. 코드는 해시만 저장하고, 수강생 역할로만 승인한다.
create table private.invite_codes (
  code_hash text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
revoke all on private.invite_codes from public, anon, authenticated;
create function private.invite_is_valid(p_code text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.invite_codes c
    where c.active and c.code_hash = encode(pg_catalog.sha256(pg_catalog.convert_to(upper(trim(coalesce(p_code, ''))), 'UTF8')), 'hex')
  );
$$;
revoke all on function private.invite_is_valid(text) from public, anon, authenticated;
create function public.check_invite(p_code text) returns boolean language sql stable security definer set search_path = '' as $$
  select private.invite_is_valid(p_code);
$$;
revoke all on function public.check_invite(text) from public;
grant execute on function public.check_invite(text) to anon, authenticated;
create function public.join_with_invite(p_code text, p_display_name text) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  name text := trim(coalesce(p_display_name, ''));
  result public.members;
begin
  if uid is null then raise exception '먼저 로그인해주세요.'; end if;
  if char_length(name) not between 1 and 40 then raise exception '이름은 1~40자로 입력해주세요.'; end if;
  if not private.invite_is_valid(p_code) then raise exception '초대 코드가 맞지 않아요.'; end if;
  insert into public.members (id, display_name, role, approved)
  values (uid, name, 'student', true)
  on conflict (id) do update set approved = true
  returning * into result;
  return result;
end;
$$;
revoke all on function public.join_with_invite(text, text) from public, anon;
grant execute on function public.join_with_invite(text, text) to authenticated;

-- 대화는 지정한 계정만 쓴다. 목록은 DB에만 두고 저장소에 적지 않는다.
create table private.chat_members (
  member_id uuid primary key references public.members(id) on delete cascade,
  added_at timestamptz not null default now()
);
revoke all on private.chat_members from public, anon, authenticated;
create function private.can_chat() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.chat_members c
    join public.members m on m.id = c.member_id
    where c.member_id = (select auth.uid()) and m.approved
  );
$$;
revoke all on function private.can_chat() from public, anon;
grant execute on function private.can_chat() to authenticated;
-- 화면이 대화 창을 보여줄지 묻는 함수. 자기 권한만 알 수 있다.
create function public.can_use_chat() returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_chat();
$$;
revoke all on function public.can_use_chat() from public, anon;
grant execute on function public.can_use_chat() to authenticated;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references public.members(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500 and btrim(body) <> ''),
  created_at timestamptz not null default now()
);
create index chat_messages_time on public.chat_messages(created_at desc);
create index chat_messages_sender on public.chat_messages(sender_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from public, anon, authenticated;
grant select, delete on public.chat_messages to authenticated;
grant insert(body) on public.chat_messages to authenticated;
create policy chat_read on public.chat_messages for select to authenticated
  using ((select private.can_chat()));
create policy chat_send on public.chat_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select private.can_chat()));
create policy chat_delete_own on public.chat_messages for delete to authenticated
  using (sender_id = (select auth.uid()) and (select private.can_chat()));

-- 도배 방지: 한 사람은 1초에 한 번만 보낼 수 있다.
create function private.chat_rate_limit() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.chat_messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '1 second') then
    raise exception '너무 빨리 보내고 있어요. 잠시 후 다시 보내주세요.';
  end if;
  return new;
end;
$$;
revoke all on function private.chat_rate_limit() from public, anon, authenticated;
create trigger chat_rate_limit before insert on public.chat_messages
  for each row execute function private.chat_rate_limit();

alter publication supabase_realtime add table public.chat_messages;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', false, 5242880, array['image/jpeg']);
create policy project_images_insert on storage.objects for insert to authenticated
with check (bucket_id = 'project-images' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_student()));
create policy project_images_read on storage.objects for select to authenticated
using (bucket_id = 'project-images' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or exists (select 1 from public.projects p where p.image_path = name)
));
create policy project_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'project-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
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

-- IGLOO VISIT ANALYTICS (local integration)

-- 실험에 동의한 사용자를 관리한다. 협업자는 등록하지 않는다.
-- cohort=1: 최초 비교군, cohort>=2: 순차 확대된 참여군.
create table public.visit_participants (
  member_id uuid primary key references public.members(id) on delete cascade,
  cohort smallint not null check (cohort between 1 and 50),
  included_from date not null,
  included_until date,
  created_at timestamptz not null default now(),
  check (included_until is null or included_until >= included_from)
);
create index visit_participants_active on public.visit_participants(included_from, included_until);
alter table public.visit_participants enable row level security;
revoke all on public.visit_participants from public, anon, authenticated;
grant select on public.visit_participants to authenticated;
create policy visit_participants_self_read on public.visit_participants for select to authenticated
  using (member_id = (select auth.uid()) and (select private.is_member()));

-- 한국 날짜 1행에 인정된 방문 횟수와 최근 호출 시각을 저장한다.
create table public.daily_visits (
  member_id uuid not null references public.members(id) on delete cascade,
  visit_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 1 check (visit_count >= 1),
  primary key (member_id, visit_date)
);
create index daily_visits_date on public.daily_visits(visit_date desc);
alter table public.daily_visits enable row level security;
revoke all on public.daily_visits from public, anon, authenticated;

create function private.record_visit_atomic() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  seen_at timestamptz := clock_timestamp();
  target_day date;
begin
  if uid is null or not private.is_member() then return false; end if;
  target_day := (seen_at at time zone 'Asia/Seoul')::date;
  if not exists (
    select 1 from public.visit_participants p
    where p.member_id = uid and p.included_from <= target_day
      and (p.included_until is null or p.included_until >= target_day)
  ) then return false; end if;

  insert into public.daily_visits(member_id, visit_date, first_seen_at, last_seen_at, visit_count)
  values (uid, target_day, seen_at, seen_at, 1)
  on conflict (member_id, visit_date) do update
    set visit_count = public.daily_visits.visit_count
        + case when public.daily_visits.last_seen_at <= excluded.last_seen_at - interval '30 minutes'
               then 1 else 0 end,
        last_seen_at = greatest(public.daily_visits.last_seen_at, excluded.last_seen_at);
  return true;
end;
$$;
revoke all on function private.record_visit_atomic() from public, anon, authenticated;
grant execute on function private.record_visit_atomic() to authenticated;

-- 기존 JS의 recordVisit() 호출 형식은 그대로 유지한다.
create function public.record_visit() returns boolean
language sql volatile security invoker set search_path = '' as $$
  select private.record_visit_atomic();
$$;
revoke all on function public.record_visit() from public, anon, authenticated;
grant execute on function public.record_visit() to authenticated;

-- 이미 있는 get_visit_trend()는 보존한다. 새 횟수 그래프 전용 RPC만 추가한다.
-- 그래프에는 개인별 방문 기록 대신 집계값만 반환한다.
create function private.aggregate_visit_counts(p_days integer)
returns table (
  visit_date date,
  baseline_daily_visits bigint,
  total_daily_visits bigint,
  baseline_cumulative_visits bigint,
  total_cumulative_visits bigint,
  baseline_active integer,
  total_active integer,
  baseline_participants integer,
  total_participants integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_chat() then
    raise insufficient_privilege using message = '개발팀만 관측소 통계를 볼 수 있습니다.';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise invalid_parameter_value using message = '조회 기간은 1~90일이어야 합니다.';
  end if;
  return query
  with days as (
    select d::date as day from generate_series(
      (now() at time zone 'Asia/Seoul')::date - (p_days - 1),
      (now() at time zone 'Asia/Seoul')::date, interval '1 day'
    ) d
  ), daily as (
    select d.day,
      coalesce(sum(v.visit_count) filter (where p.cohort = 1), 0)::bigint as b_visits,
      coalesce(sum(v.visit_count) filter (where p.member_id is not null), 0)::bigint as t_visits,
      count(v.member_id) filter (where p.cohort = 1)::integer as b_active,
      count(v.member_id) filter (where p.member_id is not null)::integer as t_active
    from days d
    left join public.daily_visits v on v.visit_date = d.day
    left join public.visit_participants p
      on p.member_id = v.member_id and p.included_from <= v.visit_date
      and (p.included_until is null or p.included_until >= v.visit_date)
    group by d.day
  )
  select d.day, d.b_visits, d.t_visits,
    (select coalesce(sum(v2.visit_count), 0)::bigint
       from public.daily_visits v2 join public.visit_participants p2 on p2.member_id = v2.member_id
       where p2.cohort = 1 and v2.visit_date <= d.day
         and v2.visit_date >= p2.included_from
         and (p2.included_until is null or v2.visit_date <= p2.included_until)),
    (select coalesce(sum(v2.visit_count), 0)::bigint
       from public.daily_visits v2 join public.visit_participants p2 on p2.member_id = v2.member_id
       where v2.visit_date <= d.day and v2.visit_date >= p2.included_from
         and (p2.included_until is null or v2.visit_date <= p2.included_until)),
    d.b_active, d.t_active,
    (select count(*)::integer from public.visit_participants p3
       where p3.cohort = 1 and p3.included_from <= d.day
         and (p3.included_until is null or p3.included_until >= d.day)),
    (select count(*)::integer from public.visit_participants p3
       where p3.included_from <= d.day
         and (p3.included_until is null or p3.included_until >= d.day))
  from daily d order by d.day;
end;
$$;
revoke all on function private.aggregate_visit_counts(integer) from public, anon, authenticated;
grant execute on function private.aggregate_visit_counts(integer) to authenticated;

create function public.get_visit_counts(p_days integer default 14)
returns table (
  visit_date date,
  baseline_daily_visits bigint,
  total_daily_visits bigint,
  baseline_cumulative_visits bigint,
  total_cumulative_visits bigint,
  baseline_active integer,
  total_active integer,
  baseline_participants integer,
  total_participants integer
)
language sql stable security invoker set search_path = '' as $$
  select * from private.aggregate_visit_counts(p_days);
$$;
revoke all on function public.get_visit_counts(integer) from public, anon, authenticated;
grant execute on function public.get_visit_counts(integer) to authenticated;

-- 개인별 접속 원본은 공개하지 않고, 승인 회원에게 집계값만 제공한다.
-- 원본 RLS를 우회하는 함수는 API 노출이 없는 private 스키마에 둔다.
create function private.aggregate_visit_trend(p_days integer)
returns table (
  visit_date date,
  baseline_total integer,
  baseline_active integer,
  baseline_rate numeric,
  total_participants integer,
  total_active integer,
  total_rate numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_chat() then
    raise insufficient_privilege using message = '개발팀만 관측소 통계를 볼 수 있습니다.';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise invalid_parameter_value using message = '조회 기간은 1~90일이어야 합니다.';
  end if;
  return query
  with days as (
    select d::date as day
    from generate_series(
      ((now() at time zone 'Asia/Seoul')::date - (p_days - 1)),
      (now() at time zone 'Asia/Seoul')::date,
      interval '1 day'
    ) as d
  ), counts as (
    select
      days.day,
      count(p.member_id) filter (where p.cohort = 1)::integer as b_total,
      count(v.member_id) filter (where p.cohort = 1)::integer as b_active,
      count(p.member_id)::integer as t_total,
      count(v.member_id)::integer as t_active
    from days
    left join public.visit_participants p
      on p.included_from <= days.day
       and (p.included_until is null or p.included_until >= days.day)
    left join public.daily_visits v
      on v.member_id = p.member_id and v.visit_date = days.day
    group by days.day
  )
  select
    c.day,
    c.b_total,
    c.b_active,
    round((100.0 * c.b_active / nullif(c.b_total, 0))::numeric, 1),
    c.t_total,
    c.t_active,
    round((100.0 * c.t_active / nullif(c.t_total, 0))::numeric, 1)
  from counts c
  order by c.day;
end;
$$;
revoke all on function private.aggregate_visit_trend(integer) from public, anon, authenticated;
grant execute on function private.aggregate_visit_trend(integer) to authenticated;

-- API 공개 함수는 SECURITY INVOKER. 내부에서 권한 검사한 집계만 전달한다.
create function public.get_visit_trend(p_days integer default 14)
returns table (
  visit_date date,
  baseline_total integer,
  baseline_active integer,
  baseline_rate numeric,
  total_participants integer,
  total_active integer,
  total_rate numeric
)
language sql stable security invoker set search_path = '' as $$
  select * from private.aggregate_visit_trend(p_days);
$$;
revoke all on function public.get_visit_trend(integer) from public, anon, authenticated;
grant execute on function public.get_visit_trend(integer) to authenticated;

create or replace function public.get_member_visit_counts()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  total bigint;
begin
  if uid is null or not (select private.is_member()) then
    raise insufficient_privilege
      using message = '승인된 회원만 조회할 수 있습니다.';
  end if;

  select coalesce(sum(d.visit_count), 0)
  into total
  from public.daily_visits d
  where d.member_id = uid;

  return total;
end;
$$;

revoke all on function public.get_member_visit_counts()
from public, anon, authenticated;

grant execute on function public.get_member_visit_counts()
to authenticated;

-- END IGLOO VISIT ANALYTICS


-- 댓글 답글·삭제 변경 (2026-11-05)
-- 기존 댓글은 보존하고 답글 연결과 삭제 표시만 추가한다.
alter table public.project_comments
  add column parent_id uuid references public.project_comments(id) on delete cascade,
  add column deleted_at timestamptz;
alter table public.project_comments drop constraint project_comments_body_check;
alter table public.project_comments add constraint project_comments_body_check check (
  (deleted_at is null and char_length(body) between 1 and 1000 and btrim(body) <> '')
  or (deleted_at is not null and body = '')
);
create index project_comments_parent_time on public.project_comments(parent_id, created_at);

-- 호출자 권한으로 검사하며, 댓글 수정 권한을 삭제 처리로만 제한한다.
create function private.guard_project_comment_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare parent public.project_comments%rowtype;
begin
  if TG_OP = 'INSERT' then
    if NEW.deleted_at is not null then
      raise exception '삭제된 상태로 댓글을 등록할 수 없어요.' using errcode = '23514';
    end if;
    if NEW.parent_id is not null then
      select * into parent from public.project_comments where id = NEW.parent_id;
      if not found or parent.project_id <> NEW.project_id or parent.parent_id is not null or parent.deleted_at is not null then
        raise exception '같은 프로젝트의 삭제되지 않은 원댓글에만 답글을 남길 수 있어요.' using errcode = '23514';
      end if;
    end if;
  else
    if NEW.id is distinct from OLD.id or NEW.project_id is distinct from OLD.project_id
      or NEW.member_id is distinct from OLD.member_id or NEW.parent_id is distinct from OLD.parent_id
      or NEW.created_at is distinct from OLD.created_at
      or OLD.deleted_at is not null or NEW.deleted_at is null or NEW.body <> '' then
      raise exception '댓글은 삭제 처리만 할 수 있어요.' using errcode = '23514';
    end if;
    NEW.deleted_at := now();
  end if;
  return NEW;
end $$;
revoke all on function private.guard_project_comment_write() from public, anon, authenticated;
create trigger guard_project_comment_write before insert or update on public.project_comments
for each row execute function private.guard_project_comment_write();

grant insert(parent_id) on public.project_comments to authenticated;
grant update(body, deleted_at) on public.project_comments to authenticated;
create policy project_comments_soft_delete on public.project_comments for update to authenticated
using (member_id = (select auth.uid()) and (select private.is_member())
  and exists (select 1 from public.projects p where p.id = project_id))
with check (member_id = (select auth.uid()) and (select private.is_member())
  and exists (select 1 from public.projects p where p.id = project_id));


-- 새 댓글부터 프로젝트 주인에게 알림을 만든다. 기존 우편 테이블은 변경하지 않는다.
create table public.comment_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.members(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 comment_id uuid not null unique references public.project_comments(id) on delete cascade,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index comment_notifications_unread on public.comment_notifications(recipient_id,created_at desc) where read_at is null;
create index comment_notifications_project on public.comment_notifications(project_id);
alter table public.comment_notifications enable row level security;
revoke all on public.comment_notifications from public,anon,authenticated;
grant select on public.comment_notifications to authenticated;
grant update(read_at) on public.comment_notifications to authenticated;
create policy comment_notifications_read on public.comment_notifications for select to authenticated
using (recipient_id=(select auth.uid()) and (select private.is_member()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy comment_notifications_mark_read on public.comment_notifications for update to authenticated
using (recipient_id=(select auth.uid()) and (select private.is_member()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())))
with check (recipient_id=(select auth.uid()) and (select private.is_member()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
-- 브라우저에 타인 알림 생성 권한을 주지 않고 비공개 트리거만 알림을 생성한다.
create function private.notify_project_comment() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 if TG_OP='INSERT' then
   select owner_id into owner from public.projects where id=NEW.project_id;
   if owner is not null and owner<>NEW.member_id then
     insert into public.comment_notifications(recipient_id,project_id,comment_id) values(owner,NEW.project_id,NEW.id);
   end if;
 elsif NEW.deleted_at is not null and OLD.deleted_at is null then
   delete from public.comment_notifications where comment_id=NEW.id;
 end if;
 return NEW;
end $$;
revoke all on function private.notify_project_comment() from public,anon,authenticated;
create trigger notify_project_comment after insert or update of deleted_at on public.project_comments
for each row execute function private.notify_project_comment();
alter publication supabase_realtime add table public.comment_notifications;


-- 알림 본문·수신자·개수는 공개하지 않고 점등할 이글루 ID만 반환한다.
create function public.get_unread_mailbox_homes()
returns table(igloo_id smallint)
language sql stable security definer set search_path = '' as $$
  select distinct p.igloo_id
  from public.comment_notifications n
  join public.projects p on p.id = n.project_id and p.owner_id = n.recipient_id
  join public.igloos i on i.id = p.igloo_id and i.owner_id = n.recipient_id
  where n.read_at is null;
$$;
revoke all on function public.get_unread_mailbox_homes() from public, anon, authenticated;
grant execute on function public.get_unread_mailbox_homes() to anon, authenticated;


-- BEGIN IGLOO ANONYMOUS BOARD
-- IGLOO VILLAGE 익명 자유 메모 게시판 / 적용 전 팀원과 DB 변경 공유
-- 기존 테이블 또는 프로젝트 댓글을 변경하지 않음.


create table if not exists public.village_board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists village_board_posts_feed_idx
  on public.village_board_posts (created_at desc, id desc) where deleted_at is null;
create index if not exists village_board_posts_author_idx
  on public.village_board_posts (author_id);

alter table public.village_board_posts enable row level security;
-- 원본에는 author_id가 있으므로 직접 SELECT/INSERT/UPDATE/DELETE를 모두 차단한다.
revoke all on public.village_board_posts from public, anon, authenticated;

-- 반환 컬럼을 지정해 작성자 ID를 공개 API에 노출하지 않는다.
create or replace function public.list_village_board_posts(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (id uuid, content text, created_at timestamptz, is_mine boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 30 then
    raise exception '조회 개수는 1~30개여야 합니다.' using errcode = '22023';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception '커서의 날짜와 ID는 함께 지정해야 합니다.' using errcode = '22023';
  end if;
  return query
  select p.id, p.content, p.created_at,
         coalesce(p.author_id = (select auth.uid()), false) as is_mine
    from public.village_board_posts as p
   where p.deleted_at is null
     and (p_before_created_at is null or (p.created_at, p.id) < (p_before_created_at, p_before_id))
   order by p.created_at desc, p.id desc
   limit p_limit;
end;
$$;

create or replace function public.create_village_board_post(p_content text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_content text := btrim(coalesce(p_content, ''));
  v_id uuid;
begin
  if v_uid is null or not (select private.is_member()) then
    raise exception '승인된 회원만 작성할 수 있습니다.' using errcode = '42501';
  end if;
  if char_length(v_content) not between 1 and 500 then
    raise exception '메모는 1~500자로 작성해 주세요.' using errcode = '22023';
  end if;
  insert into public.village_board_posts(author_id, content)
  values (v_uid, v_content)
  returning id into v_id;
  return v_id;
end;
$$;

-- 운영자 삭제: 개발팀(private.chat_members)과 강사. 작성 횟수 제한·신고는 없음(임시 게시판).
alter table public.village_board_posts
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
create or replace function private.can_moderate_village_board() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_chat() or private.is_instructor();
$$;
revoke all on function private.can_moderate_village_board() from public, anon;
grant execute on function private.can_moderate_village_board() to authenticated;
create or replace function public.can_moderate_village_board() returns boolean
language sql stable set search_path = '' as $$
  select private.can_moderate_village_board();
$$;
revoke all on function public.can_moderate_village_board() from public, anon;
grant execute on function public.can_moderate_village_board() to authenticated;

create or replace function public.delete_village_board_post(p_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_deleted integer;
begin
  if v_uid is null or not (select private.is_member()) then
    raise exception '승인된 회원만 삭제할 수 있습니다.' using errcode = '42501';
  end if;
  update public.village_board_posts
     set deleted_at = now(), deleted_by = v_uid
   where id = p_id and deleted_at is null
     and (author_id = v_uid or (select private.can_moderate_village_board()));
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.list_village_board_posts(integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.create_village_board_post(text) from public, anon, authenticated;
revoke all on function public.delete_village_board_post(uuid) from public, anon, authenticated;
grant execute on function public.list_village_board_posts(integer, timestamptz, uuid) to anon, authenticated;
grant execute on function public.create_village_board_post(text) to authenticated;
grant execute on function public.delete_village_board_post(uuid) to authenticated;

-- END IGLOO ANONYMOUS BOARD
commit;
-- 기존 스키마 위에 1회 적용. 개발팀 4명 제외 + 고정 5명/신규 사용자 비교.
-- private.chat_members의 현재 4명만 통계 제외 명단에 복사한다. 채팅 권한과 이후 연동하지 않는다.
create table private.visit_exclusions (
  member_id uuid primary key references public.members(id) on delete cascade
);
alter table private.visit_exclusions enable row level security;
revoke all on private.visit_exclusions from public, anon, authenticated;
do $$ begin
  if (select count(*) from private.chat_members) <> 4 then
    raise exception '개발팀 4명 명단을 먼저 확인하세요.';
  end if;
  if (select count(*) from public.visit_participants where cohort=1) <> 5 then
    raise exception '고정 표본 5명 명단을 먼저 확인하세요.';
  end if;
end $$;
insert into private.visit_exclusions select member_id from private.chat_members;

create function private.enroll_visit_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.approved and new.role = 'student'
    and not exists(select 1 from private.visit_exclusions e where e.member_id = new.id) then
    insert into public.visit_participants(member_id, cohort, included_from)
    values(new.id, 2, (now() at time zone 'Asia/Seoul')::date)
    on conflict(member_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.enroll_visit_member() from public, anon, authenticated;
create trigger enroll_visit_member after insert or update of approved, role on public.members
for each row execute function private.enroll_visit_member();
-- 기존 cohort=1과 실제 방문 행은 보존한다. 아직 등록되지 않은 승인 학생만 포함.
insert into public.visit_participants(member_id, cohort, included_from)
select m.id, 2, (now() at time zone 'Asia/Seoul')::date from public.members m
where m.approved and m.role = 'student'
and not exists(select 1 from private.visit_exclusions e where e.member_id=m.id)
on conflict(member_id) do nothing;

create or replace function private.record_visit_atomic() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  seen_at timestamptz := clock_timestamp();
  target_day date;
begin
  if uid is null or not private.is_student()
    or exists(select 1 from private.visit_exclusions e where e.member_id=uid) then return false; end if;
  target_day := (seen_at at time zone 'Asia/Seoul')::date;
  if not exists(select 1 from public.visit_participants p where p.member_id=uid
      and p.included_from <= target_day and (p.included_until is null or p.included_until >= target_day)) then return false; end if;
  insert into public.daily_visits(member_id, visit_date, first_seen_at, last_seen_at, visit_count)
  values(uid, target_day, seen_at, seen_at, 1)
  on conflict(member_id, visit_date) do update
    set visit_count=public.daily_visits.visit_count
      + case when public.daily_visits.last_seen_at <= excluded.last_seen_at - interval '30 minutes' then 1 else 0 end,
      last_seen_at=greatest(public.daily_visits.last_seen_at,excluded.last_seen_at);
  return true;
end;
$$;
revoke all on function private.record_visit_atomic() from public, anon;
grant execute on function private.record_visit_atomic() to authenticated;

create or replace function private.read_visit_experiment(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  expansion date := '2026-11-06';
  actual_expansion date;
  started date;
  result jsonb;
begin
  if not private.can_chat() then raise insufficient_privilege using message='개발팀만 관측소 통계를 볼 수 있습니다.'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise invalid_parameter_value using message='조회 기간은 1~90일이어야 합니다.'; end if;
  select min(p.included_from) into started from public.visit_participants p where p.cohort=1;
  select min(p.included_from) into actual_expansion from public.visit_participants p
    where p.cohort<>1 and p.included_from<=today
    and not exists(select 1 from private.visit_exclusions e where e.member_id=p.member_id);
  expansion := coalesce(actual_expansion,expansion);
  with people as (
    select p.*, m.display_name, md5(p.member_id::text) as participant_key
    from public.visit_participants p join public.members m on m.id=p.member_id
    where not exists(select 1 from private.visit_exclusions e where e.member_id=p.member_id)
  ), days as (
    select d::date as day from generate_series(today-(p_days-1),today,interval '1 day') d
  ), per_person as (
    select d.day as visit_date,p.participant_key,
      case when d.day < p.included_from or (p.included_until is not null and d.day>p.included_until) then null
        else coalesce(v.visit_count,0) end as visits,
      (select coalesce(sum(v2.visit_count),0) from public.daily_visits v2 where v2.member_id=p.member_id
        and v2.visit_date between p.included_from and least(d.day,coalesce(p.included_until,d.day))) as cumulative
    from people p cross join days d left join public.daily_visits v on v.member_id=p.member_id and v.visit_date=d.day
  ), before_days as (
    select d::date as day from generate_series(started,coalesce(actual_expansion-1,today),interval '1 day') d
  ), before_counts as (
    select d.day as visit_date,coalesce(sum(v.visit_count),0) as visits
    from before_days d left join people p on p.cohort=1 and p.included_from<=d.day
      and (p.included_until is null or p.included_until>=d.day)
    left join public.daily_visits v on v.member_id=p.member_id and v.visit_date=d.day group by d.day
  ), compare_days as (
    select d::date as day from generate_series(started,today-1,interval '1 day') d
  ), compare_counts as (
    select d.day,coalesce(sum(v.visit_count),0)::numeric as visits
    from compare_days d left join people p on p.cohort=1 and p.included_from<=d.day
    left join public.daily_visits v on v.member_id=p.member_id and v.visit_date=d.day
      and (p.included_until is null or p.included_until>=d.day) group by d.day
  )
  select jsonb_build_object(
    'today',today,'baseline_start',started,'baseline_end',coalesce(actual_expansion-1,today),'expansion_date',expansion,'actual_expansion_date',actual_expansion,
    'members',coalesce((select jsonb_agg(jsonb_build_object('key',participant_key,'name',display_name,'cohort',cohort,'joined',included_from,'until',included_until) order by cohort,created_at,member_id) from people),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(c) order by visit_date) from (
      select d.visit_date,
        coalesce(sum(d.visits) filter(where p.cohort=1),0) as baseline_daily_visits,
        coalesce(sum(d.visits),0) as total_daily_visits,
        coalesce(sum(d.cumulative) filter(where p.cohort=1),0) as baseline_cumulative_visits,
        coalesce(sum(d.cumulative),0) as total_cumulative_visits,
        count(*) filter(where p.cohort=1 and d.visits>0) as baseline_active,
        count(*) filter(where d.visits>0) as total_active,
        count(*) filter(where p.cohort=1 and d.visits is not null) as baseline_participants,
        count(*) filter(where d.visits is not null) as total_participants
      from per_person d join people p using(participant_key) group by d.visit_date
    ) c),'[]'::jsonb),
    'people_daily',coalesce((select jsonb_agg(to_jsonb(p) order by visit_date,participant_key) from per_person p),'[]'::jsonb),
    'baseline_period',coalesce((select jsonb_agg(to_jsonb(b) order by visit_date) from before_counts b),'[]'::jsonb),
    'comparison',(select jsonb_build_object(
      'before_days',count(*) filter(where actual_expansion is null or day<actual_expansion),'after_days',count(*) filter(where day>=actual_expansion),
      'before_average',avg(visits) filter(where actual_expansion is null or day<actual_expansion),'after_average',avg(visits) filter(where day>=actual_expansion)
    ) from compare_counts)
  ) into result;
  return result;
end;
$$;
revoke all on function private.read_visit_experiment(integer) from public, anon, authenticated;
grant execute on function private.read_visit_experiment(integer) to authenticated;
create function public.get_visit_experiment(p_days integer default 14) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.read_visit_experiment(p_days);
$$;
revoke all on function public.get_visit_experiment(integer) from public, anon, authenticated;
grant execute on function public.get_visit_experiment(integer) to authenticated;
-- 프로젝트 1개 등록 보상. 이미 얻은 해금은 프로젝트 삭제 후에도 유지한다.
alter table public.members add column card_theme text not null default 'glass'
  check(card_theme in ('glass','rose','cream','graphite','mint'));
alter table public.members add column card_theme_unlocked_at timestamptz;
-- 기존 UPDATE(display_name) 권한만 유지. 테마·해금 값은 직접 수정할 수 없다.
create function private.unlock_card_theme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.members set card_theme_unlocked_at=coalesce(card_theme_unlocked_at,new.created_at)
  where id=new.owner_id and card_theme_unlocked_at is null;
  return new;
end;
$$;
revoke all on function private.unlock_card_theme() from public,anon,authenticated;
create trigger unlock_card_theme after insert on public.projects
for each row execute function private.unlock_card_theme();
update public.members m set card_theme_unlocked_at=p.first_project
from (select owner_id,min(created_at) as first_project from public.projects group by owner_id) p
where m.id=p.owner_id and m.card_theme_unlocked_at is null;

create function private.read_igloo_card_theme(p_home integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_member() then raise insufficient_privilege using message='로그인이 필요해요.'; end if;
  select jsonb_build_object('theme',case when m.card_theme_unlocked_at is null then 'glass' else m.card_theme end,
    'unlocked',m.card_theme_unlocked_at is not null,'is_owner',i.owner_id=(select auth.uid())) into result
  from public.igloos i join public.members m on m.id=i.owner_id
  where i.id=p_home and (i.is_public or i.owner_id=(select auth.uid()));
  if result is null then raise insufficient_privilege using message='이글루를 볼 수 없어요.'; end if;
  return result;
end;
$$;
create function private.save_card_theme(p_theme text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_student() then raise insufficient_privilege using message='승인된 수강생만 변경할 수 있어요.'; end if;
  if p_theme is null or p_theme not in ('glass','rose','cream','graphite','mint') then raise invalid_parameter_value using message='테마를 확인해 주세요.'; end if;
  update public.members set card_theme=p_theme where id=(select auth.uid())
    and (p_theme='glass' or card_theme_unlocked_at is not null)
  returning jsonb_build_object('theme',card_theme,'unlocked',card_theme_unlocked_at is not null,'is_owner',true) into result;
  if result is null then raise insufficient_privilege using message='프로젝트를 1개 등록하면 테마가 열려요.'; end if;
  return result;
end;
$$;
revoke all on function private.read_igloo_card_theme(integer),private.save_card_theme(text) from public,anon,authenticated;
grant execute on function private.read_igloo_card_theme(integer),private.save_card_theme(text) to authenticated;
create function public.get_igloo_card_theme(p_home integer) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.read_igloo_card_theme(p_home); $$;
create function public.set_card_theme(p_theme text) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select private.save_card_theme(p_theme); $$;
revoke all on function public.get_igloo_card_theme(integer),public.set_card_theme(text) from public,anon,authenticated;
grant execute on function public.get_igloo_card_theme(integer),public.set_card_theme(text) to authenticated;
-- 프로젝트 2개 보상. 내부 장면과 별개인 외부 발광 색만 저장.
alter table public.members add column exterior_light_unlocked_at timestamptz;
alter table public.igloos add column exterior_light text not null default 'warm'
  check(exterior_light in ('warm','blue','mint','yellow'));
create or replace function private.unlock_card_theme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 동시에 두 프로젝트가 등록돼도 보상 판정이 엇갈리지 않도록 사용자 행을 잠근다.
  perform 1 from public.members where id=new.owner_id for update;
  update public.members set
    card_theme_unlocked_at=coalesce(card_theme_unlocked_at,new.created_at),
    exterior_light_unlocked_at=case when (select count(*) from public.projects where owner_id=new.owner_id)>=2
      then coalesce(exterior_light_unlocked_at,new.created_at) else exterior_light_unlocked_at end
  where id=new.owner_id;
  return new;
end;
$$;
update public.members m set exterior_light_unlocked_at=now()
where exterior_light_unlocked_at is null and (select count(*) from public.projects p where p.owner_id=m.id)>=2;
create function private.reset_exterior_light() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then new.exterior_light:='warm'; end if;
  return new;
end;
$$;
revoke all on function private.reset_exterior_light() from public,anon,authenticated;
create trigger reset_exterior_light before update of owner_id on public.igloos
for each row execute function private.reset_exterior_light();
create function private.read_exterior_light() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_student() then raise insufficient_privilege using message='승인된 수강생만 변경할 수 있어요.';end if;
  select jsonb_build_object('color',i.exterior_light,'unlocked',m.exterior_light_unlocked_at is not null) into result
  from public.members m join public.igloos i on i.owner_id=m.id where m.id=(select auth.uid());
  if result is null then raise insufficient_privilege using message='내 이글루를 먼저 정해 주세요.';end if;
  return result;
end;
$$;
create function private.save_exterior_light(p_color text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare unlocked boolean; saved text;
begin
  if not private.is_student() then raise insufficient_privilege using message='승인된 수강생만 변경할 수 있어요.';end if;
  if p_color is null or p_color not in ('warm','blue','mint','yellow') then raise invalid_parameter_value using message='불빛 색상을 확인해 주세요.';end if;
  select exterior_light_unlocked_at is not null into unlocked from public.members where id=(select auth.uid());
  if p_color<>'warm' and not unlocked then raise insufficient_privilege using message='프로젝트 2개를 등록하면 새 불빛이 열려요.';end if;
  update public.igloos set exterior_light=p_color where owner_id=(select auth.uid()) returning exterior_light into saved;
  if saved is null then raise insufficient_privilege using message='내 이글루를 먼저 정해 주세요.';end if;
  return jsonb_build_object('color',saved,'unlocked',unlocked);
end;
$$;
revoke all on function private.read_exterior_light(),private.save_exterior_light(text) from public,anon,authenticated;
grant execute on function private.read_exterior_light(),private.save_exterior_light(text) to authenticated;
create function public.get_exterior_light() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.read_exterior_light(); $$;
create function public.set_exterior_light(p_color text) returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.save_exterior_light(p_color); $$;
revoke all on function public.get_exterior_light(),public.set_exterior_light(text) from public,anon,authenticated;
grant execute on function public.get_exterior_light(),public.set_exterior_light(text) to authenticated;

-- 관측소와 개발팀 대화는 같은 협업자 명단(private.chat_members)을 사용한다.
create function public.can_view_observatory() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.can_chat();
$$;
revoke all on function public.can_view_observatory() from public, anon;
grant execute on function public.can_view_observatory() to authenticated;
