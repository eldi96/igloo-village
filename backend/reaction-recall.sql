-- 현재 프로젝트에 내가 남긴 반응 회수와 소유자의 전체 삭제.
create or replace function public.recall_project_reactions(p_project_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or not (select private.is_member()) then
    raise insufficient_privilege using message = '승인된 회원만 사용할 수 있습니다.';
  end if;
  delete from public.project_reactions r where r.project_id=p_project_id and r.member_id=(select auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.recall_project_reactions(uuid) from public, anon;
grant execute on function public.recall_project_reactions(uuid) to authenticated;

create or replace function public.clear_project_reactions(p_project_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or not (select private.is_member()) or not exists (
    select 1 from public.projects p join public.igloos i on i.id=p.igloo_id
    where p.id=p_project_id and p.owner_id=(select auth.uid()) and i.owner_id=(select auth.uid())
  ) then raise insufficient_privilege using message = '프로젝트 주인만 반응을 지울 수 있습니다.'; end if;
  delete from public.project_reactions r where r.project_id=p_project_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.clear_project_reactions(uuid) from public, anon;
grant execute on function public.clear_project_reactions(uuid) to authenticated;
