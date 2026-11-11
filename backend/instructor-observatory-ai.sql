-- 운영 DB 적용 완료: allow_instructor_observatory_and_ai_summary. 재실행 금지.
create or replace function public.can_view_observatory() returns boolean language sql stable set search_path='' as $$ select private.can_chat() or private.is_instructor(); $$;
create or replace function private.can_run_ai_summary() returns boolean language sql stable security definer set search_path='' as $$ select private.is_instructor() or exists (select 1 from private.ai_summary_admins where member_id=(select auth.uid())); $$;
do $block$ declare f record; definition text; checked integer:=0; begin
for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('aggregate_visit_counts','aggregate_visit_trend','read_visit_experiment') and pg_get_function_identity_arguments(p.oid)='p_days integer'
loop definition:=pg_get_functiondef(f.oid); if position('if not private.can_chat() then' in definition)=0 then raise exception 'unexpected permission check in %',f.proname; end if; execute replace(definition,'if not private.can_chat() then','if not (private.can_chat() or private.is_instructor()) then'); checked:=checked+1; end loop;
if checked<>3 then raise exception 'expected three visit functions, found %',checked; end if;
end $block$;
