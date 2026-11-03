-- 임시 계정을 트랜잭션 안에서만 만들고 마지막에 전부 롤백한다.
begin;
select set_config('igloo.test_a', gen_random_uuid()::text, true),
       set_config('igloo.test_b', gen_random_uuid()::text, true),
       set_config('igloo.test_teacher', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.test_a')::uuid, 'student-a@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.test_b')::uuid, 'student-b@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.test_teacher')::uuid, 'teacher@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.test_a')::uuid, '검증 수강생 A', 'student', true),
       (current_setting('igloo.test_b')::uuid, '검증 수강생 B', 'student', true),
       (current_setting('igloo.test_teacher')::uuid, '검증 강사', 'instructor', true);

set local role anon;
do $$ begin
  if (select count(*) from public.igloos) <> 31 then raise exception 'FAIL: anonymous map read'; end if;
  begin update public.igloos set is_public = true where id = 0; raise exception 'FAIL: anonymous map write'; exception when insufficient_privilege then null; end;
  begin perform * from public.projects; raise exception 'FAIL: anonymous project read'; exception when insufficient_privilege then null; end;
  begin perform * from public.mail_messages; raise exception 'FAIL: anonymous mail read'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.claim_igloo(0::smallint);
do $$ begin
  begin perform public.claim_igloo(1::smallint); raise exception 'FAIL: duplicate ownership'; exception when unique_violation then null; end;
  begin update public.members set role = 'instructor' where id = auth.uid(); raise exception 'FAIL: self promotion'; exception when insufficient_privilege then null; end;
end $$;
insert into public.projects(igloo_id, owner_id, title, url) values (0, auth.uid(), '비공개 검증 프로젝트', 'https://example.test/project');
do $$ begin
  if (select count(*) from public.projects where igloo_id = 0) <> 1 then raise exception 'FAIL: owner project read'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.test_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.claim_igloo(1::smallint);
do $$ declare affected integer; begin
  if (select count(*) from public.projects where igloo_id = 0) <> 0 then raise exception 'FAIL: other student private project read'; end if;
  update public.igloos set is_public = true where id = 0;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: other student door change'; end if;
  begin
    perform public.send_mail(array[current_setting('igloo.test_a')::uuid], '허용되면 안 되는 우편', '');
    raise exception 'FAIL: student sends teacher mail';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
update public.igloos set is_public = true where id = 0;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.test_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.projects where igloo_id = 0) <> 1 then raise exception 'FAIL: public project read'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
update public.igloos set is_public = false where id = 0;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.test_teacher'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare sent integer; begin
  if (select count(*) from public.projects where igloo_id = 0) <> 0 then raise exception 'FAIL: instructor sees locked project'; end if;
  begin perform public.claim_igloo(2::smallint); raise exception 'FAIL: instructor claims student home'; exception when insufficient_privilege then null; end;
  select public.send_mail(array[current_setting('igloo.test_a')::uuid, current_setting('igloo.test_b')::uuid], '롤백되는 검증 우편', 'https://example.test/resource') into sent;
  if sent <> 2 then raise exception 'FAIL: batch mail count'; end if;
  if (select count(*) from public.mail_messages where sender_id = auth.uid()) <> 2 then raise exception 'FAIL: sender mail visibility'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare affected integer; begin
  if (select count(*) from public.mail_messages) <> 1 then raise exception 'FAIL: inbox isolation'; end if;
  update public.mail_messages set read_at = now() where recipient_id = current_setting('igloo.test_b')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: marking someone else mail read'; end if;
  update public.mail_messages set read_at = now() where recipient_id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: own mail read marker'; end if;
  begin update public.mail_messages set body = '변조'; raise exception 'FAIL: recipient edits message'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: map grants, unique claims, role protection, private/public projects, instructor access, atomic delivery, inbox isolation, read markers' as security_verification;
rollback;
