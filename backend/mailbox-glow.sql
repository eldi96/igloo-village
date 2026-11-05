-- 알림 본문·수신자·개수는 공개하지 않고 점등할 이글루 ID만 반환한다.
create function public.get_unread_mailbox_homes()
returns table(igloo_id smallint)
language sql stable security definer set search_path = '' as $$
  select distinct p.igloo_id
  from public.comment_notifications n
  join public.projects p on p.id = n.project_id and p.owner_id = n.recipient_id
  join public.igloos i on i.id = p.igloo_id and i.owner_id = n.recipient_id
  where n.read_at is null;
$$;
revoke all on function public.get_unread_mailbox_homes() from public, anon, authenticated;
grant execute on function public.get_unread_mailbox_homes() to anon, authenticated;
