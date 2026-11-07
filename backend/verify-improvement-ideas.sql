-- 개선 의견 좋아요/싫어요 권한 검사. 임시 계정과 의견은 트랜잭션 안에서만 만들고 전부 롤백한다.
begin;
select set_config('igloo.idea_a', gen_random_uuid()::text, true),
       set_config('igloo.idea_b', gen_random_uuid()::text, true),
       set_config('igloo.idea_mod', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.idea_a')::uuid, 'idea-a@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.idea_b')::uuid, 'idea-b@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.idea_mod')::uuid, 'idea-mod@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.idea_a')::uuid, '검증 A', 'student', true),
       (current_setting('igloo.idea_b')::uuid, '검증 B', 'student', true),
       (current_setting('igloo.idea_mod')::uuid, '검증 운영자', 'student', true);
insert into private.chat_members(member_id) values (current_setting('igloo.idea_mod')::uuid);
with made as (
  insert into public.improvement_ideas(title, summary, category, status)
  values ('검증 의견', '검증용', '기능', 'review') returning id
)
select set_config('igloo.idea1', id::text, true) from made;

-- 검토 대기 의견은 일반 회원에게 보이지 않고, 상태 변경과 반응도 막힌다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.idea_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.list_improvement_ideas() where id = current_setting('igloo.idea1')::uuid) then raise exception 'FAIL: review idea visible to student'; end if;
  begin perform public.set_improvement_idea_status(current_setting('igloo.idea1')::uuid, 'voting'); raise exception 'FAIL: student changed status';
  exception when insufficient_privilege then null; end;
  begin perform public.react_improvement_idea(current_setting('igloo.idea1')::uuid, 1); raise exception 'FAIL: reacted to review idea';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- 운영자는 검토 대기를 보고 공개한다. 잘못된 상태는 거부된다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.idea_mod'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from public.list_improvement_ideas() where id = current_setting('igloo.idea1')::uuid and status = 'review') then raise exception 'FAIL: moderator cannot see review'; end if;
  if not public.set_improvement_idea_status(current_setting('igloo.idea1')::uuid, 'voting') then raise exception 'FAIL: publish'; end if;
  begin perform public.set_improvement_idea_status(current_setting('igloo.idea1')::uuid, 'bogus'); raise exception 'FAIL: bad status';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- A는 좋아요. 잘못된 값은 거부된다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.idea_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.react_improvement_idea(current_setting('igloo.idea1')::uuid, 1::smallint);
  if (select ups from public.list_improvement_ideas() where id = current_setting('igloo.idea1')::uuid) <> 1 then raise exception 'FAIL: up'; end if;
  if (select my_value from public.list_improvement_ideas() where id = current_setting('igloo.idea1')::uuid) <> 1 then raise exception 'FAIL: my_value'; end if;
  begin perform public.react_improvement_idea(current_setting('igloo.idea1')::uuid, 2::smallint); raise exception 'FAIL: bad value';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- B는 싫어요 → 좋아요로 바꾸고 → 취소한다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.idea_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.react_improvement_idea(current_setting('igloo.idea1')::uuid, (-1)::smallint);
  if (select downs from public.list_improvement_ideas() where id = current_setting('igloo.idea1')::uuid) <> 1 then raise exception 'FAIL: down'; end if;
  perform public.react_improvement_idea(current_setting('igloo.idea1')::uuid, 1::smallint);
  if (select ups from public.list_improvement_ideas() where id = current_setting('igloo.idea1')::uuid) <> 2 then raise exception 'FAIL: switch'; end if;
  perform public.react_improvement_idea(current_setting('igloo.idea1')::uuid, 0::smallint);
  if (select ups from public.list_improvement_ideas() where id = current_setting('igloo.idea1')::uuid) <> 1 then raise exception 'FAIL: cancel'; end if;
end $$;
reset role;

-- 비로그인은 목록만 읽고, 반환 컬럼에 누른 사람 정보가 없다.
do $$ begin
  if has_function_privilege('anon', 'public.react_improvement_idea(uuid,smallint)', 'EXECUTE') then raise exception 'FAIL: anon can react'; end if;
  if has_function_privilege('anon', 'public.set_improvement_idea_status(uuid,text)', 'EXECUTE') then raise exception 'FAIL: anon can set status'; end if;
  if not has_function_privilege('anon', 'public.list_improvement_ideas()', 'EXECUTE') then raise exception 'FAIL: anon cannot list'; end if;
  if position('member' in pg_get_function_result('public.list_improvement_ideas()'::regprocedure)) > 0 then raise exception 'FAIL: list exposes member'; end if;
end $$;

select 'PASS: improvement ideas (review hidden, moderator publish, like/dislike switch and cancel, anon read-only, no voter exposed)' as improvement_ideas;
rollback;
