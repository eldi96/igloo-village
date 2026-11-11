-- 테스트 계정·코드는 모두 rollback. 운영 초대코드 원문은 이 파일에 넣지 않는다.
begin;
select set_config('igloo.invite_teacher',gen_random_uuid()::text,true),
       set_config('igloo.invite_student',gen_random_uuid()::text,true),
       set_config('igloo.invite_second',gen_random_uuid()::text,true),
       set_config('igloo.teacher_code','AUDIT-TEACHER-'||gen_random_uuid()::text,true),
       set_config('igloo.student_code','AUDIT-STUDENT-'||gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
(current_setting('igloo.invite_teacher')::uuid,'teacher-invite-a@igloo.test','authenticated','authenticated'),
(current_setting('igloo.invite_student')::uuid,'student-invite-a@igloo.test','authenticated','authenticated'),
(current_setting('igloo.invite_second')::uuid,'teacher-invite-b@igloo.test','authenticated','authenticated');
insert into private.invite_codes(code_hash,role,max_uses,expires_at) values
(encode(sha256(convert_to(upper(current_setting('igloo.teacher_code')),'UTF8')),'hex'),'instructor',1,now()+interval '7 days'),
(encode(sha256(convert_to(upper(current_setting('igloo.student_code')),'UTF8')),'hex'),'student',null,null);
set local role anon;
do $$ begin
  if not public.check_invite(current_setting('igloo.teacher_code')) then raise exception 'FAIL: teacher code precheck';end if;
  begin perform public.join_with_invite(current_setting('igloo.teacher_code'),'강사 시험');raise exception 'FAIL: anonymous join';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.invite_teacher'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare result public.members;begin
  result:=public.join_with_invite(' '||lower(current_setting('igloo.teacher_code'))||' ','강사 시험');
  if result.role<>'instructor' or not result.approved or not private.is_instructor() or private.is_student() then raise exception 'FAIL: instructor role';end if;
  if public.check_invite(current_setting('igloo.teacher_code')) then raise exception 'FAIL: reused code valid';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.invite_second'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin perform public.join_with_invite(current_setting('igloo.teacher_code'),'두 번째 강사');raise exception 'FAIL: code reuse';
  exception when raise_exception then if sqlerrm not like '%만료%' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.invite_student'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare result public.members;begin
  result:=public.join_with_invite(current_setting('igloo.student_code'),'수강생 시험');
  if result.role<>'student' or not result.approved or not private.is_student() then raise exception 'FAIL: student compatibility';end if;
  if not public.check_invite(current_setting('igloo.student_code')) then raise exception 'FAIL: unlimited student code';end if;
end $$;
reset role;
update private.invite_codes set uses_count=0 where role='instructor' and code_hash=encode(sha256(convert_to(upper(current_setting('igloo.teacher_code')),'UTF8')),'hex');
set local role authenticated;
do $$ begin
  begin perform public.join_with_invite(current_setting('igloo.teacher_code'),'권한 변경 시도');raise exception 'FAIL: existing student upgraded';
  exception when raise_exception then if sqlerrm not like '%다른 역할%' then raise;end if;end;
  begin perform * from private.invite_codes;raise exception 'FAIL: private invites exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
update private.invite_codes set expires_at=now()-interval '1 second' where code_hash=encode(sha256(convert_to(upper(current_setting('igloo.teacher_code')),'UTF8')),'hex');
do $$ begin
  if public.check_invite(current_setting('igloo.teacher_code')) then raise exception 'FAIL: expired code';end if;
end $$;
rollback;
