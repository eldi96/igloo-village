-- visit-analytics.sql 적용 후에만 실행한다. 모든 시험 데이터는 ROLLBACK한다.
begin;
select set_config('igloo.visits_test_a', gen_random_uuid()::text, true),
       set_config('igloo.visits_test_b', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.visits_test_a')::uuid, 'visits-a@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.visits_test_b')::uuid, 'visits-b@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.visits_test_a')::uuid, '접속 검증 A', 'student', true),
       (current_setting('igloo.visits_test_b')::uuid, '접속 검증 B', 'student', true);
insert into public.visit_participants(member_id, cohort, included_from)
values (current_setting('igloo.visits_test_a')::uuid, 1, (now() at time zone 'Asia/Seoul')::date),
       (current_setting('igloo.visits_test_b')::uuid, 2, (now() at time zone 'Asia/Seoul')::date + 1);

set local role anon;
do $$ begin
  begin
    perform public.record_visit();
    raise exception 'FAIL: anonymous record_visit';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.get_visit_trend(1);
    raise exception 'FAIL: anonymous trend read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.visits_test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from true then raise exception 'FAIL: enrolled visit'; end if;
  if public.record_visit() is distinct from true then raise exception 'FAIL: repeat visit'; end if;
  if (select baseline_active from public.get_visit_trend(1)) < 1 then raise exception 'FAIL: baseline trend'; end if;
  begin
    perform * from public.daily_visits;
    raise exception 'FAIL: raw visits exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.get_visit_trend(91);
    raise exception 'FAIL: invalid trend window';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.visits_test_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from false then raise exception 'FAIL: future participant recorded'; end if;
  begin
    insert into public.daily_visits(member_id, visit_date)
      values (current_setting('igloo.visits_test_a')::uuid, (now() at time zone 'Asia/Seoul')::date);
    raise exception 'FAIL: student impersonation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.daily_visits where member_id = current_setting('igloo.visits_test_a')::uuid) <> 1 then
    raise exception 'FAIL: daily uniqueness';
  end if;
  if exists (select 1 from public.daily_visits where member_id = current_setting('igloo.visits_test_b')::uuid) then
    raise exception 'FAIL: premature enrollment';
  end if;
end $$;
select 'PASS: visits access, consent cohort, duplicate prevention, protected trend, daily uniqueness' as visit_verification;
rollback;
