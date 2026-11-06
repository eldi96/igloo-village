-- 실제 회원을 읽기만 하며 권한 컨텍스트는 트랜잭션 안에서만 변경한다.
begin;
select set_config('igloo.audit_team', (select jsonb_agg(c.member_id)::text from private.chat_members c join public.members m on m.id=c.member_id where m.approved), true);
select set_config('igloo.audit_student', (select m.id::text from public.members m where m.approved and m.role='student' and not exists(select 1 from private.chat_members c where c.member_id=m.id) limit 1), true);
do $$ begin
  if jsonb_array_length(current_setting('igloo.audit_team')::jsonb) <> 4 then raise exception 'FAIL: expected four developers'; end if;
  if coalesce(current_setting('igloo.audit_student'),'')='' then raise exception 'FAIL: no approved non-developer available'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.can_view_observatory(); raise exception 'FAIL: anonymous permission check'; exception when insufficient_privilege then null; end;
  begin perform public.get_visit_experiment(7); raise exception 'FAIL: anonymous experiment'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('igloo.audit_student'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if public.can_view_observatory() then raise exception 'FAIL: non-developer entrance'; end if;
  begin perform public.get_visit_experiment(7); raise exception 'FAIL: non-developer experiment'; exception when insufficient_privilege then null; end;
  begin perform public.get_visit_counts(7); raise exception 'FAIL: non-developer counts'; exception when insufficient_privilege then null; end;
  begin perform public.get_visit_trend(7); raise exception 'FAIL: non-developer trend'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ declare developer text; payload jsonb; begin
  for developer in select jsonb_array_elements_text(current_setting('igloo.audit_team')::jsonb) loop
    perform set_config('request.jwt.claims',json_build_object('sub',developer,'role','authenticated')::text,true);
    if not public.can_view_observatory() then raise exception 'FAIL: developer entrance'; end if;
    payload:=public.get_visit_experiment(7);
    if jsonb_array_length(payload->'members')<5 then raise exception 'FAIL: missing baseline'; end if;
    perform public.get_visit_counts(7);
    perform public.get_visit_trend(7);
  end loop;
end $$;
reset role;
rollback;
