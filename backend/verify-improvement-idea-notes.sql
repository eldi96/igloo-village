-- 운영자 한마디 권한 검사. 임시 계정과 의견은 트랜잭션 안에서만 만들고 전부 롤백한다.
begin;
select set_config('igloo.note_a', gen_random_uuid()::text, true),
       set_config('igloo.note_mod', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.note_a')::uuid, 'note-a@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.note_mod')::uuid, 'note-mod@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.note_a')::uuid, '검증 A', 'student', true),
       (current_setting('igloo.note_mod')::uuid, '검증 운영자', 'student', true);
insert into private.chat_members(member_id) values (current_setting('igloo.note_mod')::uuid);
with made as (insert into public.improvement_ideas(title, status) values ('검증 한마디 의견', 'voting') returning id)
select set_config('igloo.note_idea', id::text, true) from made;

-- 일반 회원은 한마디를 못 단다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.note_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.set_improvement_idea_note(current_setting('igloo.note_idea')::uuid, 'x'); raise exception 'FAIL: student wrote note';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 운영자는 달고(앞뒤 공백 정리), 81자는 거부되고, 비우면 지워진다. 일반 회원도 목록에서 본다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.note_mod'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not public.set_improvement_idea_note(current_setting('igloo.note_idea')::uuid, '  난이도 높음 ㅠㅠ  ') then raise exception 'FAIL: set'; end if;
  begin perform public.set_improvement_idea_note(current_setting('igloo.note_idea')::uuid, repeat('가', 81)); raise exception 'FAIL: 81 chars';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.note_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if (select note from public.list_improvement_ideas() where id = current_setting('igloo.note_idea')::uuid) <> '난이도 높음 ㅠㅠ' then raise exception 'FAIL: note not listed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.note_mod'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.set_improvement_idea_note(current_setting('igloo.note_idea')::uuid, '');
  if (select note from public.list_improvement_ideas() where id = current_setting('igloo.note_idea')::uuid) <> '' then raise exception 'FAIL: clear'; end if;
end $$;
reset role;

do $$ begin
  if has_function_privilege('anon', 'public.set_improvement_idea_note(uuid,text)', 'EXECUTE') then raise exception 'FAIL: anon can write'; end if;
  if not has_function_privilege('anon', 'public.list_improvement_ideas()', 'EXECUTE') then raise exception 'FAIL: anon cannot list'; end if;
end $$;

select 'PASS: improvement idea notes (moderator only, trim, 80 limit, clear, visible to all)' as improvement_idea_notes;
rollback;
