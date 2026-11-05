-- 기존 댓글은 보존하고 답글 연결과 삭제 표시만 추가한다.
alter table public.project_comments
  add column parent_id uuid references public.project_comments(id) on delete cascade,
  add column deleted_at timestamptz;
alter table public.project_comments drop constraint project_comments_body_check;
alter table public.project_comments add constraint project_comments_body_check check (
  (deleted_at is null and char_length(body) between 1 and 1000 and btrim(body) <> '')
  or (deleted_at is not null and body = '')
);
create index project_comments_parent_time on public.project_comments(parent_id, created_at);

-- 호출자 권한으로 검사하며, 댓글 수정 권한을 삭제 처리로만 제한한다.
create function private.guard_project_comment_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare parent public.project_comments%rowtype;
begin
  if TG_OP = 'INSERT' then
    if NEW.deleted_at is not null then
      raise exception '삭제된 상태로 댓글을 등록할 수 없어요.' using errcode = '23514';
    end if;
    if NEW.parent_id is not null then
      select * into parent from public.project_comments where id = NEW.parent_id;
      if not found or parent.project_id <> NEW.project_id or parent.parent_id is not null or parent.deleted_at is not null then
        raise exception '같은 프로젝트의 삭제되지 않은 원댓글에만 답글을 남길 수 있어요.' using errcode = '23514';
      end if;
    end if;
  else
    if NEW.id is distinct from OLD.id or NEW.project_id is distinct from OLD.project_id
      or NEW.member_id is distinct from OLD.member_id or NEW.parent_id is distinct from OLD.parent_id
      or NEW.created_at is distinct from OLD.created_at
      or OLD.deleted_at is not null or NEW.deleted_at is null or NEW.body <> '' then
      raise exception '댓글은 삭제 처리만 할 수 있어요.' using errcode = '23514';
    end if;
    NEW.deleted_at := now();
  end if;
  return NEW;
end $$;
revoke all on function private.guard_project_comment_write() from public, anon, authenticated;
create trigger guard_project_comment_write before insert or update on public.project_comments
for each row execute function private.guard_project_comment_write();

grant insert(parent_id) on public.project_comments to authenticated;
grant update(body, deleted_at) on public.project_comments to authenticated;
create policy project_comments_soft_delete on public.project_comments for update to authenticated
using (member_id = (select auth.uid()) and (select private.is_member())
  and exists (select 1 from public.projects p where p.id = project_id))
with check (member_id = (select auth.uid()) and (select private.is_member())
  and exists (select 1 from public.projects p where p.id = project_id));
