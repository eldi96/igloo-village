-- IGLOO VILLAGE 접속 통계 기능 초안
-- 팀 승인 전에는 운영 Supabase SQL Editor에서 실행하지 않는다.
-- 이 파일은 기존 DB에 추가하는 마이그레이션이며, 초기 schema.sql 전체를 재실행하지 않는다.
begin;

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

-- 일별 기록은 회원 1명당 한국 날짜 기준 1건만 저장한다.
create table public.daily_visits (
  member_id uuid not null references public.members(id) on delete cascade,
  visit_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  first_seen_at timestamptz not null default now(),
  primary key (member_id, visit_date)
);
create index daily_visits_date on public.daily_visits(visit_date desc);
alter table public.daily_visits enable row level security;
revoke all on public.daily_visits from public, anon, authenticated;
grant insert(member_id, visit_date) on public.daily_visits to authenticated;
create policy daily_visits_insert_own_today on public.daily_visits for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and visit_date = ((now() at time zone 'Asia/Seoul')::date)
    and (select private.is_member())
    and exists (
      select 1 from public.visit_participants v
      where v.member_id = (select auth.uid())
        and v.included_from <= visit_date
        and (v.included_until is null or v.included_until >= visit_date)
    )
  );

-- 최초 로딩, 재방문, 새로고침 모두 호출 가능하다. 같은 날 재호출은 중복 저장하지 않는다.
-- RLS를 우회하지 않는 SECURITY INVOKER 함수다.
create function public.record_visit() returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  target_day date := (now() at time zone 'Asia/Seoul')::date;
  uid uuid := (select auth.uid());
begin
  if uid is null or not private.is_member() then return false; end if;
  if not exists (
    select 1 from public.visit_participants p
    where p.member_id = uid and p.included_from <= target_day
      and (p.included_until is null or p.included_until >= target_day)
  ) then return false; end if;
  insert into public.daily_visits(member_id, visit_date)
    values (uid, target_day)
    on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.record_visit() from public, anon, authenticated;
grant execute on function public.record_visit() to authenticated;

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

commit;

-- 실제 사용 전 관리자가 실험 참여자를 명시적으로 등록한다(예시, 실행하지 않음).
-- insert into public.visit_participants(member_id, cohort, included_from)
-- values ('실제-회원-UUID'::uuid, 1, (now() at time zone 'Asia/Seoul')::date);
-- 최초 5명은 cohort=1로, 이후 확대 대상은 cohort=2, 3...으로 등록한다.
