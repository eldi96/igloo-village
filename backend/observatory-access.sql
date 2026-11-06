-- 기존 서버에 한 번만 적용. 테이블/사용자/방문 기록 변경 없음.
-- 이미 적용된 보상/통계 SQL 전체를 다시 실행하지 않는다.
do $$ begin
  if (select count(*) from private.chat_members) <> 4 then
    raise exception '개발팀 명단이 4명인지 먼저 확인하세요.';
  end if;
end $$;
-- 관측소와 개발팀 대화는 같은 협업자 명단(private.chat_members)을 사용한다.
create function public.can_view_observatory() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.can_chat();
$$;
revoke all on function public.can_view_observatory() from public, anon;
grant execute on function public.can_view_observatory() to authenticated;

create or replace function private.aggregate_visit_counts(p_days integer)
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

create or replace function private.aggregate_visit_trend(p_days integer)
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
