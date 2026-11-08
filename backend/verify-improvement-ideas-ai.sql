-- AI 정리 RPC 권한 검사. 임시 계정·글·의견·실행 기록은 트랜잭션 안에서만 만들고 전부 롤백한다.
-- 실제 10분 제한을 피하기 위해 시험 동안만 기존 실행 기록을 지운다(롤백으로 되돌아감).
begin;
delete from private.improvement_summary_runs;
select set_config('igloo.ai_a', gen_random_uuid()::text, true),
       set_config('igloo.ai_mod', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.ai_a')::uuid, 'ai-a@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.ai_mod')::uuid, 'ai-mod@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.ai_a')::uuid, '검증 A', 'student', true),
       (current_setting('igloo.ai_mod')::uuid, '검증 운영자', 'student', true);
insert into private.chat_members(member_id) values (current_setting('igloo.ai_mod')::uuid);
insert into public.village_board_posts(author_id, content) values (current_setting('igloo.ai_a')::uuid, '검증용 채팅 글');
insert into public.improvement_ideas(title, status) values ('검증 옛 검토 대기', 'review');

-- 일반 회원은 채팅 받기·저장 모두 막힌다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.ai_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.start_improvement_summary(10); raise exception 'FAIL: student started';
  exception when insufficient_privilege then null; end;
  begin perform public.save_ai_improvement_ideas('[{"title":"x"}]'); raise exception 'FAIL: student saved';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 운영자: 글을 받고(작성자 없음), 10분 안 재실행은 막히고, 저장하면 옛 검토 대기가 바뀐다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.ai_mod'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from public.start_improvement_summary(50) where content = '검증용 채팅 글') then raise exception 'FAIL: posts not returned'; end if;
  begin perform public.start_improvement_summary(50); raise exception 'FAIL: no rate limit';
  exception when object_not_in_prerequisite_state then null; end;
  begin perform public.save_ai_improvement_ideas('[]'); raise exception 'FAIL: empty saved';
  exception when invalid_parameter_value then null; end;
  begin perform public.save_ai_improvement_ideas('[{"title":"a"},{"title":"b"},{"title":"c"},{"title":"d"}]'); raise exception 'FAIL: 4 saved';
  exception when invalid_parameter_value then null; end;
  if public.save_ai_improvement_ideas('[{"title":"검증 새 의견","summary":"s","category":"엉뚱","mentions":"5"},{"title":"검증 둘","mentions":"abc"}]') <> 2 then raise exception 'FAIL: save count'; end if;
  if exists (select 1 from public.list_improvement_ideas() where title = '검증 옛 검토 대기') then raise exception 'FAIL: old review kept'; end if;
  if not exists (select 1 from public.list_improvement_ideas() where title = '검증 새 의견' and status = 'review' and category = '기능' and mentions = 5) then raise exception 'FAIL: new idea'; end if;
  if not exists (select 1 from public.list_improvement_ideas() where title = '검증 둘' and mentions = 1) then raise exception 'FAIL: bad mentions'; end if;
end $$;
reset role;

-- 비로그인은 실행할 수 없고, 반환 컬럼에 작성자 정보가 없다.
do $$ begin
  if has_function_privilege('anon', 'public.start_improvement_summary(integer)', 'EXECUTE') then raise exception 'FAIL: anon can start'; end if;
  if has_function_privilege('anon', 'public.save_ai_improvement_ideas(jsonb)', 'EXECUTE') then raise exception 'FAIL: anon can save'; end if;
  if position('author' in pg_get_function_result('public.start_improvement_summary(integer)'::regprocedure)) > 0 then raise exception 'FAIL: author exposed'; end if;
end $$;

select 'PASS: AI summary (moderator only, rate limit, 1-3 items, review replaced, anon blocked, no author)' as improvement_ideas_ai;
rollback;
