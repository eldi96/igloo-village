-- 자료 분류 권한 검사. 임시 계정·분류·자료는 트랜잭션 안에서만 만들고 전부 롤백한다.
begin;
select set_config('igloo.cat_s', gen_random_uuid()::text, true), set_config('igloo.cat_i', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.cat_s')::uuid, 'cat-s@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.cat_i')::uuid, 'cat-i@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.cat_s')::uuid, '검증 수강생', 'student', true),
       (current_setting('igloo.cat_i')::uuid, '검증 강사', 'instructor', true);

-- 수강생: 분류를 보지만 추가하지 못한다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.cat_s'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.material_categories where id in ('meeting', 'website', 'youtube', 'lecture')) <> 4 then raise exception 'FAIL: defaults not visible'; end if;
  begin insert into public.material_categories(id, label) values ('c-test0001', '수강생 분류'); raise exception 'FAIL: student added category';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 강사: 추가·이름 바꾸기, 새 분류로 자료 등록, 자료가 있으면 삭제 거부, 비우면 삭제, 없는 분류의 자료는 거부.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.cat_i'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare n integer; begin
  insert into public.material_categories(id, label, sort_order) values ('c-test0001', '과제', 50);
  begin insert into public.material_categories(id, label) values ('c-test0002', ' 과제 '); raise exception 'FAIL: duplicate label';
  exception when unique_violation then null; end;
  update public.material_categories set label = '과제 안내' where id = 'c-test0001'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: rename'; end if;
  insert into public.instructor_materials(category, title, url) values ('c-test0001', '분류 검증', 'https://example.com');
  begin delete from public.material_categories where id = 'c-test0001'; raise exception 'FAIL: deleted category in use';
  exception when foreign_key_violation then null; end;
  delete from public.instructor_materials where title = '분류 검증';
  delete from public.material_categories where id = 'c-test0001'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: delete empty category'; end if;
  begin insert into public.instructor_materials(category, title, url) values ('nope', 'x', 'https://example.com'); raise exception 'FAIL: unknown category';
  exception when foreign_key_violation then null; end;
end $$;
reset role;

select 'verify-material-categories: OK' as result;
rollback;
