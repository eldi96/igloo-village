-- 자료보관함 분류를 강사(또는 자료 담당)가 직접 추가·이름 바꾸기·삭제할 수 있게 한다.
-- instructor-materials.sql, material-editors.sql 다음에 실행한다. 기본 분류 4개는 그대로 들어간다.
-- 자료가 남아 있는 분류는 지울 수 없다(on delete restrict). 검증: verify-material-categories.sql(롤백)
begin;

create table if not exists public.material_categories (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  label text not null check (char_length(btrim(label)) between 1 and 20),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
create unique index if not exists material_categories_label on public.material_categories (lower(btrim(label)));
insert into public.material_categories(id, label, sort_order) values
  ('meeting', '면담 예약', 10), ('website', '웹사이트', 20), ('youtube', '유튜브', 30), ('lecture', '강의자료', 40)
on conflict (id) do nothing;

alter table public.material_categories enable row level security;
revoke all on public.material_categories from public, anon, authenticated;
grant select, delete on public.material_categories to authenticated;
grant insert(id, label, sort_order) on public.material_categories to authenticated;
grant update(label, sort_order) on public.material_categories to authenticated;
create policy material_categories_read on public.material_categories for select to authenticated
  using ((select private.is_member()));
create policy material_categories_insert on public.material_categories for insert to authenticated
  with check ((select private.can_edit_materials()));
create policy material_categories_update on public.material_categories for update to authenticated
  using ((select private.can_edit_materials())) with check ((select private.can_edit_materials()));
create policy material_categories_delete on public.material_categories for delete to authenticated
  using ((select private.can_edit_materials()));

-- 자료의 분류는 고정 목록 대신 분류 테이블을 따른다.
alter table public.instructor_materials drop constraint if exists instructor_materials_category_check;
alter table public.instructor_materials drop constraint if exists instructor_materials_category_fkey;
alter table public.instructor_materials add constraint instructor_materials_category_fkey
  foreign key (category) references public.material_categories(id) on update cascade on delete restrict;

commit;
