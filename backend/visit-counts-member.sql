begin;

create or replace function public.get_member_visit_counts()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  total bigint;
begin
  if uid is null or not (select private.is_member()) then
    raise insufficient_privilege
      using message = '승인된 회원만 조회할 수 있습니다.';
  end if;

  select coalesce(sum(d.visit_count), 0)
  into total
  from public.daily_visits d
  where d.member_id = uid;

  return total;
end;
$$;

revoke all on function public.get_member_visit_counts()
from public, anon, authenticated;

grant execute on function public.get_member_visit_counts()
to authenticated;

commit;