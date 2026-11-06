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
insert into public.projects(igloo_id, owner_id, title, url, description, instructions, image_path)
values (0, auth.uid(), '비공개 검증 프로젝트', 'https://example.test/project', '직접 작성한 설명', '첫 단계', auth.uid()::text || '/00000000-0000-4000-8000-000000000000.jpg');
do $$ begin
  if not exists (select 1 from public.projects where owner_id = auth.uid() and instructions = '첫 단계' and description = '직접 작성한 설명') then
    raise exception 'FAIL: manual project fields';
  end if;
  begin
    update public.projects set image_path = '00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000.jpg' where owner_id = auth.uid();
    raise exception 'FAIL: foreign image path';
  exception when check_violation then null; end;
end $$;
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
do $$ begin
  if not exists (select 1 from pg_class where oid = 'public.project_comments'::regclass and relrowsecurity) or not exists (select 1 from pg_class where oid = 'public.project_reactions'::regclass and relrowsecurity) then raise exception 'FAIL: feedback RLS'; end if;
  if has_table_privilege('anon', 'public.project_comments', 'SELECT') or has_table_privilege('anon', 'public.project_reactions', 'INSERT') then raise exception 'FAIL: anonymous feedback grants'; end if;
end $$;
select 'PASS: map grants, unique claims, role protection, private/public projects, instructor access, atomic delivery, inbox isolation, read markers' as security_verification;
-- 상세 기능 검증은 verify-comment-replies.sql의 독립 롤백 시험으로 실행한다.
do $$ begin
  if not has_column_privilege('authenticated', 'public.project_comments', 'parent_id', 'INSERT')
    or not has_column_privilege('authenticated', 'public.project_comments', 'deleted_at', 'UPDATE')
    or has_column_privilege('authenticated', 'public.project_comments', 'member_id', 'UPDATE')
    or has_table_privilege('authenticated', 'public.project_comments', 'DELETE') then
    raise exception 'FAIL: comment reply/delete column grants';
  end if;
end $$;
do $$ begin
  if has_function_privilege('anon','public.get_visit_experiment(integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.get_visit_experiment(integer)','EXECUTE')
    or has_table_privilege('authenticated','private.visit_exclusions','SELECT') then
    raise exception 'FAIL: experiment read grants';
  end if;
end $$;
do $$ begin
  if has_column_privilege('authenticated','public.members','card_theme','UPDATE')
    or has_column_privilege('authenticated','public.members','card_theme_unlocked_at','UPDATE')
    or has_function_privilege('anon','public.set_card_theme(text)','EXECUTE') then
    raise exception 'FAIL: card theme reward grants';
  end if;
end $$;
do $$ begin
  if has_column_privilege('authenticated','public.igloos','exterior_light','UPDATE')
    or has_column_privilege('authenticated','public.members','exterior_light_unlocked_at','UPDATE')
    or has_function_privilege('anon','public.set_exterior_light(text)','EXECUTE') then
    raise exception 'FAIL: exterior light reward grants';
  end if;
end $$;
do $$ begin
  if has_function_privilege('anon','public.can_view_observatory()','EXECUTE')
    or not has_function_privilege('authenticated','public.can_view_observatory()','EXECUTE')
    or has_table_privilege('authenticated','private.chat_members','SELECT') then
    raise exception 'FAIL: observatory access grants';
  end if;
end $$;
rollback;
