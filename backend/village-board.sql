-- IGLOO VILLAGE 익명 자유 메모 게시판 / 적용 전 팀원과 DB 변경 공유
-- 기존 테이블 또는 프로젝트 댓글을 변경하지 않음.
begin;

create table if not exists public.village_board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists village_board_posts_feed_idx
  on public.village_board_posts (created_at desc, id desc) where deleted_at is null;
create index if not exists village_board_posts_author_idx
  on public.village_board_posts (author_id);

alter table public.village_board_posts enable row level security;
-- 원본에는 author_id가 있으므로 직접 SELECT/INSERT/UPDATE/DELETE를 모두 차단한다.
revoke all on public.village_board_posts from public, anon, authenticated;

-- 반환 컬럼을 지정해 작성자 ID를 공개 API에 노출하지 않는다.
create or replace function public.list_village_board_posts(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (id uuid, content text, created_at timestamptz, is_mine boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 30 then
    raise exception '조회 개수는 1~30개여야 합니다.' using errcode = '22023';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception '커서의 날짜와 ID는 함께 지정해야 합니다.' using errcode = '22023';
  end if;
  return query
  select p.id, p.content, p.created_at,
         coalesce(p.author_id = (select auth.uid()), false) as is_mine
    from public.village_board_posts as p
   where p.deleted_at is null
     and (p_before_created_at is null or (p.created_at, p.id) < (p_before_created_at, p_before_id))
   order by p.created_at desc, p.id desc
   limit p_limit;
end;
$$;

create or replace function public.create_village_board_post(p_content text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_content text := btrim(coalesce(p_content, ''));
  v_id uuid;
begin
  if v_uid is null or not (select private.is_member()) then
    raise exception '승인된 회원만 작성할 수 있습니다.' using errcode = '42501';
  end if;
  if char_length(v_content) not between 1 and 500 then
    raise exception '메모는 1~500자로 작성해 주세요.' using errcode = '22023';
  end if;
  insert into public.village_board_posts(author_id, content)
  values (v_uid, v_content)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_village_board_post(p_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_deleted integer;
begin
  if v_uid is null or not (select private.is_member()) then
    raise exception '승인된 회원만 삭제할 수 있습니다.' using errcode = '42501';
  end if;
  update public.village_board_posts
     set deleted_at = now()
   where id = p_id and author_id = v_uid and deleted_at is null;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.list_village_board_posts(integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.create_village_board_post(text) from public, anon, authenticated;
revoke all on function public.delete_village_board_post(uuid) from public, anon, authenticated;
grant execute on function public.list_village_board_posts(integer, timestamptz, uuid) to anon, authenticated;
grant execute on function public.create_village_board_post(text) to authenticated;
grant execute on function public.delete_village_board_post(uuid) to authenticated;

commit;
