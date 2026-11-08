-- 등대 책장의 자료보관함. 보기는 로그인 회원 전체, 올리기·수정·삭제는 강사 계정만.
-- 분류: meeting(면담 예약) · website(웹사이트) · youtube(유튜브) · lecture(강의자료)
-- 자료는 링크 하나 또는 파일 하나(PDF·이미지). 파일은 비공개 저장소 instructor-materials에 두고 서명 URL로 연다.
-- 검증: verify-instructor-materials.sql (전부 롤백)
begin;

create table if not exists public.instructor_materials (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('meeting', 'website', 'youtube', 'lecture')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  url text check (url is null or (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]]+$')),
  file_path text check (file_path is null or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](pdf|jpg|png|webp)$'),
  file_type text check (file_type is null or file_type in ('pdf', 'image')),
  created_by uuid not null default auth.uid() references public.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((url is null) <> (file_path is null)),
  check ((file_path is null) = (file_type is null))
);
create index if not exists instructor_materials_time on public.instructor_materials(created_at desc);
alter table public.instructor_materials enable row level security;
revoke all on public.instructor_materials from public, anon, authenticated;
grant select, delete on public.instructor_materials to authenticated;
grant insert(category, title, description, url, file_path, file_type) on public.instructor_materials to authenticated;
grant update(category, title, description, url, file_path, file_type) on public.instructor_materials to authenticated;

create policy instructor_materials_read on public.instructor_materials for select to authenticated
  using ((select private.is_member()));
create policy instructor_materials_insert on public.instructor_materials for insert to authenticated
  with check ((select private.is_instructor()) and created_by = (select auth.uid()));
create policy instructor_materials_update on public.instructor_materials for update to authenticated
  using ((select private.is_instructor())) with check ((select private.is_instructor()));
create policy instructor_materials_delete on public.instructor_materials for delete to authenticated
  using ((select private.is_instructor()));

create or replace function private.touch_instructor_material() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function private.touch_instructor_material() from public, anon, authenticated;
create trigger instructor_materials_touch before update on public.instructor_materials
  for each row execute function private.touch_instructor_material();

-- 파일 저장소: 비공개, 20MB, PDF·JPEG·PNG·WebP. 경로는 <강사 id>/<uuid>.<확장자>
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('instructor-materials', 'instructor-materials', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy instructor_materials_files_read on storage.objects for select to authenticated
  using (bucket_id = 'instructor-materials' and (select private.is_member()));
create policy instructor_materials_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'instructor-materials' and (select private.is_instructor())
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy instructor_materials_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'instructor-materials' and (select private.is_instructor()));

commit;
