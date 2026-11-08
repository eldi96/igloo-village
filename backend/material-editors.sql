-- 자료보관함 담당자 명단. 강사 계정 외에 이 명단에 든 계정도 자료를 올리고·고치고·지울 수 있다.
-- instructor-materials.sql 다음에 실행한다. 처음 명단: eldi(사용자 요청, 강사 계정이 생기기 전 시험·관리용).
-- 빼려면: delete from private.material_editors where member_id = (select id from auth.users where email = '<아이디>@igloo-village.eldi96.github.io');
begin;

create table if not exists private.material_editors (
  member_id uuid primary key references public.members(id) on delete cascade
);
revoke all on private.material_editors from public, anon, authenticated;
insert into private.material_editors(member_id)
select u.id from auth.users u join public.members m on m.id = u.id
 where u.email = 'eldi@igloo-village.eldi96.github.io' and m.approved
on conflict do nothing;

create or replace function private.can_edit_materials() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_instructor()) or exists (
    select 1 from private.material_editors e join public.members m on m.id = e.member_id
     where e.member_id = (select auth.uid()) and m.approved
  );
$$;
revoke all on function private.can_edit_materials() from public, anon;
grant execute on function private.can_edit_materials() to authenticated;

-- 버튼 표시용. 실제 권한은 아래 정책이 다시 검사한다.
create or replace function public.can_edit_materials() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (select private.can_edit_materials());
$$;
revoke all on function public.can_edit_materials() from public, anon;
grant execute on function public.can_edit_materials() to authenticated;

drop policy if exists instructor_materials_insert on public.instructor_materials;
drop policy if exists instructor_materials_update on public.instructor_materials;
drop policy if exists instructor_materials_delete on public.instructor_materials;
create policy instructor_materials_insert on public.instructor_materials for insert to authenticated
  with check ((select private.can_edit_materials()) and created_by = (select auth.uid()));
create policy instructor_materials_update on public.instructor_materials for update to authenticated
  using ((select private.can_edit_materials())) with check ((select private.can_edit_materials()));
create policy instructor_materials_delete on public.instructor_materials for delete to authenticated
  using ((select private.can_edit_materials()));

drop policy if exists instructor_materials_files_insert on storage.objects;
drop policy if exists instructor_materials_files_delete on storage.objects;
create policy instructor_materials_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'instructor-materials' and (select private.can_edit_materials())
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy instructor_materials_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'instructor-materials' and (select private.can_edit_materials()));

commit;
