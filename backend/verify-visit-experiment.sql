-- 모든 시험 데이터와 방문 기록을 롤백한다.
begin;
select set_config('igloo.experiment_test', gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values(current_setting('igloo.experiment_test')::uuid,'experiment@reserved.test','authenticated','authenticated');
insert into public.members(id,display_name,role,approved) values(current_setting('igloo.experiment_test')::uuid,'통계 시험 학생','student',false);
do $$ begin
  if exists(select 1 from public.visit_participants where member_id=current_setting('igloo.experiment_test')::uuid) then raise exception 'FAIL unapproved enrollment'; end if;
end $$;
update public.members set approved=true where id=current_setting('igloo.experiment_test')::uuid;
do $$ begin
  if not exists(select 1 from public.visit_participants where member_id=current_setting('igloo.experiment_test')::uuid and cohort=2) then raise exception 'FAIL automatic cohort 2'; end if;
  if exists(select 1 from public.visit_participants p join private.visit_exclusions e using(member_id)) then raise exception 'FAIL developer enrolled'; end if;
  if (select count(*) from public.visit_participants where cohort=1)<>5 then raise exception 'FAIL baseline changed'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.get_visit_experiment(14);raise exception 'FAIL anonymous read';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.experiment_test'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare payload jsonb; begin
  perform public.record_visit();perform public.record_visit();
  payload:=public.get_visit_experiment(7);
  if not exists(select 1 from jsonb_array_elements(payload->'members') m where m->>'name'='통계 시험 학생' and (m->>'cohort')::integer=2) then raise exception 'FAIL per-user roster';end if;
  if not exists(select 1 from jsonb_array_elements(payload->'people_daily') d where d->>'participant_key'=md5(current_setting('igloo.experiment_test')) and d->>'visit_date'=(now() at time zone 'Asia/Seoul')::date::text and (d->>'visits')::integer=1) then raise exception 'FAIL repeated-call count';end if;
  if payload::text like '%'||current_setting('igloo.experiment_test')||'%' then raise exception 'FAIL raw UUID exposed';end if;
  if exists(select 1 from jsonb_array_elements(payload->'baseline_period') b where (b->>'visit_date')::date >= (payload->>'actual_expansion_date')::date) then raise exception 'FAIL baseline cutoff';end if;
  begin perform public.get_visit_experiment(91);raise exception 'FAIL invalid window';exception when invalid_parameter_value then null;end;
  begin perform * from public.daily_visits;raise exception 'FAIL raw visit access';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.daily_visits set last_seen_at=now()-interval '31 minutes' where member_id=current_setting('igloo.experiment_test')::uuid;
set local role authenticated;
do $$ begin
  perform public.record_visit();
  if public.get_member_visit_counts()<>2 then raise exception 'FAIL repeat visit after 30min';end if;
end $$;
reset role;
-- 실제 개발팀 계정은 record_visit()에서도 제외되며 새 기록이 생기지 않는다.
select set_config('request.jwt.claims',json_build_object('sub',(select member_id from private.visit_exclusions limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if public.record_visit() is distinct from false then raise exception 'FAIL developer record';end if;
end $$;
reset role;
-- 승인 취소 시 조회 불가. 시험 회원만 변경한다.
update public.members set approved=false where id=current_setting('igloo.experiment_test')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.experiment_test'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin perform public.get_visit_experiment(7);raise exception 'FAIL unapproved read';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
