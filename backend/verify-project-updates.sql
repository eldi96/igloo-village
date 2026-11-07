-- 프로젝트 업데이트 알리기 권한 검사. 빈 이글루 하나와 임시 계정·프로젝트를 트랜잭션 안에서만 쓰고 전부 롤백한다.
begin;
select set_config('igloo.pa', gen_random_uuid()::text, true),
       set_config('igloo.pb', gen_random_uuid()::text, true),
       set_config('igloo.pp', gen_random_uuid()::text, true);
select set_config('igloo.ph', (select id::text from public.igloos where owner_id is null order by id limit 1), true);
do $$ begin if current_setting('igloo.ph', true) is null then raise exception 'No free fixture home'; end if; end $$;
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.pa')::uuid, 'upd-a-' || current_setting('igloo.pa') || '@test.invalid', 'authenticated', 'authenticated'),
       (current_setting('igloo.pb')::uuid, 'upd-b-' || current_setting('igloo.pb') || '@test.invalid', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.pa')::uuid, 'update test A', 'student', true),
       (current_setting('igloo.pb')::uuid, 'update test B', 'student', true);
update public.igloos set owner_id = current_setting('igloo.pa')::uuid, is_public = true, claimed_at = now()
 where id = current_setting('igloo.ph')::smallint and owner_id is null;
insert into public.projects(id, igloo_id, owner_id, title, url)
values (current_setting('igloo.pp')::uuid, current_setting('igloo.ph')::smallint, current_setting('igloo.pa')::uuid, 'update test', 'https://example.test');

-- 다른 회원은 남의 프로젝트를 알리지 못한다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.pb'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.announce_project_update(current_setting('igloo.pp')::uuid, '남의 것');
    raise exception 'FAIL: other member announced';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 주인은 알릴 수 있고(메모 앞뒤 공백 제거), 10분 안에는 다시 알리지 못한다. 너무 긴 메모는 거부된다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.pa'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.announce_project_update(current_setting('igloo.pp')::uuid, repeat('가', 121));
    raise exception 'FAIL: long note accepted';
  exception when invalid_parameter_value then null; end;
  if public.announce_project_update(current_setting('igloo.pp')::uuid, '  로그인 화면을 새로 만들었어요  ') is null then raise exception 'FAIL: owner announce'; end if;
  if (select update_note from public.projects where id = current_setting('igloo.pp')::uuid) <> '로그인 화면을 새로 만들었어요' then raise exception 'FAIL: note not trimmed'; end if;
  begin perform public.announce_project_update(current_setting('igloo.pp')::uuid, '또');
    raise exception 'FAIL: announced twice within 10 minutes';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- 10분이 지나면 메모 없이 다시 알릴 수 있다(메모는 비워진다). 비로그인은 호출 권한이 없다.
update public.projects set announced_at = now() - interval '11 minutes' where id = current_setting('igloo.pp')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.pa'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.announce_project_update(current_setting('igloo.pp')::uuid, null);
  if (select update_note from public.projects where id = current_setting('igloo.pp')::uuid) is not null then raise exception 'FAIL: note not cleared'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.announce_project_update(uuid,text)', 'EXECUTE') then raise exception 'FAIL: anon can announce'; end if;
end $$;

select 'PASS: project updates (owner only, 10-minute limit, note trimmed and capped, anon blocked)' as project_updates;
rollback;
