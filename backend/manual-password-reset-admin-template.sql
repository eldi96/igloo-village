-- 관리자 수동 실행용 초안. 실제 회원에게 시험하지 않는다.
-- 본인 확인 후 Supabase SQL Editor의 postgres 역할에서만 직접 실행한다.
-- 000... 자리에 관리 화면의 요청 번호(UUID)만 넣는다. 비밀번호를 SQL에 쓰지 않는다.
-- Auth 내부 비밀번호 저장소를 직접 수정하므로 DB 담당자 검토 후 사용한다.
-- 임시 비밀번호는 실제 로그인 가능하며 자동 만료/1회용이 아니다.
begin;
create temporary table manual_reset_result on commit drop as
 select r.id as request_id,r.member_id,r.login,encode(extensions.gen_random_bytes(18),'hex') as temporary_password
 from private.password_reset_requests r join public.members m on m.id=r.member_id
 join auth.users u on u.id=r.member_id
 where r.id='00000000-0000-0000-0000-000000000000'::uuid
 and r.status not in ('completed','rejected') and m.approved
 for update of r;
do $$ begin
 if (select count(*) from pg_temp.manual_reset_result)<>1 then
 raise exception '대기 중인 요청 번호와 승인 상태를 확인해 주세요.';
 end if;
end $$;
update auth.users u set encrypted_password=extensions.crypt(t.temporary_password,extensions.gen_salt('bf')),updated_at=now()
 from pg_temp.manual_reset_result t where u.id=t.member_id;
-- 실제 변경과 요청 완료를 한 트랜잭션으로 처리한다.
update private.password_reset_requests r set status='completed',token_hash=null,expires_at=null,claim=null,claimed_at=null,
 processed_by=(select id from auth.users where email='eldi@igloo-village.eldi96.github.io')
 from pg_temp.manual_reset_result t where r.id=t.request_id;
select login,temporary_password from pg_temp.manual_reset_result;
commit;
-- 결과의 임시 비밀번호는 본인에게 직접 전달하고 저장/공유/스크린샷하지 않는다.
-- SQL 결과를 보고 있는 동안은 화면에 비밀번호가 표시된다.
-- 이 절차는 기존 로그인 세션을 강제로 끊지 않는다.
