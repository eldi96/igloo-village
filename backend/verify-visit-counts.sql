-- visit-counts-upgrade.sql 적용 후 실행. 시험용 회원·방문·변경은 전부 ROLLBACK.
-- 기존 verify-visits.sql은 하루 1회 기록 로직을 전제로 하므로 이 파일로 교체한다.
begin;
select set_config('igloo.count_test_a', gen_random_uuid()::text, true),
       set_config('igloo.count_test_b', gen_random_uuid()::text, true),
       set_config('igloo.count_test_future', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.count_test_a')::uuid, 'counts-a@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.count_test_b')::uuid, 'counts-b@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.count_test_future')::uuid, 'counts-future@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.count_test_a')::uuid, '접속 횟수 A', 'student', true),
       (current_setting('igloo.count_test_b')::uuid, '접속 횟수 B', 'student', true),
       (current_setting('igloo.count_test_future')::uuid, '미참여 C', 'student', true);
insert into public.visit_participants(member_id, cohort, included_from)
values (current_setting('igloo.count_test_a')::uuid, 1, (now() at time zone 'Asia/Seoul')::date),
       (current_setting('igloo.count_test_b')::uuid, 2, (now() at time zone 'Asia/Seoul')::date),
       (current_setting('igloo.count_test_future')::uuid, 2, (now() at time zone 'Asia/Seoul')::date + 1)
on conflict(member_id) do update set cohort=excluded.cohort,included_from=excluded.included_from;
-- 운영 DB에 기존 참여자 기록이 있어도 시험 증가분만 비교한다.
select set_config('igloo.count_start_baseline',
  (select coalesce(sum(v.visit_count),0)::text from public.daily_visits v
    join public.visit_participants p on p.member_id = v.member_id
   where p.cohort = 1 and v.visit_date = (now() at time zone 'Asia/Seoul')::date
     and p.included_from <= v.visit_date
     and (p.included_until is null or p.included_until >= v.visit_date)),true),
       set_config('igloo.count_start_total',
  (select coalesce(sum(v.visit_count),0)::text from public.daily_visits v
    join public.visit_participants p on p.member_id = v.member_id
   where v.visit_date = (now() at time zone 'Asia/Seoul')::date
     and p.included_from <= v.visit_date
     and (p.included_until is null or p.included_until >= v.visit_date)),true);

set local role anon;
do $$ begin
  begin
    perform public.record_visit();
    raise exception 'FAIL: anonymous record_visit';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.get_visit_counts(1);
    raise exception 'FAIL: anonymous get_visit_counts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 시험 사용자 A: 최초 호출 1회, 이어진 즉시 재호출은 1회로 유지.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.count_test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from true then raise exception 'FAIL: first visit'; end if;
  if public.record_visit() is distinct from true then raise exception 'FAIL: same-session repeat'; end if;
  begin
    perform * from public.daily_visits;
    raise exception 'FAIL: raw visit SELECT exposed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.daily_visits(member_id, visit_date)
      values (current_setting('igloo.count_test_b')::uuid, (now() at time zone 'Asia/Seoul')::date);
    raise exception 'FAIL: participant spoofed other member';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.get_visit_counts(91);
    raise exception 'FAIL: invalid history range';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

do $$ begin
  if (select visit_count from public.daily_visits where member_id = current_setting('igloo.count_test_a')::uuid) <> 1 then
    raise exception 'FAIL: duplicate calls counted';
  end if;
end $$;

-- 시간 흐름은 ROLLBACK 트랜잭션 내에서만 시뮬레이션한다.
-- 최근 호출이 15분 전이라면 다음 호출에서도 새로운 방문이 아님.
update public.daily_visits set last_seen_at = clock_timestamp() - interval '15 minutes'
 where member_id = current_setting('igloo.count_test_a')::uuid;
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from true then raise exception 'FAIL: short-gap visit'; end if;
end $$;
reset role;
do $$ begin
  if (select visit_count from public.daily_visits where member_id = current_setting('igloo.count_test_a')::uuid) <> 1 then
    raise exception 'FAIL: under-30-minute repeat counted';
  end if;
end $$;

-- 최근 호출이 31분 전이라면 재방문 1회를 인정.
update public.daily_visits set last_seen_at = clock_timestamp() - interval '31 minutes'
 where member_id = current_setting('igloo.count_test_a')::uuid;
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from true then raise exception 'FAIL: long-gap visit'; end if;
  if (select baseline_daily_visits from public.get_visit_counts(1)) <> current_setting('igloo.count_start_baseline')::bigint + 2 then
    raise exception 'FAIL: baseline visits must equal 2';
  end if;
end $$;
reset role;

-- 시험 사용자 B: 이후 참여자(비교군 외) 1회 방문.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.count_test_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from true then raise exception 'FAIL: expansion cohort visit'; end if;
  if (select total_daily_visits from public.get_visit_counts(1)) <> current_setting('igloo.count_start_total')::bigint + 3 then
    raise exception 'FAIL: total visits must equal 3';
  end if;
  if (select baseline_cumulative_visits from public.get_visit_counts(1)) < 2 then
    raise exception 'FAIL: baseline cumulative visits';
  end if;
end $$;
reset role;

-- 아직 포함되지 않은 사용자 C는 인정되지 않음.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.count_test_future'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from false then raise exception 'FAIL: future participant counted'; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.daily_visits
      where member_id = any(array[current_setting('igloo.count_test_a')::uuid, current_setting('igloo.count_test_b')::uuid])) <> 2 then
    raise exception 'FAIL: one daily row per member';
  end if;
  if exists (select 1 from public.daily_visits where member_id = current_setting('igloo.count_test_future')::uuid) then
    raise exception 'FAIL: future participant row exists';
  end if;
  if has_table_privilege('authenticated','public.daily_visits','SELECT') or has_table_privilege('authenticated','public.daily_visits','UPDATE')
     or has_column_privilege('authenticated','public.daily_visits','member_id','INSERT') then
    raise exception 'FAIL: daily_visits direct grants';
  end if;
end $$;
select 'PASS: visit counts, 30-minute debounce, baseline vs total, protected rows, future cohort, RLS' as verification;
rollback;
