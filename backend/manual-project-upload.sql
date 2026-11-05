-- 기존 프로젝트 데이터는 유지한다. 공유 DB 관리자 검토 후 한 번 적용한다.
begin;
alter table public.projects
  add column instructions text not null default '' check (char_length(instructions) <= 5000),
  add column image_path text check (image_path is null or image_path ~ ('^' || owner_id::text || '/[0-9a-f-]+[.]jpg$'));
grant insert(instructions, image_path), update(instructions, image_path) on public.projects to authenticated;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', false, 5242880, array['image/jpeg']);
create policy project_images_insert on storage.objects for insert to authenticated
with check (bucket_id = 'project-images' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_student()));
create policy project_images_read on storage.objects for select to authenticated
using (bucket_id = 'project-images' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or exists (select 1 from public.projects p where p.image_path = name)
));
create policy project_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'project-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
