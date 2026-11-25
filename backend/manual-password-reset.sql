-- 2026-11-25 운영 적용 완료: switch_to_manual_password_reset. 기존 password-reset.sql 이후의 전환용.
-- 테이블/기록/회원 비밀번호를 삭제하거나 변경하지 않는다.
-- 이전 자동 발급 API의 DB 실행 권한을 닫는다.
revoke all on function public.password_reset_rate_limit(text,text), public.request_password_reset(text), public.password_reset_admin_authorized(uuid), public.list_password_reset_requests(uuid), public.issue_password_reset(uuid,text,uuid), public.reject_password_reset(uuid,uuid), public.claim_password_reset(text,text,text), public.finish_password_reset(text,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.request_manual_password_reset(p_login text) returns void
language plpgsql security definer set search_path='' as $$
declare count_hits integer;
begin
 -- 서버/IP 제한 대신 DB의 전체 요청 한도를 둔다(알 수 없는 아이디도 동일 응답).
 insert into private.password_reset_limits as t values('manual-global','request',1,now())
 on conflict(bucket,action) do update set hits=case when t.started_at<now()-interval '1 hour' then 1 else t.hits+1 end,
 started_at=case when t.started_at<now()-interval '1 hour' then now() else t.started_at end returning hits into count_hits;
 if count_hits>100 then return;end if;
 -- 기존 함수의 형식 검사·승인 회원 검사·15분 간격·계정당 대기 요청 1개 제한을 유지.
 -- 호출자는 아이디 존재 여부를 알 수 없고 비밀번호/임시값을 변경할 수 없다.
 perform public.request_password_reset(lower(trim(p_login)));
end $$;
revoke all on function public.request_manual_password_reset(text) from public,anon,authenticated,service_role;
grant execute on function public.request_manual_password_reset(text) to anon,authenticated;

create or replace function public.list_manual_password_reset_requests()
returns table(id uuid,login text,display_name text,status text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 -- 클라이언트가 전달한 관리자 ID가 아니라 검증된 로그인 ID로 판정.
 if auth.uid() is distinct from 'f5c056bb-0428-4b89-834c-b849921816f6'::uuid or not coalesce(private.is_password_reset_admin(auth.uid()),false) then raise insufficient_privilege;end if;
 return query select r.id,r.login,m.display_name,r.status,r.created_at
 from private.password_reset_requests r join public.members m on m.id=r.member_id
 order by (r.status not in ('completed','rejected')) desc,r.created_at desc,r.id limit 100;
end $$;
revoke all on function public.list_manual_password_reset_requests() from public,anon,authenticated,service_role;
grant execute on function public.list_manual_password_reset_requests() to authenticated;

create or replace function public.resolve_manual_password_reset(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is distinct from 'f5c056bb-0428-4b89-834c-b849921816f6'::uuid or not coalesce(private.is_password_reset_admin(auth.uid()),false) then raise insufficient_privilege;end if;
 if p_status is null or p_status not in ('completed','rejected') then raise invalid_parameter_value;end if;
 -- 상태 표시만 변경. Auth 비밀번호나 세션에는 접근하지 않는다.
 update private.password_reset_requests set status=p_status,processed_by=auth.uid(),token_hash=null,expires_at=null,claim=null,claimed_at=null
 where id=p_id and status not in ('completed','rejected');
 if not found then raise exception '처리할 대기 요청이 없어요.' using errcode='P0002';end if;
end $$;
revoke all on function public.resolve_manual_password_reset(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_manual_password_reset(uuid,text) to authenticated;
