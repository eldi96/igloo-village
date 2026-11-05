-- 새 댓글부터 프로젝트 주인에게 알림을 만든다. 기존 우편 테이블은 변경하지 않는다.
create table public.comment_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.members(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 comment_id uuid not null unique references public.project_comments(id) on delete cascade,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index comment_notifications_unread on public.comment_notifications(recipient_id,created_at desc) where read_at is null;
create index comment_notifications_project on public.comment_notifications(project_id);
alter table public.comment_notifications enable row level security;
revoke all on public.comment_notifications from public,anon,authenticated;
grant select on public.comment_notifications to authenticated;
grant update(read_at) on public.comment_notifications to authenticated;
create policy comment_notifications_read on public.comment_notifications for select to authenticated
using (recipient_id=(select auth.uid()) and (select private.is_member()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy comment_notifications_mark_read on public.comment_notifications for update to authenticated
using (recipient_id=(select auth.uid()) and (select private.is_member()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())))
with check (recipient_id=(select auth.uid()) and (select private.is_member()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
-- 브라우저에 타인 알림 생성 권한을 주지 않고 비공개 트리거만 알림을 생성한다.
create function private.notify_project_comment() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 if TG_OP='INSERT' then
   select owner_id into owner from public.projects where id=NEW.project_id;
   if owner is not null and owner<>NEW.member_id then
     insert into public.comment_notifications(recipient_id,project_id,comment_id) values(owner,NEW.project_id,NEW.id);
   end if;
 elsif NEW.deleted_at is not null and OLD.deleted_at is null then
   delete from public.comment_notifications where comment_id=NEW.id;
 end if;
 return NEW;
end $$;
revoke all on function private.notify_project_comment() from public,anon,authenticated;
create trigger notify_project_comment after insert or update of deleted_at on public.project_comments
for each row execute function private.notify_project_comment();
alter publication supabase_realtime add table public.comment_notifications;
