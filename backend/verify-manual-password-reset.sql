-- switch_to_manual_password_reset 적용 후 실행. 시험 계정/요청/한도는 모두 롤백.
begin;
select set_config('manual.test_member',gen_random_uuid()::text,true),set_config('manual.test_login','recover_'||substr(replace(gen_random_uuid()::text,'-',''),1,8),true);
insert into auth.users(id,email,aud,role) values(current_setting('manual.test_member')::uuid,current_setting('manual.test_login')||'@igloo-village.eldi96.github.io','authenticated','authenticated');
insert into public.members(id,display_name,role,approved) values(current_setting('manual.test_member')::uuid,'수동 초기화 검증','student',true);
insert into private.password_reset_limits values('manual-global','request',0,now()) on conflict(bucket,action) do update set hits=0,started_at=now();
set local role anon;
select public.request_manual_password_reset(current_setting('manual.test_login'));
select public.request_manual_password_reset(current_setting('manual.test_login'));
select public.request_manual_password_reset('zz_test_unknown_id');
do $$ begin
 begin perform * from public.list_manual_password_reset_requests();raise exception 'FAIL anon list';exception when insufficient_privilege then null;end;
 begin perform * from private.password_reset_requests;raise exception 'FAIL anon private table';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.password_reset_requests where login=current_setting('manual.test_login'))<>1 then raise exception 'FAIL duplicate request';end if;
 if exists(select 1 from private.password_reset_requests where login='zz_test_unknown_id') then raise exception 'FAIL unknown account request';end if;
 if has_function_privilege('service_role','public.issue_password_reset(uuid,text,uuid)','execute') or has_function_privilege('service_role','public.claim_password_reset(text,text,text)','execute') then raise exception 'FAIL old automatic grants';end if;
end $$;
select set_config('manual.test_request',(select id::text from private.password_reset_requests where login=current_setting('manual.test_login')),true);
select set_config('request.jwt.claim.sub',current_setting('manual.test_member'),true);
set local role authenticated;
do $$ begin
 begin perform * from public.list_manual_password_reset_requests();raise exception 'FAIL other member list';exception when insufficient_privilege then null;end;
 begin perform public.resolve_manual_password_reset(current_setting('manual.test_request')::uuid,'completed');raise exception 'FAIL other member resolve';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- 완료 이력 110건보다 오래된 대기 요청도 목록에서 사라지지 않아야 한다.
insert into private.password_reset_requests(member_id,login,status,created_at)
 select current_setting('manual.test_member')::uuid,current_setting('manual.test_login'),'completed',now()+n*interval '1 second' from generate_series(1,110)n;
select set_config('request.jwt.claim.sub','f5c056bb-0428-4b89-834c-b849921816f6',true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.list_manual_password_reset_requests() where id=current_setting('manual.test_request')::uuid) then raise exception 'FAIL pending hidden by history';end if;
 begin perform public.resolve_manual_password_reset(current_setting('manual.test_request')::uuid,'issued');raise exception 'FAIL invalid status';exception when invalid_parameter_value then null;end;
 perform public.resolve_manual_password_reset(current_setting('manual.test_request')::uuid,'rejected');
end $$;
reset role;
do $$ begin
 if (select status from private.password_reset_requests where id=current_setting('manual.test_request')::uuid)<>'rejected' then raise exception 'FAIL owner reject';end if;
end $$;
-- 本人 비밀번호 자체는 한 번도 갱신하지 않는다. 완료 표시만 시험한다.
update private.password_reset_requests set status='pending' where id=current_setting('manual.test_request')::uuid;
set local role authenticated;
select public.resolve_manual_password_reset(current_setting('manual.test_request')::uuid,'completed');
reset role;
do $$ begin
 if (select status from private.password_reset_requests where id=current_setting('manual.test_request')::uuid)<>'completed' then raise exception 'FAIL owner complete';end if;
end $$;
-- 한도 소진 시 신규 요청을 쓰지 않고 동일한 빈 응답을 유지.
update private.password_reset_limits set hits=100,started_at=now() where bucket='manual-global' and action='request';
select public.request_manual_password_reset(current_setting('manual.test_login'));
do $$ begin
 if (select hits from private.password_reset_limits where bucket='manual-global' and action='request')<>101 then raise exception 'FAIL limit accounting';end if;
 if exists(select 1 from private.password_reset_requests where login=current_setting('manual.test_login') and status='pending') then raise exception 'FAIL limit inserts';end if;
end $$;
rollback;
select 'PASS: anonymous request, deduplication, unknown login, owner-only list/resolve, pending priority, old grants revoked, global limit; all fixtures rolled back' as result;
