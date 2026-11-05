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

-- END IGLOO VISIT ANALYTICS
