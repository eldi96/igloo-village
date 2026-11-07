-- 게시판 운영자 삭제 권한 검사. 임시 계정과 글은 트랜잭션 안에서만 만들고 전부 롤백한다.
begin;
select set_config('igloo.board_a', gen_random_uuid()::text, true),
       set_config('igloo.board_b', gen_random_uuid()::text, true),
       set_config('igloo.board_mod', gen_random_uuid()::text, true),
       set_config('igloo.board_teacher', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.board_a')::uuid, 'board-a@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.board_b')::uuid, 'board-b@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.board_mod')::uuid, 'board-mod@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.board_teacher')::uuid, 'board-teacher@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.board_a')::uuid, '검증 A', 'student', true),
       (current_setting('igloo.board_b')::uuid, '검증 B', 'student', true),
       (current_setting('igloo.board_mod')::uuid, '검증 운영자', 'student', true),
       (current_setting('igloo.board_teacher')::uuid, '검증 강사', 'instructor', true);
insert into private.chat_members(member_id) values (current_setting('igloo.board_mod')::uuid);

-- A가 글 세 개를 쓴다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.board_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('igloo.post1', public.create_village_board_post('검증 메모 1')::text, true),
       set_config('igloo.post2', public.create_village_board_post('검증 메모 2')::text, true),
       set_config('igloo.post3', public.create_village_board_post('검증 메모 3')::text, true);
do $$ begin
  if public.can_moderate_village_board() then raise exception 'FAIL: student is moderator'; end if;
end $$;
reset role;

-- 일반 학생 B는 남의 글을 지우지 못한다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.board_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.delete_village_board_post(current_setting('igloo.post1')::uuid) then raise exception 'FAIL: other student deleted'; end if;
end $$;
reset role;

-- 개발팀 운영자는 남의 글을 지운다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.board_mod'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not public.can_moderate_village_board() then raise exception 'FAIL: team member not moderator'; end if;
  if not public.delete_village_board_post(current_setting('igloo.post1')::uuid) then raise exception 'FAIL: moderator delete'; end if;
  if public.delete_village_board_post(current_setting('igloo.post1')::uuid) then raise exception 'FAIL: double delete'; end if;
end $$;
reset role;

-- 강사도 지울 수 있고, 작성자는 여전히 자기 글을 지운다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.board_teacher'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not public.delete_village_board_post(current_setting('igloo.post2')::uuid) then raise exception 'FAIL: instructor delete'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.board_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not public.delete_village_board_post(current_setting('igloo.post3')::uuid) then raise exception 'FAIL: author delete'; end if;
end $$;
reset role;

-- 지운 사람이 기록되고, 비로그인은 운영자 확인을 호출하지 못한다.
do $$ begin
  if (select deleted_by from public.village_board_posts where id = current_setting('igloo.post1')::uuid) <> current_setting('igloo.board_mod')::uuid then
    raise exception 'FAIL: deleted_by not recorded';
  end if;
  if has_function_privilege('anon', 'public.can_moderate_village_board()', 'EXECUTE') then raise exception 'FAIL: anon can check moderator'; end if;
  if position('deleted_by' in pg_get_function_result('public.list_village_board_posts(integer,timestamptz,uuid)'::regprocedure)) > 0 then
    raise exception 'FAIL: list exposes deleted_by';
  end if;
end $$;

select 'PASS: board moderation (team, instructor, author delete; student blocked; deleted_by hidden)' as board_moderation;
rollback;
