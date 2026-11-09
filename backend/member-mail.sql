-- 2026-11-09 사용자 승인 후 운영 DB 적용 완료: allow_approved_member_mail
-- 테이블·컬럼·읽기 정책 변경 없음. 기존 파일 전체 재실행 대신 이 증분만 사용.
alter policy mail_send on public.mail_messages with check (
  (select private.is_member()) and sender_id = (select auth.uid()) and exists (
    select 1 from public.igloos i join public.members m on m.id = i.owner_id
    where i.owner_id = recipient_id and m.approved
  )
);

create or replace function public.send_mail(p_recipient_ids uuid[], p_body text default '', p_link text default '') returns integer
language plpgsql security invoker set search_path = '' as $$
declare wanted integer; valid integer; sent integer;
begin
  if not private.is_member() then raise insufficient_privilege using message = '승인된 회원만 우편을 보낼 수 있습니다.'; end if;
  select count(distinct id) into wanted from unnest(p_recipient_ids) as r(id);
  if wanted < 1 or wanted > 31 or array_position(p_recipient_ids, null) is not null then
    raise invalid_parameter_value using message = '받는 회원을 선택해주세요.';
  end if;
  select count(*) into valid from public.igloos i join public.members m on m.id = i.owner_id
    where i.owner_id = any(p_recipient_ids) and m.approved;
  if valid <> wanted then raise invalid_parameter_value using message = '현재 입주한 승인 회원만 선택할 수 있습니다.'; end if;
  insert into public.mail_messages(sender_id, recipient_id, body, link)
    select auth.uid(), id, coalesce(p_body, ''), coalesce(p_link, '') from (select distinct unnest(p_recipient_ids) as id) as recipients;
  get diagnostics sent = row_count;
  return sent;
end;
$$;
