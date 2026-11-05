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
  if not private.is_member() then raise insufficient_privilege using message='승인된 회원만 통계를 볼 수 있습니다.'; end if;
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
