-- 2026-11-10 사용자 승인 후 운영 적용 완료: include_unread_mail_in_public_mailbox_glow
-- 함수 반환은 이글루 번호뿐이며 본문·수신자·개수는 공개하지 않는다.
create or replace function public.get_unread_mailbox_homes()
returns table(igloo_id smallint)
language sql stable security definer set search_path = '' as $$
  select p.igloo_id
  from public.comment_notifications n
  join public.projects p on p.id = n.project_id and p.owner_id = n.recipient_id
  join public.igloos i on i.id = p.igloo_id and i.owner_id = n.recipient_id
  where n.read_at is null
  union
  select i.id
  from public.mail_messages m
  join public.igloos i on i.owner_id = m.recipient_id
  where m.read_at is null;
$$;
