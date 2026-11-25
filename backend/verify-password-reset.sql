-- password-reset.sql 적용 후 실행. 실제 비밀번호 변경 없이 시험 기록을 모두 롤백한다.
begin;
select set_config('reset.test_member',gen_random_uuid()::text,true),set_config('reset.test_login','recover_'||substr(replace(gen_random_uuid()::text,'-',''),1,8),true);
insert into auth.users(id,email,aud,role) values(current_setting('reset.test_member')::uuid,current_setting('reset.test_login')||'@igloo-village.eldi96.github.io','authenticated','authenticated');
insert into public.members(id,display_name,role,approved) values(current_setting('reset.test_member')::uuid,'초기화 검증','student',true);
select set_config('reset.test_admin',(select id::text from auth.users where email='eldi@igloo-village.eldi96.github.io'),true);
select public.request_password_reset(current_setting('reset.test_login'));
select public.request_password_reset(current_setting('reset.test_login'));
do $$ declare r uuid; target uuid; j integer; begin
 if (select count(*) from private.password_reset_requests where login=current_setting('reset.test_login'))<>1 then raise exception 'FAIL duplicate request';end if;
 select id into r from private.password_reset_requests where login=current_setting('reset.test_login');
 begin perform public.issue_password_reset(r,repeat('a',64),current_setting('reset.test_member')::uuid);raise exception 'FAIL nonadmin issue';exception when insufficient_privilege then null;end;
 begin perform * from public.list_password_reset_requests(current_setting('reset.test_member')::uuid);raise exception 'FAIL nonadmin list';exception when insufficient_privilege then null;end;
 if not public.issue_password_reset(r,repeat('a',64),current_setting('reset.test_admin')::uuid) then raise exception 'FAIL issue';end if;
 for j in 1..5 loop perform public.claim_password_reset(current_setting('reset.test_login'),repeat('b',64),repeat('c',48));end loop;
 if (select status from private.password_reset_requests where id=r)<>'locked' then raise exception 'FAIL five attempts';end if;
 perform public.request_password_reset(current_setting('reset.test_login'));
 if (select count(*) from private.password_reset_requests where login=current_setting('reset.test_login'))<>1 then raise exception 'FAIL locked creates second request';end if;
 if not public.issue_password_reset(r,repeat('d',64),current_setting('reset.test_admin')::uuid) then raise exception 'FAIL reissue';end if;
 if public.claim_password_reset(current_setting('reset.test_login'),repeat('a',64),repeat('c',48)) is not null then raise exception 'FAIL old token works';end if;
 target:=public.claim_password_reset(current_setting('reset.test_login'),repeat('d',64),repeat('c',48));
 if target is distinct from current_setting('reset.test_member')::uuid then raise exception 'FAIL correct claim';end if;
 if public.claim_password_reset(current_setting('reset.test_login'),repeat('d',64),repeat('e',48)) is not null then raise exception 'FAIL concurrent claim';end if;
 if public.issue_password_reset(r,repeat('f',64),current_setting('reset.test_admin')::uuid) then raise exception 'FAIL reissue during processing';end if;
 update private.password_reset_requests set claimed_at=now()-interval '6 minutes' where id=r;
 if not public.issue_password_reset(r,repeat('f',64),current_setting('reset.test_admin')::uuid) then raise exception 'FAIL stale processing recovery';end if;
 update private.password_reset_requests set expires_at=now()-interval '1 second' where id=r;
 if public.claim_password_reset(current_setting('reset.test_login'),repeat('f',64),repeat('e',48)) is not null then raise exception 'FAIL expired token';end if;
 perform public.issue_password_reset(r,repeat('f',64),current_setting('reset.test_admin')::uuid);
 perform public.claim_password_reset(current_setting('reset.test_login'),repeat('f',64),repeat('e',48));
 perform public.finish_password_reset(current_setting('reset.test_login'),repeat('e',48),true);
 if public.claim_password_reset(current_setting('reset.test_login'),repeat('f',64),repeat('c',48)) is not null then raise exception 'FAIL replay after complete';end if;
 if exists(select 1 from private.password_reset_requests where id=r and token_hash is not null) then raise exception 'FAIL completed hash retained';end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.request_password_reset('unknown');raise exception 'FAIL anon RPC';exception when insufficient_privilege then null;end;
 begin perform * from private.password_reset_requests;raise exception 'FAIL anon table read';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform * from public.list_password_reset_requests(current_setting('reset.test_admin')::uuid);raise exception 'FAIL direct client list';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: owner-only issuance, single active request, attempts, expiry, reissue, claim locking, recovery, replay and grants (rolled back)' as result;
