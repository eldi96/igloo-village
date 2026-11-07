-- 익명 메모 게시판 운영자 삭제. 운영자는 개발팀(private.chat_members)과 강사 계정이다.
-- 작성 횟수 제한과 신고 기능은 넣지 않는다(임시 게시판).
begin;

-- 누가 지웠는지 남긴다. 목록 RPC는 이 값을 반환하지 않는다.
alter table public.village_board_posts
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create or replace function private.can_moderate_village_board() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_chat() or private.is_instructor();
$$;
revoke all on function private.can_moderate_village_board() from public, anon;
grant execute on function private.can_moderate_village_board() to authenticated;

-- 화면이 운영자 삭제 버튼을 보여줄지 정할 때 쓴다. 실제 권한은 삭제 RPC가 다시 검사한다.
create or replace function public.can_moderate_village_board() returns boolean
language sql stable set search_path = '' as $$
  select private.can_moderate_village_board();
$$;
revoke all on function public.can_moderate_village_board() from public, anon;
grant execute on function public.can_moderate_village_board() to authenticated;

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
     set deleted_at = now(), deleted_by = v_uid
   where id = p_id and deleted_at is null
     and (author_id = v_uid or (select private.can_moderate_village_board()));
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

commit;
