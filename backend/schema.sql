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
  if not private.is_member() then
    raise insufficient_privilege using message = '승인된 회원만 접속 통계를 볼 수 있습니다.';
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
  if not private.is_member() then
    raise insufficient_privilege using message = '승인된 회원만 접속 통계를 볼 수 있습니다.';
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
      count(v.member_id) filter (where p.member_id is not null)::integer as t_active
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
commit;
