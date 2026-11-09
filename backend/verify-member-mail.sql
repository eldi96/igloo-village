begin;
select set_config('mail.test_a',gen_random_uuid()::text,true),set_config('mail.test_b',gen_random_uuid()::text,true),set_config('mail.test_c',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) select current_setting(k)::uuid,current_setting(k)||'@igloo.test','authenticated','authenticated' from unnest(array['mail.test_a','mail.test_b','mail.test_c']) as k;
insert into public.members(id,display_name,role,approved) values
(current_setting('mail.test_a')::uuid,'검증 A','student',true),(current_setting('mail.test_b')::uuid,'검증 B','student',true),(current_setting('mail.test_c')::uuid,'검증 C','student',false);
update public.igloos set owner_id=current_setting('mail.test_b')::uuid, claimed_at=now() where id=30;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('mail.test_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare sent integer; begin
select public.send_mail(array[current_setting('mail.test_b')::uuid,current_setting('mail.test_b')::uuid],'롤백 시험','https://example.com') into sent;
if sent<>1 then raise exception '중복 수신자 처리 실패'; end if;
begin perform public.send_mail(array[current_setting('mail.test_c')::uuid],'실패해야 함','');raise exception '잘못된 수신자 허용';exception when invalid_parameter_value then null;end;
begin insert into public.mail_messages(sender_id,recipient_id,body) values(current_setting('mail.test_b')::uuid,current_setting('mail.test_b')::uuid,'위조');raise exception '발신자 위조 허용';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('mail.test_b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
if (select count(*) from public.mail_messages)<>1 then raise exception '수신함 접근 실패';end if;
update public.mail_messages set read_at=now() where recipient_id=auth.uid();
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('mail.test_c'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
if exists(select 1 from public.mail_messages) then raise exception '타인 우편 노출';end if;
begin perform public.send_mail(array[current_setting('mail.test_b')::uuid],'거부돼야 함','');raise exception '미승인 발송 허용';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
begin perform public.send_mail(array[current_setting('mail.test_b')::uuid],'거부돼야 함','');raise exception '익명 발송 허용';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: 승인 학생 발송, 중복 제거, 수신자 검증, 발신자 위조 차단, 수신함 격리, 읽음, 미승인·익명 차단 (전체 롤백)' as result;
