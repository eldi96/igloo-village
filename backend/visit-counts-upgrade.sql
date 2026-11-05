-- IGLOO VILLAGE: 일일 접속 여부 -> 30분 간격 방문 횟수
-- 전제: visit-analytics.sql 적용 완료 / 기존 기록 보존 / 실행 전 팀 승인
-- 이 파일만 SQL Editor에서 1회 실행. schema.sql 전체 실행 금지.
begin;

-- 과거 일별 기록 1건은 방문 1회로 보존한다. 과거의 실제 재방문 횟수는 복원 불가.
alter table public.daily_visits
  add column visit_count integer not null default 1,
  add column last_seen_at timestamptz;
update public.daily_visits set last_seen_at = first_seen_at where last_seen_at is null;
alter table public.daily_visits
  alter column last_seen_at set not null,
  alter column last_seen_at set default now(),
  add constraint daily_visits_visit_count_positive check (visit_count >= 1);

-- 일반 사용자에게 원본 기록 수정 권한을 열지 않는다.
-- 기존 스키마가 부여한 컬럼별 INSERT 권한도 별도로 회수해야 한다.
revoke all on table public.daily_visits from public, anon, authenticated;
revoke insert(member_id, visit_date) on table public.daily_visits from authenticated;
drop policy if exists daily_visits_insert_own_today on public.daily_visits;

-- 유일하게 허용되는 변경 경로: 호출한 자기 계정의 기록만 갱신한다.
-- DB 서버 시각을 사용하므로 브라우저 시간을 조작해도 방문 횟수가 증가하지 않는다.
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
create or replace function public.record_visit() returns boolean
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

commit;
