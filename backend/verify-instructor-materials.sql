-- 자료보관함 권한 검사. 임시 계정과 자료는 트랜잭션 안에서만 만들고 전부 롤백한다.
begin;
select set_config('igloo.mat_s', gen_random_uuid()::text, true),
       set_config('igloo.mat_i', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role)
values (current_setting('igloo.mat_s')::uuid, 'mat-s@igloo.test', 'authenticated', 'authenticated'),
       (current_setting('igloo.mat_i')::uuid, 'mat-i@igloo.test', 'authenticated', 'authenticated');
insert into public.members(id, display_name, role, approved)
values (current_setting('igloo.mat_s')::uuid, '검증 수강생', 'student', true),
       (current_setting('igloo.mat_i')::uuid, '검증 강사', 'instructor', true);

-- 수강생은 못 올린다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.mat_s'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin
    insert into public.instructor_materials(category, title, url) values ('website', 'x', 'https://example.com');
    raise exception 'FAIL: student inserted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 강사는 링크 자료를 올리고, 링크와 파일을 함께 넣거나 모르는 분류는 거부된다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.mat_i'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  insert into public.instructor_materials(category, title, url) values ('youtube', '검증 영상', 'https://www.youtube.com/watch?v=abc');
  begin
    insert into public.instructor_materials(category, title, url, file_path, file_type)
    values ('lecture', 'x', 'https://example.com', current_setting('igloo.mat_i') || '/' || gen_random_uuid() || '.pdf', 'pdf');
    raise exception 'FAIL: link and file together';
  exception when check_violation then null; end;
  begin
    insert into public.instructor_materials(category, title, url) values ('etc', 'x', 'https://example.com');
    raise exception 'FAIL: unknown category';
  exception when check_violation then null; end;
end $$;
reset role;

-- 수강생은 읽을 수 있지만 고치거나 지울 수 없다(조용히 0행).
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.mat_s'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare n integer; begin
  if (select count(*) from public.instructor_materials where title = '검증 영상') <> 1 then raise exception 'FAIL: student cannot read'; end if;
  update public.instructor_materials set title = '바꿈' where title = '검증 영상'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student updated'; end if;
  delete from public.instructor_materials where title = '검증 영상'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student deleted'; end if;
end $$;
reset role;

-- 로그아웃 상태(anon)는 아무것도 못 본다.
set local role anon;
do $$ begin
  begin perform 1 from public.instructor_materials; raise exception 'FAIL: anon read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 강사는 고치고 지운다.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('igloo.mat_i'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare n integer; begin
  update public.instructor_materials set category = 'lecture' where title = '검증 영상'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: instructor update'; end if;
  delete from public.instructor_materials where title = '검증 영상'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: instructor delete'; end if;
end $$;
reset role;

select 'verify-instructor-materials: OK' as result;
rollback;
